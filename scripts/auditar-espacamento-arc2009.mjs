import fs from "node:fs"; import path from "node:path"; import pg from "pg";
const {Client}=pg;
const p=path.resolve(".env.local");
if(fs.existsSync(p)){for(const raw of fs.readFileSync(p,"utf8").split(/\r?\n/)){const l=raw.trim();if(!l||l.startsWith("#"))continue;const i=l.indexOf("=");if(i<1)continue;const k=l.slice(0,i).trim();let v=l.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!process.env[k])process.env[k]=v;}}
if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL não encontrada.");
const patch=JSON.parse(fs.readFileSync(path.resolve("data","correcoes-espacamento-arc2009.json"),"utf8"));
const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
let exact=0,already=0,changed=0,unexpected=[];
for(const x of patch.patches){
 const r=await c.query(`SELECT text FROM bible_verses WHERE book_order=$1 AND chapter=$2 AND verse=$3 LIMIT 1`,[x.book_order,x.chapter,x.verse]);
 const t=r.rows[0]?.text;
 if(t===x.before) exact++;
 else if(t===x.after) already++;
 else {changed++; unexpected.push({ref:`${x.book} ${x.chapter}:${x.verse}`,db:t,before:x.before,after:x.after});}
}
console.log("REVISÃO TEXTUAL — PRÉ-CORREÇÃO");
console.log("Patches previstos:",patch.patch_count);
console.log("Prontos para corrigir:",exact);
console.log("Já corrigidos:",already);
console.log("Conteúdo inesperado:",changed);
if(unexpected.length){console.log("\nAmostras inesperadas:");console.log(unexpected.slice(0,10));}
await c.end();
