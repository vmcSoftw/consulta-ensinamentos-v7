import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL não configurada.");
const sql = neon(databaseUrl);

const ACCENTS_FROM = "ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ";
const ACCENTS_TO =   "AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn";

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ").trim();
}

async function loadSynonyms(tokens: string[]) {
  try {
    const rows = await sql`
      SELECT term, related_term, weight::float8 AS weight
      FROM search_synonyms
      WHERE enabled = true
    ` as Array<{term:string; related_term:string; weight:number|string}>;
    const map = new Map<string, Array<{term:string; weight:number}>>();
    for (const row of rows) {
      const key = normalize(row.term);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({term: row.related_term, weight: Number(row.weight || 1)});
    }
    return tokens.flatMap((token) => map.get(token) || []);
  } catch {
    const rows = await sql`
      SELECT term, related_term FROM search_synonyms
    ` as Array<{term:string; related_term:string}>;
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const key = normalize(row.term);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row.related_term);
    }
    return tokens.flatMap((token) => (map.get(token) || []).map((term) => ({term, weight:1})));
  }
}

async function logSearch(query: string, normalized: string, total: number) {
  try {
    await sql`
      INSERT INTO usage_events
        (event_type, query_text, normalized_query, source_page, result_count, metadata)
      VALUES
        ('search', ${query}, ${normalized}, '/api/search/smart', ${total}, ${JSON.stringify({engine:"v8-smart"})}::jsonb)
    `;
  } catch {}
}

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim() || "";
    const sort = request.nextUrl.searchParams.get("sort") || "relevance";
    const year = Number(request.nextUrl.searchParams.get("year") || 0);
    const category = request.nextUrl.searchParams.get("category")?.trim() || "";
    const type = request.nextUrl.searchParams.get("type")?.trim() || "";
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 30),1),300);
    const offset = Math.max(Number(request.nextUrl.searchParams.get("offset") || 0),0);

    if (!q) return NextResponse.json({query:"",total:0,items:[],expandedTerms:[],hasMore:false});

    const nq = normalize(q);
    const tokens = nq.split(" ").filter((token) => token.length >= 2).slice(0,10);
    if (!tokens.length) return NextResponse.json({query:q,total:0,items:[],expandedTerms:[],hasMore:false});

    const related = await loadSynonyms(tokens);
    const rankedRelated = related
      .sort((a,b) => b.weight - a.weight)
      .map((item) => normalize(item.term))
      .filter(Boolean);

    const expandedTerms = [...new Set([...tokens, ...rankedRelated])].slice(0,24);
    const expandedWeb = expandedTerms.map((term) => `"${term.replace(/"/g," ")}"`).join(" OR ");
    const pattern = `%${nq}%`;
    const rows = await sql`
      WITH ranked AS (
        SELECT
          t.id,
          t.topic_number,
          t.title,
          t.content,
          t.page_start,
          t.page_end,
          t.category,
          t.keywords,
          ss.year,
          ss.source_type,
          ss.title AS source_section_title,
          d.title AS document_title,
          (
            ts_rank_cd(
              to_tsvector('portuguese', COALESCE(t.title,'') || ' ' || COALESCE(t.content,'')),
              plainto_tsquery('portuguese', ${q})
            ) * 100
            +
            ts_rank_cd(
              to_tsvector('portuguese', COALESCE(t.title,'') || ' ' || COALESCE(t.content,'')),
              websearch_to_tsquery('portuguese', ${expandedWeb})
            ) * 40
            +
            CASE WHEN lower(translate(t.title, ${ACCENTS_FROM}, ${ACCENTS_TO})) LIKE ${pattern} THEN 35 ELSE 0 END
            +
            CASE WHEN lower(translate(array_to_string(t.keywords,' '), ${ACCENTS_FROM}, ${ACCENTS_TO})) LIKE ${pattern} THEN 20 ELSE 0 END
            +
            CASE WHEN lower(translate(t.content, ${ACCENTS_FROM}, ${ACCENTS_TO})) LIKE ${pattern} THEN 12 ELSE 0 END
          ) AS score
        FROM topics t
        JOIN source_sections ss ON ss.id = t.source_section_id
        LEFT JOIN documents d ON d.id = ss.document_id
        WHERE
          (
            to_tsvector('portuguese', COALESCE(t.title,'') || ' ' || COALESCE(t.content,''))
              @@ websearch_to_tsquery('portuguese', ${expandedWeb})
            OR lower(translate(t.title, ${ACCENTS_FROM}, ${ACCENTS_TO})) LIKE ${pattern}
            OR lower(translate(t.content, ${ACCENTS_FROM}, ${ACCENTS_TO})) LIKE ${pattern}
            OR lower(translate(array_to_string(t.keywords,' '), ${ACCENTS_FROM}, ${ACCENTS_TO})) LIKE ${pattern}
          )
          AND (${year} = 0 OR ss.year = ${year})
          AND (${category} = '' OR t.category = ${category})
          AND (${type} = '' OR ss.source_type = ${type})
      )
      SELECT *, COUNT(*) OVER()::int AS total_count
      FROM ranked
      ORDER BY
        CASE WHEN ${sort} = 'oldest' THEN year END ASC NULLS LAST,
        CASE WHEN ${sort} = 'recent' THEN year END DESC NULLS LAST,
        CASE WHEN ${sort} = 'relevance' THEN score END DESC NULLS LAST,
        id
      LIMIT ${limit} OFFSET ${offset}
    ` as Array<Record<string, unknown>>;

    const total = rows.length ? Number(rows[0].total_count || rows.length) : 0;

    const items = rows.map((row) => ({
      id: Number(row.id),
      topic_number: row.topic_number,
      title: row.title,
      excerpt: String(row.content || "").replace(/\s+/g," ").slice(0,520),
      page_start: row.page_start,
      page_end: row.page_end,
      category: row.category,
      keywords: row.keywords || [],
      year: row.year,
      source_type: row.source_type,
      source_title_full: row.source_section_title || row.document_title || "Documento",
      score: Number(row.score || 0),
      match_hint: Number(row.score || 0) >= 35 ? "forte" : Number(row.score || 0) >= 12 ? "moderada" : "relacionada",
    }));

    void logSearch(q, nq, total);

    return NextResponse.json({
      query:q,
      normalizedQuery:nq,
      total,
      items,
      expandedTerms,
      hasMore: offset + items.length < total,
      engine:"v8-documental",
    });
  } catch (error) {
    console.error("Erro em /api/search/smart:", error);
    return NextResponse.json({error:"Não foi possível executar a pesquisa documental inteligente."},{status:500});
  }
}
