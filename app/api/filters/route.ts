import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const [years, categories, types, yearCounts, typeCounts, stats] = await Promise.all([
      pool.query(`SELECT DISTINCT year FROM source_sections WHERE year IS NOT NULL ORDER BY year DESC`),
      pool.query(`SELECT DISTINCT category FROM topics WHERE category IS NOT NULL AND category <> '' ORDER BY category`),
      pool.query(`SELECT DISTINCT source_type FROM source_sections WHERE source_type IS NOT NULL AND source_type <> '' ORDER BY source_type`),
      pool.query(`SELECT s.year AS value, count(t.id)::int AS total FROM source_sections s JOIN topics t ON t.source_section_id=s.id WHERE s.year IS NOT NULL GROUP BY s.year ORDER BY s.year DESC`),
      pool.query(`SELECT s.source_type AS value, count(t.id)::int AS total FROM source_sections s JOIN topics t ON t.source_section_id=s.id WHERE s.source_type IS NOT NULL AND s.source_type<>'' GROUP BY s.source_type ORDER BY s.source_type`),
      pool.query(`SELECT (SELECT count(*)::int FROM topics) AS topics, (SELECT count(*)::int FROM source_sections) AS sources, (SELECT count(*)::int FROM documents) AS documents`)
    ]);
    return NextResponse.json({
      years: years.rows.map(r => r.year),
      categories: categories.rows.map(r => r.category),
      types: types.rows.map(r => r.source_type),
      yearCounts: yearCounts.rows,
      typeCounts: typeCounts.rows,
      stats: stats.rows[0]
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ years: [], categories: [], types: [], yearCounts: [], typeCounts: [], stats: { topics: 0, sources: 0, documents: 0 } });
  }
}
