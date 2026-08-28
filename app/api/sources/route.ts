import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT id, year, source_type, title, page_start, page_end
      FROM source_sections
      ORDER BY year DESC NULLS LAST, source_order DESC, id DESC
      LIMIT 500`);
    return NextResponse.json({ items: result.rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ items: [], error: 'Falha ao carregar fontes.' }, { status: 500 });
  }
}
