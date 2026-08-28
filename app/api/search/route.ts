import { NextRequest, NextResponse } from 'next/server';
import { searchArchive } from '@/lib/search';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = (sp.get('q') || '').trim();
    const year = sp.get('year');
    const category = sp.get('category');
    const type = sp.get('type');
    const sort = sp.get('sort') || 'relevance';
    const limit = Math.min(Math.max(Number(sp.get('limit') || 30), 1), 100);
    const offset = Math.max(Number(sp.get('offset') || 0), 0);

    if (!q) return NextResponse.json({ items: [], total: 0, expandedTerms: [], hasMore: false });

    const result = await searchArchive(q, {
      year: year ? Number(year) : null,
      category,
      type,
      sort,
      limit,
      offset
    });

    return NextResponse.json({ ...result, mode: 'neon-postgres' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Falha ao pesquisar no acervo.' }, { status: 500 });
  }
}
