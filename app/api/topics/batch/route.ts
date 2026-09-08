import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const ids = [...new Set(
      (Array.isArray(body?.ids) ? body.ids : [])
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isInteger(value) && value > 0)
    )].slice(0, 50);

    if (!ids.length) return NextResponse.json({ items: [] });

    const result = await pool.query(
      `SELECT t.id, t.topic_number, t.title, t.content, t.page_start, t.page_end,
              t.category, t.keywords, ss.year, ss.source_type,
              ss.title AS source_title, d.title AS document_title
       FROM topics t
       JOIN source_sections ss ON ss.id = t.source_section_id
       JOIN documents d ON d.id = ss.document_id
       WHERE t.id = ANY($1::bigint[])
       ORDER BY array_position($1::bigint[], t.id)`,
      [ids]
    );

    return NextResponse.json({
      items: result.rows.map((row) => ({
        id: Number(row.id),
        topicNumber: row.topic_number,
        title: row.title,
        content: row.content,
        pageStart: row.page_start,
        pageEnd: row.page_end,
        category: row.category,
        keywords: row.keywords || [],
        year: row.year,
        sourceType: row.source_type,
        sourceTitle: row.source_title,
        documentTitle: row.document_title,
      })),
    });
  } catch (error) {
    console.error("Erro em /api/topics/batch:", error);
    return NextResponse.json({ error: "Não foi possível carregar os tópicos em lote." }, { status: 500 });
  }
}
