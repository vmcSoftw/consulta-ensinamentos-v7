import fs from "node:fs";
import path from "node:path";
import pg from "pg";
const { Client } = pg;

function loadEnv(){
  const p=path.resolve(".env.local");
  if(!fs.existsSync(p)) return;
  for(const raw of fs.readFileSync(p,"utf8").split(/\r?\n/)){
    const l=raw.trim(); if(!l||l.startsWith("#")) continue;
    const i=l.indexOf("="); if(i<1) continue;
    const k=l.slice(0,i).trim(); let v=l.slice(i+1).trim();
    if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
    if(!process.env[k]) process.env[k]=v;
  }
}
loadEnv();
if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL não encontrada.");

const src=JSON.parse(fs.readFileSync(path.resolve("data","biblia-arc2009-auditada.json"),"utf8"));
const c=new Client({connectionString:process.env.DATABASE_URL});
await c.connect();

const db=await c.query(`
  SELECT book_order,chapter,verse,text,pdf_page
  FROM public.bible_verses
  ORDER BY book_order,chapter,verse
`);
const sourceMap=new Map(src.verses.map(v=>[`${v.book_order}:${v.chapter}:${v.verse}`,v]));
const dbMap=new Map(db.rows.map(v=>[`${v.book_order}:${v.chapter}:${v.verse}`,v]));

let missing=0,extra=0,different=0,empty=0;
const affectedChapters=new Set();
const samples=[];

for(const [k,v] of sourceMap){
  const cur=dbMap.get(k);
  if(!cur){missing++; affectedChapters.add(`${v.book_order}:${v.chapter}`); continue;}
  if(!String(cur.text||"").trim()) empty++;
  if(cur.text!==v.text || Number(cur.pdf_page)!==Number(v.pdf_page)){
    different++;
    affectedChapters.add(`${v.book_order}:${v.chapter}`);
    if(samples.length<20) samples.push({
      referencia:`${v.book} ${v.chapter}:${v.verse}`,
      banco:cur.text,
      fonte:v.text
    });
  }
}
for(const k of dbMap.keys()) if(!sourceMap.has(k)) extra++;

const structure=await c.query(`
 SELECT count(*)::int verses,
        count(DISTINCT book_order)::int books,
        count(DISTINCT (book_order,chapter))::int chapters,
        count(*) FILTER (WHERE text IS NULL OR btrim(text)='')::int empty
 FROM public.bible_verses
`);
const duplicates=await c.query(`
 SELECT count(*)::int groups
 FROM (
   SELECT book_order,chapter,verse
   FROM public.bible_verses
   GROUP BY book_order,chapter,verse
   HAVING count(*)>1
 ) x
`);

console.log("\nAUDITORIA GERAL — BÍBLIA ARC 2009");
console.log("----------------------------------");
console.log("Estrutura no banco:",structure.rows[0]);
console.log("Chaves duplicadas:",duplicates.rows[0].groups);
console.log("Versículos ausentes:",missing);
console.log("Versículos extras:",extra);
console.log("Versículos/textos diferentes da fonte:",different);
console.log("Capítulos afetados:",affectedChapters.size);
console.log("Versículos vazios:",empty);

if(samples.length){
  console.log("\nAmostras das divergências:");
  for(const s of samples){
    console.log(`\n${s.referencia}`);
    console.log("BANCO :",s.banco);
    console.log("FONTE :",s.fonte);
  }
}

const report={
  generated_at:new Date().toISOString(),
  database_structure:structure.rows[0],
  duplicate_key_groups:duplicates.rows[0].groups,
  missing_keys:missing,
  extra_keys:extra,
  differing_verses:different,
  affected_chapters:affectedChapters.size,
  empty_verses:empty,
  samples
};
fs.writeFileSync("AUDITORIA-BANCO-BIBLIA-ANTES.json",JSON.stringify(report,null,2),"utf8");
console.log("\nRelatório salvo em AUDITORIA-BANCO-BIBLIA-ANTES.json");
await c.end();
