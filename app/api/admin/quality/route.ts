import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL não configurada.");
const sql = neon(databaseUrl);

async function requireAdmin(request: NextRequest) {
  const response = await fetch(`${request.nextUrl.origin}/api/admin/session`, {
    headers: { cookie: request.headers.get("cookie") || "" },
    cache: "no-store",
  });
  return response.ok;
}

async function usageStats() {
  try {
    const topSearches = await sql`
      SELECT normalized_query AS query, COUNT(*)::int AS total,
             MAX(created_at) AS last_seen
      FROM usage_events
      WHERE normalized_query IS NOT NULL AND event_type IN ('search','ask','history_view','dossier')
      GROUP BY normalized_query
      ORDER BY total DESC, last_seen DESC
      LIMIT 20
    `;
    const noResults = await sql`
      SELECT normalized_query AS query, COUNT(*)::int AS total,
             MAX(created_at) AS last_seen
      FROM usage_events
      WHERE normalized_query IS NOT NULL AND COALESCE(result_count,0)=0
      GROUP BY normalized_query
      ORDER BY total DESC, last_seen DESC
      LIMIT 20
    `;
    const topQuestions = await sql`
      SELECT q.id, q.canonical_question AS question, COUNT(*)::int AS total
      FROM usage_events u
      JOIN question_bank_questions q ON q.id = u.entity_id
      WHERE u.event_type='question_open' AND u.entity_type='question'
      GROUP BY q.id, q.canonical_question
      ORDER BY total DESC
      LIMIT 20
    `;
    return {enabled:true, topSearches, noResults, topQuestions};
  } catch {
    return {enabled:false, topSearches:[], noResults:[], topQuestions:[]};
  }
}

async function synonymRows() {
  try {
    return await sql`
      SELECT id, term, related_term, weight::float8 AS weight, enabled
      FROM search_synonyms
      ORDER BY lower(term), lower(related_term)
      LIMIT 160
    `;
  } catch {
    return await sql`
      SELECT id, term, related_term, 1.0::float8 AS weight, true AS enabled
      FROM search_synonyms
      ORDER BY lower(term), lower(related_term)
      LIMIT 160
    `;
  }
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({error:"Não autorizado."},{status:401});
  try {
    const [
      topicSummary, sourceSummary, qbSummary, duplicateTitles, recentAudit,
      answerVersions, synonyms, usage
    ] = await Promise.all([
      sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE category IS NULL OR btrim(category)='')::int AS without_category,
          COUNT(*) FILTER (WHERE page_start IS NULL)::int AS without_page,
          COUNT(*) FILTER (WHERE cardinality(keywords)=0)::int AS without_keywords
        FROM topics
      `,
      sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE year IS NULL)::int AS without_year,
          COUNT(*) FILTER (WHERE source_type IS NULL OR btrim(source_type)='')::int AS without_type,
          COUNT(*) FILTER (WHERE page_start IS NULL)::int AS without_page
        FROM source_sections
      `,
      sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE q.category_id IS NULL OR q.subcategory_id IS NULL)::int AS uncategorized,
          COUNT(*) FILTER (WHERE NOT EXISTS (
            SELECT 1 FROM question_bank_answers a
            WHERE a.question_id=q.id AND a.status='approved'
          ))::int AS without_approved_answer,
          COUNT(*) FILTER (WHERE NOT EXISTS (
            SELECT 1 FROM question_bank_sources s WHERE s.question_id=q.id
          ))::int AS without_sources
        FROM question_bank_questions q
      `,
      sql`
        SELECT lower(btrim(title)) AS normalized_title, COUNT(*)::int AS total
        FROM topics
        GROUP BY lower(btrim(title))
        HAVING COUNT(*) > 1
        ORDER BY total DESC
        LIMIT 20
      `,
      sql`
        SELECT id, created_at, action, entity_type, entity_id, summary
        FROM admin_audit_log
        ORDER BY created_at DESC
        LIMIT 25
      `,
      sql`
        SELECT
          COUNT(*)::int AS total_versions,
          COUNT(DISTINCT question_id)::int AS questions_with_versions,
          COALESCE(MAX(version),0)::int AS max_version
        FROM question_bank_answers
      `,
      synonymRows(),
      usageStats(),
    ]);

    return NextResponse.json({
      topics: topicSummary[0],
      sources: sourceSummary[0],
      questionBank: qbSummary[0],
      duplicateTitles,
      recentAudit,
      answerVersions: answerVersions[0],
      synonyms,
      usage,
    });
  } catch (error) {
    console.error("Erro em /api/admin/quality:", error);
    return NextResponse.json({error:"Não foi possível calcular a qualidade do acervo."},{status:500});
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({error:"Não autorizado."},{status:401});
  try {
    const body = await request.json();
    const action = String(body.action || "");
    if (action === "upsert-synonym") {
      const term = String(body.term || "").trim();
      const relatedTerm = String(body.relatedTerm || "").trim();
      const weight = Math.max(0.1, Math.min(Number(body.weight || 1), 5));
      const enabled = body.enabled !== false;
      if (!term || !relatedTerm) return NextResponse.json({error:"Informe termo e termo relacionado."},{status:400});
      try {
        await sql`
          INSERT INTO search_synonyms (term, related_term, weight, enabled)
          VALUES (${term}, ${relatedTerm}, ${weight}, ${enabled})
          ON CONFLICT (term, related_term)
          DO UPDATE SET weight=EXCLUDED.weight, enabled=EXCLUDED.enabled
        `;
      } catch {
        return NextResponse.json(
          {error:"A migração V8 de sinônimos ainda não foi aplicada no Neon."},
          {status:409},
        );
      }
      return NextResponse.json({ok:true});
    }
    return NextResponse.json({error:"Ação inválida."},{status:400});
  } catch (error) {
    console.error("Erro POST /api/admin/quality:", error);
    return NextResponse.json({error:"Falha ao atualizar qualidade."},{status:500});
  }
}
