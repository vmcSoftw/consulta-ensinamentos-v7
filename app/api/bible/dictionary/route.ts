import { NextRequest, NextResponse } from 'next/server';
import { DICTIONARY_META, searchDictionary } from '@/lib/dictionary';

export const dynamic='force-dynamic';

export async function GET(req:NextRequest){
  const sp=req.nextUrl.searchParams;
  try{
    const result=await searchDictionary(sp.get('q')||'',sp.get('letter')||'',Number(sp.get('limit')||60));
    return NextResponse.json({...result,source:DICTIONARY_META});
  }catch(error){
    console.error(error);
    return NextResponse.json({error:'Não foi possível consultar o dicionário bíblico.'},{status:500});
  }
}
