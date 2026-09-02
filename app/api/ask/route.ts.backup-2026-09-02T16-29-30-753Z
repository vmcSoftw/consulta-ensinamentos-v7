import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { normalize, STOPWORDS, searchArchive } from '@/lib/search';

export const runtime = 'nodejs';

type AskSort = 'relevance' | 'oldest' | 'recent';

type Candidate = {
  id: number;
  year: number | null;
  source_type: string;
  topic_number?: string | null;
  title: string;
  page_start: number;
  page_end?: number;
  category?: string;
  source_id?: number;
  source_title_full: string;
  excerpt?: string;
  content: string;
  keywords?: string[];
  score?: number;
  intent_score?: number;
  strict_match?: boolean;
};

function teachingIdentity(item: Pick<Candidate, 'title' | 'year' | 'source_type' | 'page_start' | 'source_title_full'>) {
  return [
    normalize(String(item.title || '')),
    String(item.year ?? ''),
    normalize(String(item.source_type || '')),
    String(item.page_start ?? ''),
    normalize(String(item.source_title_full || ''))
  ].join('|');
}

function coreQuestionTerms(question: string) {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const raw of question.toLocaleLowerCase('pt-BR').split(/[^\p{L}\p{N}-]+/u)) {
    const key = normalize(raw);
    if (key.length < 3 || STOPWORDS.has(key) || seen.has(key)) continue;
    seen.add(key);
    terms.push(raw);
  }

  return terms.slice(0, 12);
}

function sentenceCandidates(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?;:])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/u)
    .map(s => s.trim())
    .filter(s => s.length >= 35 && s.length <= 1000);
}

function stemLite(value: string) {
  let n = normalize(value).replace(/[^a-z0-9]/g, '');
  if (n.length <= 4) return n;

  const endings = [
    'amentos','imentos','acoes','icoes','amento','imento','acao','icao',
    'mente','adores','adoras','ador','adora','idades','idade',
    'ariam','eriam','iriam','ando','endo','indo','avam','iam',
    'ais','eis','ois','oes','es','os','as','am','em','ar','er','ir','s'
  ];
  for (const ending of endings) {
    if (n.endsWith(ending) && n.length - ending.length >= 4) {
      n = n.slice(0, -ending.length);
      break;
    }
  }
  return n;
}

function hasConcept(text: string, term: string) {
  const nText = normalize(text);
  const nTerm = normalize(term);
  if (!nTerm) return false;
  if (nText.includes(nTerm)) return true;

  const root = stemLite(term);
  if (root.length < 4) return false;
  return nText.split(/[^a-z0-9]+/).some(word => word.startsWith(root));
}

function scoreSentence(sentence: string, coreTerms: string[], relatedTerms: string[]) {
  const directHits = coreTerms.filter(term => hasConcept(sentence, term));
  const relatedHits = relatedTerms.filter(term => !coreTerms.some(core => normalize(core) === normalize(term)) && hasConcept(sentence, term));
  const normalizedSentence = normalize(sentence);
  const phrase = normalize(coreTerms.join(' '));

  let score = directHits.length * 18 + Math.min(relatedHits.length, 5) * 2;
  if (phrase.length >= 5 && normalizedSentence.includes(phrase)) score += 25;
  if (directHits.length === coreTerms.length && coreTerms.length > 1) score += 35;

  return { score, directHits };
}

async function strictIntentSearch(coreTerms: string[]) {
  if (!coreTerms.length) return { rows: [] as Candidate[], total: 0 };

  const coreQuery = coreTerms.join(' ');
  const vector = `
    setweight(to_tsvector('portuguese'::regconfig, coalesce(t.title,'')), 'A') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce(t.category,'')), 'B') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce(array_to_string(t.keywords, ' '),'')), 'B') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce(s.source_type,'') || ' ' || coalesce(s.title,'')), 'C') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce(t.content,'')), 'D')
  `;

  const { rows } = await pool.query(`
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
      left(regexp_replace(t.content, '\\s+', ' ', 'g'), 460) AS excerpt,
      t.content,
      t.keywords,
      ts_rank_cd((${vector}), plainto_tsquery('portuguese'::regconfig, $1)) * 100 AS intent_score,
      count(*) OVER()::int AS strict_total
    FROM topics t
    JOIN source_sections s ON s.id = t.source_section_id
    WHERE (${vector}) @@ plainto_tsquery('portuguese'::regconfig, $1)
    ORDER BY intent_score DESC, s.year DESC NULLS LAST, t.page_start ASC
    LIMIT 80
  `, [coreQuery]);

  return {
    rows: rows.map((row: any) => ({ ...row, strict_match: true })) as Candidate[],
    total: rows.length ? Number(rows[0].strict_total || 0) : 0
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = String(body.question || '').trim();
    const requestedSort = String(body.sort || 'relevance');
    const sort: AskSort = requestedSort === 'oldest' || requestedSort === 'recent' ? requestedSort : 'relevance';

    if (question.length < 3) {
      return NextResponse.json({ error: 'Digite uma pergunta com pelo menos 3 caracteres.' }, { status: 400 });
    }

    const coreTerms = coreQuestionTerms(question);
    if (!coreTerms.length) {
      return NextResponse.json({ error: 'Inclua na pergunta pelo menos um termo específico do assunto que deseja consultar.' }, { status: 400 });
    }

    // 1) Primeiro tenta localizar documentos em que TODOS os conceitos principais
    // da pergunta estejam presentes, usando a análise linguística do PostgreSQL.
    const strict = await strictIntentSearch(coreTerms);

    // 2) Em paralelo, faz uma busca ampliada para sinônimos e termos relacionados.
    // Ela serve como complemento, nunca como prioridade sobre a intenção completa.
    const broad = await searchArchive(question, { limit: 120, sort: 'relevance', includeContent: true });

    const merged = new Map<number, Candidate>();
    for (const row of strict.rows) merged.set(Number(row.id), row);
    for (const row of broad.items as any[]) {
      const id = Number(row.id);
      if (!merged.has(id)) merged.set(id, { ...row, id, strict_match: false });
    }

    const relatedTerms = [...new Set((broad.expandedTerms || []).filter(Boolean))].slice(0, 40);

    const rankedCandidates = [...merged.values()].map(item => {
      const haystack = [
        item.title,
        item.category || '',
        item.source_type,
        item.source_title_full,
        ...(item.keywords || []),
        item.content || ''
      ].join(' ');

      const matchedTerms = item.strict_match
        ? [...coreTerms]
        : coreTerms.filter(term => hasConcept(haystack, term));
      const coverage = coreTerms.length ? matchedTerms.length / coreTerms.length : 0;
      const intentScore = Number(item.intent_score || 0);
      const archiveScore = Number(item.score || 0);

      return {
        ...item,
        matchedTerms,
        coverage,
        combinedScore:
          (item.strict_match ? 1000 : 0) +
          coverage * 500 +
          intentScore +
          Math.min(archiveScore, 400)
      };
    })
    // Para perguntas com vários conceitos, elimina respostas muito vagas.
    .filter(item => item.strict_match || coreTerms.length === 1 || item.coverage >= 0.5)
    .sort((a, b) => b.combinedScore - a.combinedScore);

    // Um mesmo ensinamento pode produzir mais de um registro/trecho no acervo.
    // Mantemos apenas a melhor ocorrência por título + fonte + ano + página.
    const candidates = [...new Map(
      rankedCandidates.map(item => [teachingIdentity(item), item])
    ).values()];

    const evidence: Array<{
      topicId: number;
      title: string;
      year: number | null;
      sourceType: string;
      sourceTitle: string;
      page: number;
      text: string;
      score: number;
      coverage: number;
      matchedTerms: string[];
      strictMatch: boolean;
    }> = [];

    for (const item of candidates.slice(0, 50)) {
      const text = String(item.content || '');
      const sentencePool = sentenceCandidates(text);
      const ranked = sentencePool
        .map(sentence => ({ sentence, ...scoreSentence(sentence, coreTerms, relatedTerms) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.directHits.length - a.directHits.length || b.score - a.score)
        .slice(0, 4);

      let excerptText = String(item.excerpt || '').trim();
      let excerptScore = 0;

      if (ranked.length) {
        // Exibe um único card por ensinamento. Se uma segunda frase acrescentar
        // um conceito que não apareceu na primeira, ela é incorporada ao mesmo card.
        const selected = [ranked[0]];
        const covered = new Set(ranked[0].directHits.map(normalize));

        for (const candidate of ranked.slice(1)) {
          const introducesNewConcept = candidate.directHits.some(term => !covered.has(normalize(term)));
          const projectedLength = selected.reduce((sum, x) => sum + x.sentence.length + 1, 0) + candidate.sentence.length;
          if (introducesNewConcept && projectedLength <= 900) {
            selected.push(candidate);
            candidate.directHits.forEach(term => covered.add(normalize(term)));
          }
        }

        excerptText = selected.map(x => x.sentence).join(' ');
        excerptScore = Math.max(...selected.map(x => x.score));
      }

      if (!excerptText) continue;
      evidence.push({
        topicId: Number(item.id),
        title: String(item.title || ''),
        year: item.year ?? null,
        sourceType: String(item.source_type || ''),
        sourceTitle: String(item.source_title_full || ''),
        page: Number(item.page_start || 0),
        text: excerptText,
        score: item.combinedScore + excerptScore,
        coverage: item.coverage,
        matchedTerms: item.matchedTerms,
        strictMatch: Boolean(item.strict_match)
      });
    }

    // Segurança adicional: se o mesmo ensinamento estiver duplicado no banco
    // com IDs diferentes, conserva apenas a ocorrência de maior pontuação.
    const uniqueEvidence = [...new Map(
      evidence
        .sort((a, b) => b.score - a.score)
        .map(ev => [[
          normalize(ev.title),
          String(ev.year ?? ''),
          normalize(ev.sourceType),
          String(ev.page),
          normalize(ev.sourceTitle)
        ].join('|'), ev])
    ).values()];

    if (sort === 'oldest') {
      uniqueEvidence.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.page - b.page || b.score - a.score);
    } else if (sort === 'recent') {
      uniqueEvidence.sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || b.page - a.page || b.score - a.score);
    } else {
      uniqueEvidence.sort((a, b) => b.score - a.score);
    }

    const topEvidence = uniqueEvidence.slice(0, 10);
    const strictUniqueTotal = candidates.filter(item => item.strict_match).length;
    const strictLabel = strictUniqueTotal === 1 ? '1 ensinamento' : `${strictUniqueTotal} ensinamentos`;

    return NextResponse.json({
      question,
      total: broad.total,
      strictTotal: strictUniqueTotal,
      coreTerms,
      expandedTerms: relatedTerms,
      answer: topEvidence.length
        ? strict.total > 0
          ? `A pergunta foi refinada considerando em conjunto os termos principais. Foram localizados ${strictLabel} com aderência direta a todos esses conceitos; os trechos abaixo priorizam esse conjunto antes das correspondências mais amplas.`
          : 'Não foi localizado um tópico contendo simultaneamente todos os conceitos principais. A resposta abaixo usa os registros com maior cobertura dos termos da pergunta, mantendo a indicação de fonte e página.'
        : 'Não encontrei trechos com aderência suficiente aos termos principais da pergunta dentro do acervo disponível.',
      evidence: topEvidence,
      sort,
      mode: 'resposta-documental',
      strategy: strict.total > 0 ? 'todos-os-termos' : 'maior-cobertura'
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Falha ao consultar o acervo.' }, { status: 500 });
  }
}
