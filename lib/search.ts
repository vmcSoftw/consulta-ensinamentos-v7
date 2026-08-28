import { pool } from '@/lib/db';

export const STOPWORDS = new Set([
  'a','o','as','os','um','uma','uns','umas','de','da','do','das','dos','e','em','no','na','nos','nas',
  'por','para','com','sem','que','qual','quais','como','onde','quando','sobre','tem','ha','há','existe','existem',
  'falar','fala','falam','ensina','ensinam','ensinamento','ensinamentos','topico','topicos','tópico','tópicos','assunto',
  'segundo','diz','dizer','pode','podem','deve','devem','porque','porquê','ser','sao','são','esta','está','estao','estão'
]);

export function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function queryKeys(q: string) {
  const normalized = normalize(q);
  const tokens = normalized.split(/[^a-z0-9]+/i).filter(x => x.length >= 3 && !STOPWORDS.has(x));
  const keys = new Set(tokens);
  if (normalized.length >= 3 && normalized.length <= 60) keys.add(normalized);
  return [...keys].slice(0, 20);
}

function normalizedSql(column: string) {
  return `lower(translate(${column},
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))`;
}

export type SearchOptions = {
  year?: number | null;
  category?: string | null;
  type?: string | null;
  sort?: 'relevance' | 'recent' | 'oldest' | string;
  limit?: number;
  offset?: number;
  includeContent?: boolean;
};

export async function searchArchive(q: string, options: SearchOptions = {}) {
  const clean = q.trim();
  if (!clean) return { items: [], total: 0, expandedTerms: [], hasMore: false };

  const year = options.year ?? null;
  const category = options.category || '';
  const type = options.type || '';
  const sort = options.sort || 'relevance';
  const limit = Math.min(Math.max(Number(options.limit || 30), 1), 5000);
  const offset = Math.max(Number(options.offset || 0), 0);

  const keys = queryKeys(clean);
  const synonymRows = keys.length
    ? (await pool.query(
        `SELECT DISTINCT related_term AS term
         FROM search_synonyms
         WHERE term = ANY($1::text[])
         ORDER BY related_term`,
        [keys]
      )).rows
    : [];

  const synonyms = synonymRows.map((r: { term: string }) => r.term);
  const usefulTokens = clean
    .split(/\s+/)
    .map(x => x.replace(/[^\p{L}\p{N}-]/gu, ''))
    .filter(x => x.length >= 3 && !STOPWORDS.has(normalize(x)));

  const expandedTerms = [...new Set([clean, ...usefulTokens, ...synonyms])].filter(Boolean).slice(0, 40);
  const normalizedTerms = [...new Set(expandedTerms.map(normalize).filter(x => x.length >= 2))];
  const patterns = normalizedTerms.map(x => `%${x}%`);

  // A consulta digitada pelo usuário recebe peso maior que sinônimos/termos relacionados.
  // Isso evita que uma ocorrência indireta no conteúdo apareça antes de um tópico
  // cujo título, categoria ou palavras-chave correspondem diretamente à pesquisa.
  const directTerms = [...new Set([normalize(clean), ...usefulTokens.map(normalize)])]
    .filter(x => x.length >= 2);
  const directPatterns = directTerms.map(x => `%${x}%`);

  const titleNorm = normalizedSql('t.title');
  const contentNorm = normalizedSql('t.content');
  const keywordNorm = normalizedSql('kw');
  const sourceTypeNorm = normalizedSql('s.source_type');
  const sourceTitleNorm = normalizedSql('s.title');
  const categoryNorm = normalizedSql('t.category');

  const params: unknown[] = [clean, normalize(clean), patterns, directPatterns];
  const where: string[] = [
    `(
      to_tsvector('portuguese'::regconfig, coalesce(t.title,'') || ' ' || coalesce(t.content,''))
        @@ websearch_to_tsquery('portuguese'::regconfig, $1)
      OR ${titleNorm} = $2
      OR ${titleNorm} LIKE ANY($3::text[])
      OR ${contentNorm} LIKE ANY($3::text[])
      OR ${sourceTypeNorm} = $2
      OR ${sourceTypeNorm} LIKE ANY($3::text[])
      OR ${sourceTitleNorm} LIKE ANY($3::text[])
      OR ${categoryNorm} LIKE ANY($3::text[])
      OR EXISTS (SELECT 1 FROM unnest(t.keywords) kw WHERE ${keywordNorm} LIKE ANY($3::text[]))
      OR ${titleNorm} LIKE ANY($4::text[])
      OR ${contentNorm} LIKE ANY($4::text[])
      OR ${categoryNorm} LIKE ANY($4::text[])
    )`
  ];

  if (year) {
    params.push(Number(year));
    where.push(`s.year = $${params.length}`);
  }
  if (category) {
    params.push(category);
    where.push(`t.category = $${params.length}`);
  }
  if (type) {
    params.push(type);
    where.push(`s.source_type = $${params.length}`);
  }

  const total = (await pool.query(`
    SELECT count(*)::int AS total
    FROM topics t
    JOIN source_sections s ON s.id = t.source_section_id
    WHERE ${where.join(' AND ')}`, params)).rows[0].total;

  const orderBy = sort === 'recent'
    ? 'year DESC NULLS LAST, page_start DESC, score DESC'
    : sort === 'oldest'
      ? 'year ASC NULLS LAST, page_start ASC, score DESC'
      : 'score DESC, year DESC NULLS LAST, page_start ASC';

  params.push(limit, offset);
  const contentSelect = options.includeContent ? ', t.content, t.keywords' : '';

  const items = (await pool.query(`
    SELECT * FROM (
      SELECT
        t.id,
        s.year,
        s.source_type,
        t.topic_number,
        t.title,
        t.page_start,
        t.page_end,
        t.category,
        s.id AS source_id,
        s.title AS source_title_full,
        left(regexp_replace(t.content, '\\s+', ' ', 'g'), 460) AS excerpt
        ${contentSelect},
        (
          /* Correspondência direta: prioridade máxima */
          CASE WHEN ${titleNorm} = $2 THEN 140 ELSE 0 END +
          CASE WHEN ${sourceTypeNorm} = $2 THEN 130 ELSE 0 END +
          CASE WHEN ${titleNorm} LIKE ANY($4::text[]) THEN 90 ELSE 0 END +
          CASE WHEN ${categoryNorm} LIKE ANY($4::text[]) THEN 75 ELSE 0 END +
          CASE WHEN EXISTS (SELECT 1 FROM unnest(t.keywords) kw WHERE ${keywordNorm} LIKE ANY($4::text[])) THEN 65 ELSE 0 END +
          CASE WHEN ${sourceTypeNorm} LIKE ANY($4::text[]) THEN 60 ELSE 0 END +
          CASE WHEN ${sourceTitleNorm} LIKE ANY($4::text[]) THEN 55 ELSE 0 END +
          CASE WHEN ${contentNorm} LIKE ANY($4::text[]) THEN 22 ELSE 0 END +
          ts_rank_cd(
            setweight(to_tsvector('portuguese'::regconfig, coalesce(t.title,'')), 'A') ||
            setweight(to_tsvector('portuguese'::regconfig, coalesce(t.category,'')), 'B') ||
            setweight(to_tsvector('portuguese'::regconfig, coalesce(t.content,'')), 'D'),
            websearch_to_tsquery('portuguese'::regconfig, $1)
          ) * 45 +

          /* Termos relacionados/sinônimos: ajudam a descobrir, mas com peso menor */
          CASE WHEN ${titleNorm} LIKE ANY($3::text[]) THEN 16 ELSE 0 END +
          CASE WHEN ${categoryNorm} LIKE ANY($3::text[]) THEN 13 ELSE 0 END +
          CASE WHEN EXISTS (SELECT 1 FROM unnest(t.keywords) kw WHERE ${keywordNorm} LIKE ANY($3::text[])) THEN 11 ELSE 0 END +
          CASE WHEN ${sourceTypeNorm} LIKE ANY($3::text[]) THEN 9 ELSE 0 END +
          CASE WHEN ${sourceTitleNorm} LIKE ANY($3::text[]) THEN 8 ELSE 0 END +
          CASE WHEN ${contentNorm} LIKE ANY($3::text[]) THEN 3 ELSE 0 END
        ) AS score,
        CASE
          WHEN ${titleNorm} = $2 OR ${titleNorm} LIKE ANY($4::text[]) THEN 'Título'
          WHEN ${categoryNorm} LIKE ANY($4::text[]) THEN 'Categoria'
          WHEN EXISTS (SELECT 1 FROM unnest(t.keywords) kw WHERE ${keywordNorm} LIKE ANY($4::text[])) THEN 'Palavra-chave'
          WHEN ${sourceTypeNorm} = $2 OR ${sourceTypeNorm} LIKE ANY($4::text[]) OR ${sourceTitleNorm} LIKE ANY($4::text[]) THEN 'Fonte'
          WHEN ${contentNorm} LIKE ANY($4::text[]) THEN 'Conteúdo'
          ELSE 'Termo relacionado'
        END AS match_hint
      FROM topics t
      JOIN source_sections s ON s.id = t.source_section_id
      WHERE ${where.join(' AND ')}
    ) ranked
    ORDER BY ${orderBy}
    LIMIT $${params.length - 1} OFFSET $${params.length}`, params)).rows;

  return {
    items,
    total,
    expandedTerms,
    hasMore: offset + items.length < total
  };
}
