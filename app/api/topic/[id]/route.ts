import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId < 1) {
    return NextResponse.json({ error: 'Identificador inválido' }, { status: 400 });
  }

  const result = await pool.query(`
    SELECT
      t.*,
      s.year,
      s.source_type,
      s.title AS source_title_full,
      s.page_start AS source_start_page,
      s.page_end AS source_end_page
    FROM topics t
    JOIN source_sections s ON s.id = t.source_section_id
    WHERE t.id = $1`, [numericId]);

  if (!result.rowCount) return NextResponse.json({ error: 'Tópico não encontrado' }, { status: 404 });
  return NextResponse.json(result.rows[0]);
}
