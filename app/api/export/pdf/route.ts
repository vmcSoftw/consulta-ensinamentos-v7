import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { buildCompilationPdf, type CompilationTopic } from '@/lib/simple-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export async function GET(req: NextRequest) {
  try {
    const type = (req.nextUrl.searchParams.get('type') || '').trim();
    const yearRaw = (req.nextUrl.searchParams.get('year') || '').trim();
    const preview = req.nextUrl.searchParams.get('preview') === '1';
    const year = yearRaw ? Number(yearRaw) : null;

    if (!type && !year) {
      return NextResponse.json({ error: 'Informe um tipo de documento ou um ano.' }, { status: 400 });
    }
    if (yearRaw && (!Number.isInteger(year) || Number(year) < 1800 || Number(year) > 2200)) {
      return NextResponse.json({ error: 'Ano inválido.' }, { status: 400 });
    }

    const params: unknown[] = [];
    const where: string[] = [];
    if (type) {
      params.push(type);
      where.push(`s.source_type = $${params.length}`);
    }
    if (year) {
      params.push(year);
      where.push(`s.year = $${params.length}`);
    }

    const result = await pool.query(`
      SELECT t.topic_number, t.title, t.content, t.page_start, t.page_end, t.category,
             s.year, s.source_type, s.title AS source_title, s.source_order
      FROM topics t
      JOIN source_sections s ON s.id = t.source_section_id
      WHERE ${where.join(' AND ')}
      ORDER BY s.year ASC NULLS LAST, s.source_order ASC NULLS LAST, t.page_start ASC, t.id ASC
    `, params);

    if (!result.rowCount) {
      return NextResponse.json({ error: 'Nenhum tópico encontrado para esta seleção.' }, { status: 404 });
    }

    const label = type && year ? `${type} - ${year}` : type || `Tópicos de ${year}`;
    const topics: CompilationTopic[] = result.rows.map((row) => ({
      year: row.year,
      sourceType: row.source_type,
      sourceTitle: row.source_title,
      topicNumber: row.topic_number,
      title: row.title,
      content: String(row.content || ''),
      pageStart: row.page_start,
      pageEnd: row.page_end,
      category: row.category
    }));

    const buffer = buildCompilationPdf({
      title: label,
      subtitle: 'Compilação documental organizada para pesquisa, leitura e referência histórica.',
      filterType: type || null,
      filterYear: year,
      topics
    });

    const fileLabel = type ? type : `topicos-${year}`;
    const filename = `consulta-ensinamentos-${safeFileName(fileLabel)}${type && year ? `-${year}` : ''}.pdf`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${preview ? 'inline' : 'attachment'}; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'Content-Length': String(buffer.length)
      }
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Falha ao gerar a compilação em PDF.' }, { status: 500 });
  }
}
