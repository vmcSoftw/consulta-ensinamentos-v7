import { NextRequest, NextResponse } from 'next/server';
import { searchBible } from '@/lib/bible';

export const dynamic = 'force-dynamic';

export async function GET(req:NextRequest){
  const q=req.nextUrl.searchParams.get('q')?.trim() || '';
  const limit=Number(req.nextUrl.searchParams.get('limit') || 80);
  if(!q) return NextResponse.json({error:'Informe uma referência, palavra ou frase.'},{status:400});
  try{
    return NextResponse.json(await searchBible(q,limit));
  }catch(error){
    console.error(error);
    return NextResponse.json({error:'Não foi possível consultar a Bíblia. Verifique se a base bíblica foi importada.'},{status:500});
  }
}
