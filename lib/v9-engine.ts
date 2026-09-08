import { pool } from "@/lib/db";

const STOPWORDS = new Set([
  "a","o","as","os","um","uma","uns","umas","de","da","do","das","dos","e","em","no","na","nos","nas",
  "por","para","com","sem","que","qual","quais","como","onde","quando","sobre","tem","ha","há","existe","existem",
  "falar","fala","falam","ensina","ensinam","ensinamento","ensinamentos","topico","topicos","tópico","tópicos","assunto",
  "segundo","diz","dizer","pode","podem","deve","devem","porque","porquê","ser","sao","são","esta","está","estao","estão",
  "igreja","congregacao","congregação","irmao","irmão","irmaos","irmãos","irma","irmã","irmas","irmãs","ccb",
  "gostaria","saber","duvida","dúvida","pergunta","respeito","entendimento","orientacao","orientação"
]);

const FROM = "ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ";
const TO   = "AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn";

export type V9Topic = {
  id: number;
  topicNumber: string | null;
  title: string;
  content: string;
  excerpt: string;
  year: number | null;
  sourceType: string | null;
  sourceTitle: string | null;
  documentTitle: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  category: string | null;
  keywords: string[];
  score: number;
  matchHint: string;
};

export type V9Source = {
  id: number;
  topicId: number | null;
  sourceTitle: string | null;
  sourceType: string | null;
  sourceYear: number | null;
  pageStart: number | null;
  pageEnd: number | null;
  citationText: string | null;
  topicTitle: string | null;
  documentTitle: string | null;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[“”"‘’'`´]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTerms(question: string) {
  const terms = normalize(question)
    .split(" ")
    .filter((term) => term.length >= 3 && !STOPWORDS.has(term) && !/^\d+$/.test(term));
  return [...new Set(terms)].slice(0, 10);
}

function excerptAround(content: string, terms: string[], max = 760) {
  const text = String(content || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;

  const lower = normalize(text);
  let pos = -1;
  for (const term of terms) {
    const i = lower.indexOf(normalize(term));
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }

  if (pos < 0) return `${text.slice(0, max - 1).trim()}…`;
  const start = Math.max(0, pos - Math.floor(max * 0.25));
  const chunk = text.slice(start, start + max).trim();
  return `${start > 0 ? "…" : ""}${chunk}${start + max < text.length ? "…" : ""}`;
}

async function findBankCandidate(question: string) {
  const normalized = normalize(question);
  if (normalized.length < 2) return null;

  const result = await pool.query(
    `SELECT q.id, q.canonical_question, a.short_answer, a.full_answer, a.version,
       GREATEST(
         CASE WHEN q.normalized_question = $1 THEN 1.0 ELSE 0.0 END,
         similarity(q.normalized_question, $1),
         COALESCE(MAX(similarity(x.normalized_alias, $1)), 0.0)
       ) AS score
     FROM question_bank_questions q
     JOIN LATERAL (
       SELECT id, short_answer, full_answer, version
       FROM question_bank_answers
       WHERE question_id = q.id AND status = 'approved'
       ORDER BY version DESC, id DESC
       LIMIT 1
     ) a ON true
     LEFT JOIN question_bank_aliases x ON x.question_id = q.id
     WHERE q.status = 'approved'
     GROUP BY q.id, q.canonical_question, q.normalized_question,
              a.id, a.short_answer, a.full_answer, a.version
     ORDER BY score DESC
     LIMIT 1`,
    [normalized]
  );

  if (!result.rows.length) return null;
  const row = result.rows[0];
  const score = Number(row.score || 0);
  if (score < 0.80) return null;

  const sourceResult = await pool.query(
    `SELECT qbs.id, qbs.topic_id, qbs.source_title, qbs.source_type, qbs.source_year,
            qbs.page_start, qbs.page_end, qbs.citation_text,
            t.title AS topic_title, d.title AS document_title
     FROM question_bank_sources qbs
     LEFT JOIN topics t ON t.id = qbs.topic_id
     LEFT JOIN source_sections ss ON ss.id = t.source_section_id
     LEFT JOIN documents d ON d.id = ss.document_id
     WHERE qbs.question_id = $1
     ORDER BY qbs.source_year NULLS LAST, qbs.page_start NULLS LAST, qbs.id`,
    [Number(row.id)]
  );

  const sources: V9Source[] = sourceResult.rows.map((source) => ({
    id: Number(source.id),
    topicId: source.topic_id == null ? null : Number(source.topic_id),
    sourceTitle: source.source_title ? String(source.source_title) : null,
    sourceType: source.source_type ? String(source.source_type) : null,
    sourceYear: source.source_year == null ? null : Number(source.source_year),
    pageStart: source.page_start == null ? null : Number(source.page_start),
    pageEnd: source.page_end == null ? null : Number(source.page_end),
    citationText: source.citation_text ? String(source.citation_text) : null,
    topicTitle: source.topic_title ? String(source.topic_title) : null,
    documentTitle: source.document_title ? String(source.document_title) : null,
  }));

  // V9: uma resposta do Banco só pode ser tratada como confiável se tiver prova documental.
  const verifiedSources = sources.filter((source) =>
    Boolean(source.topicId || (source.sourceTitle && source.citationText))
  );

  return {
    id: Number(row.id),
    question: String(row.canonical_question),
    shortAnswer: String(row.short_answer || row.full_answer || ""),
    fullAnswer: String(row.full_answer || row.short_answer || ""),
    version: Number(row.version || 1),
    score,
    sources,
    verifiedSources,
    trusted: verifiedSources.length > 0,
  };
}

async function searchDocumentaryCandidates(question: string, terms: string[]) {
  const synonymResult = terms.length
    ? await pool.query(
        `SELECT DISTINCT related_term
         FROM search_synonyms
         WHERE term = ANY($1::text[])
         ORDER BY related_term
         LIMIT 30`,
        [terms]
      )
    : { rows: [] as Array<{ related_term: string }> };

  const synonyms = synonymResult.rows.map((row) => String(row.related_term));
  const expanded = [...new Set([...terms, ...synonyms.map(normalize)])].filter(Boolean).slice(0, 30);

  const directPatterns = terms.length ? terms.map((term) => `%${term}%`) : ["%__nenhum__%"];
  const expandedPatterns = expanded.length ? expanded.map((term) => `%${term}%`) : ["%__nenhum__%"];
  const keywordTerms = terms.length ? terms : ["__nenhum__"];

  // V9: índices primeiro. Só depois os candidatos são ranqueados em detalhe.
  const sql = `
    WITH fts_candidates AS (
      SELECT t.id,
             ts_rank_cd(
               to_tsvector('portuguese', coalesce(t.title,'') || ' ' || coalesce(t.content,'')),
               websearch_to_tsquery('portuguese', $1)
             ) AS base_score
      FROM topics t
      WHERE to_tsvector('portuguese', coalesce(t.title,'') || ' ' || coalesce(t.content,''))
            @@ websearch_to_tsquery('portuguese', $1)
      ORDER BY base_score DESC, t.id
      LIMIT 90
    ),
    title_candidates AS (
      SELECT t.id, 0.0::real AS base_score
      FROM topics t
      WHERE lower(translate(t.title, '${FROM}', '${TO}')) LIKE ANY($2::text[])
      LIMIT 60
    ),
    keyword_candidates AS (
      SELECT t.id, 0.0::real AS base_score
      FROM topics t
      WHERE t.keywords && $3::text[]
      LIMIT 40
    ),
    candidate_ids AS (
      SELECT id, MAX(base_score) AS base_score
      FROM (
        SELECT * FROM fts_candidates
        UNION ALL SELECT * FROM title_candidates
        UNION ALL SELECT * FROM keyword_candidates
      ) combined
      GROUP BY id
      ORDER BY MAX(base_score) DESC, id
      LIMIT 120
    )
    SELECT t.id, t.topic_number, t.title, t.content, t.page_start, t.page_end,
           t.category, t.keywords, ss.year, ss.source_type,
           ss.title AS source_title, d.title AS document_title,
           count(*) OVER()::int AS candidate_count,
           (
             c.base_score * 170 +
             CASE WHEN lower(translate(t.title, '${FROM}', '${TO}')) LIKE ANY($2::text[]) THEN 190 ELSE 0 END +
             CASE WHEN t.keywords && $3::text[] THEN 95 ELSE 0 END +
             CASE WHEN lower(translate(t.content, '${FROM}', '${TO}')) LIKE ANY($2::text[]) THEN 38 ELSE 0 END +
             CASE WHEN lower(translate(t.title, '${FROM}', '${TO}')) LIKE ANY($4::text[]) THEN 22 ELSE 0 END +
             CASE WHEN lower(translate(t.content, '${FROM}', '${TO}')) LIKE ANY($4::text[]) THEN 5 ELSE 0 END
           )::double precision AS score,
           CASE
             WHEN lower(translate(t.title, '${FROM}', '${TO}')) LIKE ANY($2::text[]) THEN 'Título'
             WHEN t.keywords && $3::text[] THEN 'Palavra-chave'
             WHEN lower(translate(t.content, '${FROM}', '${TO}')) LIKE ANY($2::text[]) THEN 'Conteúdo'
             ELSE 'Termo relacionado'
           END AS match_hint
    FROM candidate_ids c
    JOIN topics t ON t.id = c.id
    JOIN source_sections ss ON ss.id = t.source_section_id
    JOIN documents d ON d.id = ss.document_id
    ORDER BY score DESC, ss.year DESC NULLS LAST, t.page_start ASC NULLS LAST
    LIMIT 12`;

  const result = await pool.query(sql, [question, directPatterns, keywordTerms, expandedPatterns]);

  const topics: V9Topic[] = result.rows.map((row) => ({
    id: Number(row.id),
    topicNumber: row.topic_number == null ? null : String(row.topic_number),
    title: String(row.title || "Tópico documental"),
    content: String(row.content || ""),
    excerpt: excerptAround(String(row.content || ""), terms),
    year: row.year == null ? null : Number(row.year),
    sourceType: row.source_type ? String(row.source_type) : null,
    sourceTitle: row.source_title ? String(row.source_title) : null,
    documentTitle: row.document_title ? String(row.document_title) : null,
    pageStart: row.page_start == null ? null : Number(row.page_start),
    pageEnd: row.page_end == null ? null : Number(row.page_end),
    category: row.category ? String(row.category) : null,
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
    score: Number(row.score || 0),
    matchHint: String(row.match_hint || "Documento"),
  }));

  return {
    topics,
    synonyms: synonyms.slice(0, 20),
    candidateCount: result.rows.length ? Number(result.rows[0].candidate_count || topics.length) : 0,
  };
}

function breadth(topics: V9Topic[]) {
  const keys = new Set(
    topics.map((topic) => `${topic.year ?? ""}|${topic.sourceTitle ?? topic.sourceType ?? topic.id}`)
  );
  if (keys.size >= 4) return "ampla";
  if (keys.size >= 2) return "moderada";
  if (keys.size === 1) return "limitada";
  return "sem cobertura";
}

function explicitBibleReferences(text: string) {
  const matches =
    String(text || "").match(
      /\b(?:[123]\s*)?[A-Za-zÀ-ÿ]{2,18}\.?\s+\d{1,3}\s*[:.,]\s*\d{1,3}(?:\s*(?:-|–|—|a)\s*\d{1,3})?/gu
    ) || [];
  return [...new Set(matches.map((value) => value.replace(/\s+/g, " ").trim()))].slice(0, 16);
}

export async function answerV9(question: string) {
  const started = Date.now();
  const cleanQuestion = String(question || "").trim();

  if (cleanQuestion.length < 3) {
    throw new Error("Digite uma pergunta um pouco mais específica.");
  }
  if (cleanQuestion.length > 500) {
    throw new Error("A pergunta está muito longa. Resuma-a em até 500 caracteres.");
  }

  const terms = queryTerms(cleanQuestion);

  const bankStarted = Date.now();
  const bank = await findBankCandidate(cleanQuestion);
  const bankMs = Date.now() - bankStarted;

  const searchStarted = Date.now();
  const documentary = await searchDocumentaryCandidates(cleanQuestion, terms);
  const searchMs = Date.now() - searchStarted;

  const trustedBank = Boolean(bank?.trusted);

  const answer = trustedBank
    ? (bank?.shortAnswer || bank?.fullAnswer || "")
    : documentary.topics.length
      ? `Não há, para esta formulação, uma resposta do Banco de Perguntas que esteja simultaneamente aprovada e vinculada a fonte documental verificável. Foram localizados ${documentary.topics.length} registros documentais prioritários para conferência. O registro mais diretamente relacionado é “${documentary.topics[0].title}”.`
      : "Não foi localizada resposta aprovada com fonte nem registro documental suficientemente relacionado à pergunta.";

  const bibleText = [
    trustedBank ? bank?.fullAnswer || bank?.shortAnswer || "" : "",
    ...documentary.topics.slice(0, 6).map((topic) => topic.content),
  ].join("\n");

  return {
    version: "9.0-alpha",
    engine: "documentary-rastreable-v9",
    question: cleanQuestion,
    answer,
    answerOrigin: trustedBank ? "question-bank-verified" : "documentary-evidence",
    trust: {
      level: trustedBank
        ? "verificada"
        : documentary.topics.length
          ? "documental-sem-resposta-aprovada"
          : "insuficiente",
      bankMatched: Boolean(bank),
      bankTrusted: trustedBank,
      bankScore: bank ? Number(bank.score.toFixed(4)) : null,
      verifiedSourceCount: bank?.verifiedSources.length || 0,
      documentaryBreadth: breadth(documentary.topics),
      note: trustedBank
        ? "A resposta aprovada possui pelo menos uma fonte documental vinculada e verificável."
        : bank
          ? "Foi localizada resposta semelhante no Banco de Perguntas, mas ela não foi usada como resposta confiável porque ainda não possui fonte documental verificável vinculada."
          : "Nenhuma resposta equivalente aprovada foi localizada no Banco de Perguntas; o sistema apresenta somente evidências documentais.",
    },
    bankCandidate: bank
      ? {
          id: bank.id,
          question: bank.question,
          version: bank.version,
          score: Number(bank.score.toFixed(4)),
          trusted: bank.trusted,
          sources: bank.sources,
        }
      : null,
    topics: documentary.topics.map(({ content, ...topic }) => ({
      ...topic,
      fullTopicEndpoint: `/api/topic/${topic.id}`,
      contentLength: content.length,
    })),
    explicitBibleReferences: explicitBibleReferences(bibleText),
    whySelected: {
      interpretedTerms: terms,
      expandedTerms: documentary.synonyms,
      candidateStrategy: "índices primeiro; ranqueamento detalhado somente sobre candidatos",
      candidateCount: documentary.candidateCount,
      finalTopics: documentary.topics.length,
    },
    diagnostics: {
      bankMs,
      searchMs,
      totalMs: Date.now() - started,
    },
  };
}
