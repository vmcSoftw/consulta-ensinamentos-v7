import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import pg from 'pg';
import { ROOT, requireDatabaseUrl } from '../lib/env.mjs';
const {Pool}=pg;
const pool=new Pool({connectionString:requireDatabaseUrl(),max:1});
const client=await pool.connect();
const source={code:'DBA2',title:'Dicionário da Bíblia de Almeida',edition:'2ª edição',authors:['Werner Kaschel','Rudi Zimmer'],publisher:'Sociedade Bíblica do Brasil',sourceTitle:'Dicionário da Bíblia de Almeida: 2ª edição'};
const dataPath=path.join(ROOT,'data','dictionary-entries.jsonl');
function normalize(v){return v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}
async function insertBatch(sourceId,batch){
 if(!batch.length)return;
 const payload=batch.map(e=>({headword:e.headword,headword_normalized:normalize(e.headword),definition:e.definition,letter:e.letter,source_anchor:e.anchor||null,source_part:e.source_part||null,links:e.links||[]}));
 await client.query(`
 INSERT INTO public.bible_dictionary_entries(source_id,headword,headword_normalized,definition,letter,source_anchor,source_part,links)
 SELECT $1::bigint,x.headword,x.headword_normalized,x.definition,x.letter,x.source_anchor,x.source_part,x.links
 FROM jsonb_to_recordset($2::jsonb) AS x(headword text,headword_normalized text,definition text,letter text,source_anchor text,source_part text,links jsonb)
 ON CONFLICT(source_id,headword_normalized,source_anchor)
 DO UPDATE SET headword=EXCLUDED.headword,definition=EXCLUDED.definition,letter=EXCLUDED.letter,source_part=EXCLUDED.source_part,links=EXCLUDED.links
 `,[sourceId,JSON.stringify(payload)]);
}
try{
 console.log('Importando Dicionário Bíblico para o Neon...');
 await client.query('BEGIN');
 const row=(await client.query(`INSERT INTO public.bible_dictionary_sources(code,title,edition,authors,publisher,source_title)
 VALUES($1,$2,$3,$4,$5,$6)
 ON CONFLICT(code) DO UPDATE SET title=EXCLUDED.title,edition=EXCLUDED.edition,authors=EXCLUDED.authors,publisher=EXCLUDED.publisher,source_title=EXCLUDED.source_title
 RETURNING id`,[source.code,source.title,source.edition,source.authors,source.publisher,source.sourceTitle])).rows[0];
 const sourceId=Number(row.id);
 await client.query('DELETE FROM public.bible_dictionary_entries WHERE source_id=$1',[sourceId]);
 const rl=readline.createInterface({input:fs.createReadStream(dataPath,{encoding:'utf8'}),crlfDelay:Infinity});
 let batch=[];let total=0;
 for await(const line of rl){if(!line.trim())continue;batch.push(JSON.parse(line));if(batch.length>=500){await insertBatch(sourceId,batch);total+=batch.length;process.stdout.write(`\rVerbetes importados: ${total.toLocaleString('pt-BR')}`);batch=[];}}
 if(batch.length){await insertBatch(sourceId,batch);total+=batch.length;}
 const count=(await client.query('SELECT count(*)::int AS total FROM public.bible_dictionary_entries WHERE source_id=$1',[sourceId])).rows[0].total;
 if(count!==5614) throw new Error(`Validação inesperada: ${count} verbetes.`);
 await client.query('COMMIT');
 console.log(`\nDicionário importado com sucesso: ${count.toLocaleString('pt-BR')} verbetes pesquisáveis.`);
}catch(error){await client.query('ROLLBACK');console.error('\nFalha na importação do dicionário. Nenhuma alteração parcial foi mantida.');console.error(error);process.exitCode=1;}finally{client.release();await pool.end();}
