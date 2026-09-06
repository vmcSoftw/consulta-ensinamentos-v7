import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL não configurada.");
const sql = neon(databaseUrl);

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}\s]/gu," ")
    .replace(/\s+/g," ").trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const allowed = new Set(["search","ask","question_open","bible_search","concordance_search","dossier","history_view"]);
    const eventType = String(body.eventType || "");
    if (!allowed.has(eventType)) return NextResponse.json({error:"Evento inválido."},{status:400});

    const query = body.query ? String(body.query).slice(0,600) : null;
    const entityType = body.entityType ? String(body.entityType).slice(0,80) : null;
    const entityId = Number.isFinite(Number(body.entityId)) ? Number(body.entityId) : null;
    const resultCount = Number.isFinite(Number(body.resultCount)) ? Number(body.resultCount) : null;
    const sourcePage = body.sourcePage ? String(body.sourcePage).slice(0,160) : null;
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};

    await sql`
      INSERT INTO usage_events
        (event_type, query_text, normalized_query, entity_type, entity_id, source_page, result_count, metadata)
      VALUES
        (${eventType}, ${query}, ${query ? normalize(query) : null}, ${entityType}, ${entityId},
         ${sourcePage}, ${resultCount}, ${JSON.stringify(metadata)}::jsonb)
    `;

    return NextResponse.json({ok:true});
  } catch (error) {
    console.error("Erro em /api/usage:", error);
    return NextResponse.json({ok:false, disabled:true}, {status:503});
  }
}
