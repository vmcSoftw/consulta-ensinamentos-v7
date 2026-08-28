import { NextRequest, NextResponse } from 'next/server';
import { relatedTeachings } from '@/lib/bible';

export const dynamic = 'force-dynamic';

export async function GET(req:NextRequest){
  const book=Number(req.nextUrl.searchParams.get('book'));
  const chapter=Number(req.nextUrl.searchParams.get('chapter'));
  const verse=Number(req.nextUrl.searchParams.get('verse'));
  if(!book || !chapter || !verse) return NextResponse.json({error:'Referência inválida.'},{status:400});
  try{
    return NextResponse.json({items:await relatedTeachings(book,chapter,verse)});
  }catch(error){
    console.error(error);
    return NextResponse.json({error:'Não foi possível buscar ensinamentos relacionados.'},{status:500});
  }
}
