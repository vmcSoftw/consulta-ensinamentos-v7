import fs from "node:fs"; import path from "node:path"; import pg from "pg";
const {Client}=pg;
function env(){const p=path.resolve(".env.local");if(!fs.existsSync(p))return;for(const raw of fs.readFileSync(p,"utf8").split(/\r?\n/)){const l=raw.trim();if(!l||l.startsWith("#"))continue;const i=l.indexOf("=");if(i<1)continue;const k=l.slice(0,i).trim();let v=l.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!process.env[k])process.env[k]=v;}}
function qi(s){return '"'+String(s).replaceAll('"','""')+'"';}
env(); if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL não encontrada.");
const patch=JSON.parse(fs.readFileSync(path.resolve("data","correcoes-espacamento-arc2009.json"),"utf8"));
const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
const stamp=new Date().toISOString().replace(/[-:TZ.]/g,"").slice(0,14);
const backup=`bible_verses_backup_before_spacing_fix_${stamp}`;
try{
  const s=await c.query(`SELECT count(*)::int verses,count(DISTINCT book_order)::int books,count(DISTINCT(book_order,chapter))::int chapters,count(*) FILTER(WHERE text IS NULL OR btrim(text)='')::int empty FROM bible_verses`);
  if(s.rows[0].verses!==31105||s.rows[0].books!==66||s.rows[0].chapters!==1189||s.rows[0].empty!==0) throw new Error("Estrutura da Bíblia não corresponde à base validada.");
  // Valida tudo antes de tocar no banco.
  let pending=0;
  for(const x of patch.patches){
    const r=await c.query(`SELECT text FROM bible_verses WHERE book_order=$1 AND chapter=$2 AND verse=$3 LIMIT 1`,[x.book_order,x.chapter,x.verse]);
    const t=r.rows[0]?.text;
    if(t===x.before) pending++;
    else if(t===x.after) {}
    else throw new Error(`Conteúdo inesperado em ${x.book} ${x.chapter}:${x.verse}. Correção cancelada.`);
  }
  console.log("Criando backup completo:",backup);
  await c.query("BEGIN");
  await c.query(`CREATE TABLE ${qi(backup)} AS TABLE public.bible_verses WITH DATA`);
  let updated=0;
  for(const x of patch.patches){
    const r=await c.query(
      `UPDATE bible_verses SET text=$4 WHERE book_order=$1 AND chapter=$2 AND verse=$3 AND text=$5`,
      [x.book_order,x.chapter,x.verse,x.after,x.before]
    );
    updated+=r.rowCount;
  }
  // pós-validação: todos devem estar exatamente no AFTER
  for(const x of patch.patches){
    const r=await c.query(`SELECT text FROM bible_verses WHERE book_order=$1 AND chapter=$2 AND verse=$3 LIMIT 1`,[x.book_order,x.chapter,x.verse]);
    if(r.rows[0]?.text!==x.after) throw new Error(`Falha de pós-validação em ${x.book} ${x.chapter}:${x.verse}.`);
  }
  const final=await c.query(`SELECT count(*)::int verses,count(DISTINCT book_order)::int books,count(DISTINCT(book_order,chapter))::int chapters,count(*) FILTER(WHERE text IS NULL OR btrim(text)='')::int empty FROM bible_verses`);
  await c.query("COMMIT"); await c.query("ANALYZE bible_verses");
  const report={generated_at:new Date().toISOString(),updated,patches:patch.patch_count,structure:final.rows[0],backup};
  fs.writeFileSync("AUDITORIA-TEXTUAL-DEPOIS.json",JSON.stringify(report,null,2),"utf8");
  console.log("\nREVISÃO TEXTUAL APLICADA");
  console.log("Versículos atualizados:",updated);
  console.log("Patches validados:",patch.patch_count);
  console.log("Estrutura:",final.rows[0]);
  console.log("Backup:",backup);
}catch(e){try{await c.query("ROLLBACK")}catch{};console.error("\nFalha. Nada foi confirmado.");console.error(e?.stack||e);process.exitCode=1;}
finally{await c.end();}
