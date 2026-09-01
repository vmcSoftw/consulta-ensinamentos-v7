import fs from "node:fs"; import path from "node:path"; import pg from "pg";
const {Client}=pg;
const p=path.resolve(".env.local");
if(fs.existsSync(p)){for(const raw of fs.readFileSync(p,"utf8").split(/\r?\n/)){const l=raw.trim();if(!l||l.startsWith("#"))continue;const i=l.indexOf("=");if(i<1)continue;const k=l.slice(0,i).trim();let v=l.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!process.env[k])process.env[k]=v;}}
const src=JSON.parse(fs.readFileSync(path.resolve("data","biblia-arc2009-auditada.json"),"utf8"));
const sm=new Map(src.verses.map(v=>[`${v.book_order}:${v.chapter}:${v.verse}`,v]));
const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
const db=await c.query(`SELECT book_order,chapter,verse,text,pdf_page FROM bible_verses ORDER BY book_order,chapter,verse`);
let diff=0,missing=0,extra=0; const dm=new Map(db.rows.map(v=>[`${v.book_order}:${v.chapter}:${v.verse}`,v]));
for(const [k,v] of sm){const x=dm.get(k);if(!x){missing++;continue;}if(x.text!==v.text||Number(x.pdf_page)!==Number(v.pdf_page))diff++;}
for(const k of dm.keys())if(!sm.has(k))extra++;
const s=await c.query(`SELECT count(*)::int verses,count(DISTINCT book_order)::int books,count(DISTINCT(book_order,chapter))::int chapters,count(*) FILTER(WHERE text IS NULL OR btrim(text)='')::int empty FROM bible_verses`);
const gaps=await c.query(`SELECT count(*)::int bad FROM (SELECT book_order,chapter,min(verse) mn,max(verse) mx,count(*) ct,count(DISTINCT verse)dct FROM bible_verses GROUP BY book_order,chapter HAVING min(verse)<>1 OR count(*)<>max(verse) OR count(DISTINCT verse)<>count(*))x`);
console.log("Estrutura:",s.rows[0]);console.log("Diferenças da fonte:",diff);console.log("Ausentes:",missing);console.log("Extras:",extra);console.log("Capítulos com sequência incompleta:",gaps.rows[0].bad);
await c.end();
