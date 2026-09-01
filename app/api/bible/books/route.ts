import { NextResponse } from 'next/server';
import { BIBLE_BOOKS, getBibleStats } from '@/lib/bible';
import { DICTIONARY_META, getDictionaryStats } from '@/lib/dictionary';

export const dynamic = 'force-dynamic';

export async function GET(){
  const [stats,dictionaryStats]=await Promise.all([getBibleStats(),getDictionaryStats()]);
  return NextResponse.json({
    version:{code:'ARC2009',name:'Almeida Revista e Corrigida',edition:'2009'},
    books:BIBLE_BOOKS,
    stats,
    dictionary:{...DICTIONARY_META,stats:dictionaryStats}
  }, {
    headers:{
      'Cache-Control':'public, s-maxage=3600, stale-while-revalidate=86400'
    }
  });
}
