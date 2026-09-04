import { neon } from "@neondatabase/serverless";

export function normalizeQuestion(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[“”"‘’'`´]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function questionBankDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  return neon(url);
}

export async function findApprovedQuestion(raw: string, threshold = 0.80) {
  const normalized = normalizeQuestion(raw);
  if (normalized.length < 2) return null;
  const sql = questionBankDb();

  const rows = await sql`
    SELECT q.id, q.canonical_question, a.short_answer, a.full_answer, a.version,
      GREATEST(
        CASE WHEN q.normalized_question = ${normalized} THEN 1.0 ELSE 0.0 END,
        similarity(q.normalized_question, ${normalized}),
        COALESCE(MAX(similarity(x.normalized_alias, ${normalized})), 0.0)
      ) AS score
    FROM public.question_bank_questions q
    JOIN LATERAL (
      SELECT id, short_answer, full_answer, version
      FROM public.question_bank_answers
      WHERE question_id = q.id AND status = 'approved'
      ORDER BY version DESC, id DESC LIMIT 1
    ) a ON true
    LEFT JOIN public.question_bank_aliases x ON x.question_id = q.id
    WHERE q.status = 'approved'
    GROUP BY q.id, q.canonical_question, q.normalized_question,
             a.id, a.short_answer, a.full_answer, a.version
    ORDER BY score DESC LIMIT 1
  `;

  if (!rows.length || Number(rows[0].score || 0) < threshold) return null;
  const id = Number(rows[0].id);

  const aliases = await sql`
    SELECT alias FROM public.question_bank_aliases
    WHERE question_id = ${id} ORDER BY alias LIMIT 20
  `;

  const sources = await sql`
    SELECT id, topic_id, source_title, source_type, source_year,
           page_start, page_end, citation_text
    FROM public.question_bank_sources
    WHERE question_id = ${id}
    ORDER BY source_year NULLS LAST, page_start NULLS LAST, id
  `;

  return {
    id,
    question: String(rows[0].canonical_question),
    score: Number(rows[0].score || 0),
    shortAnswer: String(rows[0].short_answer || rows[0].full_answer || ""),
    fullAnswer: String(rows[0].full_answer || rows[0].short_answer || ""),
    version: Number(rows[0].version || 1),
    aliases: aliases.map((r) => String(r.alias)),
    sources: sources.map((r) => ({
      id: Number(r.id),
      topicId: r.topic_id == null ? null : Number(r.topic_id),
      sourceTitle: r.source_title ? String(r.source_title) : null,
      sourceType: r.source_type ? String(r.source_type) : null,
      sourceYear: r.source_year == null ? null : Number(r.source_year),
      pageStart: r.page_start == null ? null : Number(r.page_start),
      pageEnd: r.page_end == null ? null : Number(r.page_end),
      citationText: r.citation_text ? String(r.citation_text) : null,
    })),
  };
}
