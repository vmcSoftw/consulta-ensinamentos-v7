import { pool } from '@/lib/db';

export const DICTIONARY_META = {
  code: 'DBA2',
  title: 'Dicionário da Bíblia de Almeida',
  edition: '2ª edição',
  authors: ['Werner Kaschel', 'Rudi Zimmer'],
  publisher: 'Sociedade Bíblica do Brasil'
};

export type DictionaryEntry = {
  id: number;
  headword: string;
  definition: string;
  letter: string;
  score?: number;
};

export function normalizeDictionary(value:string){
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim();
}

export async function getDictionaryStats(){
  try{
    const row=(await pool.query(`
      SELECT count(*)::int AS entries,
             count(DISTINCT letter)::int AS letters
      FROM public.bible_dictionary_entries e
      JOIN public.bible_dictionary_sources s ON s.id=e.source_id
      WHERE s.code=$1
    `,[DICTIONARY_META.code])).rows[0];
    return row || {entries:0,letters:0};
  }catch{
    return {entries:0,letters:0};
  }
}

export async function searchDictionary(query:string, letter:string, limit=60){
  const clean=query.trim();
  const norm=normalizeDictionary(clean);
  const maxLimit=Math.min(Math.max(Number(limit)||60,1),120);
  const letterClean=(letter||'').trim().slice(0,1).toLocaleUpperCase('pt-BR');

  const normSql=`lower(translate(e.headword,
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))`;

  if(!clean){
    const params:any[]=[DICTIONARY_META.code];
    let letterWhere='';
    if(letterClean){params.push(letterClean);letterWhere=`AND e.letter=$${params.length}`;}
    params.push(maxLimit);
    const items=(await pool.query(`
      SELECT e.id,e.headword,e.definition,e.letter
      FROM public.bible_dictionary_entries e
      JOIN public.bible_dictionary_sources s ON s.id=e.source_id
      WHERE s.code=$1 ${letterWhere}
      ORDER BY e.headword_normalized,e.headword
      LIMIT $${params.length}
    `,params)).rows;
    const totalRow=(await pool.query(`
      SELECT count(*)::int AS total
      FROM public.bible_dictionary_entries e
      JOIN public.bible_dictionary_sources s ON s.id=e.source_id
      WHERE s.code=$1 ${letterWhere}
    `,params.slice(0,-1))).rows[0];
    return {query:clean,letter:letterClean,total:totalRow?.total||0,items};
  }

  const params:any[]=[DICTIONARY_META.code,clean,norm,`${norm}%`,`%${norm}%`];
  let letterWhere='';
  if(letterClean){params.push(letterClean);letterWhere=`AND e.letter=$${params.length}`;}
  params.push(maxLimit);
  const items=(await pool.query(`
    SELECT * FROM (
      SELECT e.id,e.headword,e.definition,e.letter,
        (CASE WHEN ${normSql}=$3 THEN 150 ELSE 0 END +
         CASE WHEN ${normSql} LIKE $4 THEN 95 ELSE 0 END +
         CASE WHEN ${normSql} LIKE $5 THEN 65 ELSE 0 END +
         ts_rank_cd(
           setweight(to_tsvector('portuguese'::regconfig,e.headword),'A') ||
           setweight(to_tsvector('portuguese'::regconfig,e.definition),'B'),
           websearch_to_tsquery('portuguese'::regconfig,$2)
         )*35) AS score
      FROM public.bible_dictionary_entries e
      JOIN public.bible_dictionary_sources s ON s.id=e.source_id
      WHERE s.code=$1 ${letterWhere} AND (
        ${normSql} LIKE $5 OR
        to_tsvector('portuguese'::regconfig,e.headword || ' ' || e.definition)
          @@ websearch_to_tsquery('portuguese'::regconfig,$2)
      )
    ) ranked
    ORDER BY score DESC,headword
    LIMIT $${params.length}
  `,params)).rows;

  const countParams:any[]=[DICTIONARY_META.code,clean,`%${norm}%`];
  let countLetterWhere='';
  if(letterClean){countParams.push(letterClean);countLetterWhere=`AND e.letter=$${countParams.length}`;}
  const totalRow=(await pool.query(`
    SELECT count(*)::int AS total
    FROM public.bible_dictionary_entries e
    JOIN public.bible_dictionary_sources s ON s.id=e.source_id
    WHERE s.code=$1 ${countLetterWhere} AND (
      ${normSql} LIKE $3 OR
      to_tsvector('portuguese'::regconfig,e.headword || ' ' || e.definition)
        @@ websearch_to_tsquery('portuguese'::regconfig,$2)
    )
  `,countParams)).rows[0];
  return {query:clean,letter:letterClean,total:totalRow?.total||0,items};
}
