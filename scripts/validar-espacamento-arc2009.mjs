import fs from "node:fs";import path from "node:path";import pg from "pg";
const {Client}=pg;const p=path.resolve(".env.local");
if(fs.existsSync(p)){for(const raw of fs.readFileSync(p,"utf8").split(/\r?\n/)){const l=raw.trim();if(!l||l.startsWith("#"))continue;const i=l.indexOf("=");if(i<1)continue;const k=l.slice(0,i).trim();let v=l.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!process.env[k])process.env[k]=v;}}
const patch=JSON.parse(fs.readFileSync(path.resolve("data","correcoes-espacamento-arc2009.json"),"utf8"));
const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();
let ok=0,bad=[];
for(const x of patch.patches){const r=await c.query(`SELECT text FROM bible_verses WHERE book_order=$1 AND chapter=$2 AND verse=$3 LIMIT 1`,[x.book_order,x.chapter,x.verse]);if(r.rows[0]?.text===x.after)ok++;else bad.push(`${x.book} ${x.chapter}:${x.verse}`);}
const s=await c.query(`SELECT count(*)::int verses,count(DISTINCT book_order)::int books,count(DISTINCT(book_order,chapter))::int chapters,count(*) FILTER(WHERE text IS NULL OR btrim(text)='')::int empty FROM bible_verses`);
console.log("Estrutura:",s.rows[0]);console.log("Correções textuais confirmadas:",ok,"/",patch.patch_count);console.log("Pendências:",bad.length);if(bad.length)console.log(bad.slice(0,20));await c.end();
