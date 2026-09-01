import fs from "node:fs";
import path from "node:path";
import pg from "pg";
const { Client } = pg;

function loadEnvLocal() {
  const p = path.resolve(".env.local");
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
function norm(s="") {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
}
function qid(s) {
  return '"' + String(s).replaceAll('"','""') + '"';
}
function patchVersionLabels() {
  const roots=["app","lib","data"];
  const changed=[];
  const skip=new Set(["node_modules",".next",".git",".vercel"]);
  const exts=new Set([".ts",".tsx",".js",".jsx",".mjs",".cjs",".json"]);
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir,{withFileTypes:true})) {
      if (skip.has(ent.name)) continue;
      const p=path.join(dir,ent.name);
      if (ent.isDirectory()) walk(p);
      else if (exts.has(path.extname(ent.name))) {
        const before=fs.readFileSync(p,"utf8");
        let after=before;
        after=after.replaceAll("ARC1995","ARC2009");
        after=after.replaceAll("ARC 1995","ARC 2009");
        after=after.replaceAll("Almeida Revista e Corrigida 1995","Almeida Revista e Corrigida 2009");
        if (after.includes("ARC2009") || after.includes("Almeida Revista e Corrigida")) {
          after=after.replace(/(edition\s*:\s*["'])1995(["'])/g,"$12009$2");
          after=after.replace(/("edition"\s*:\s*")1995(")/g,"$12009$2");
        }
        if (after!==before) {
          fs.writeFileSync(p,after,"utf8");
          changed.push(p);
        }
      }
    }
  }
  for (const r of roots) walk(r);
  return changed;
}

loadEnvLocal();
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não encontrada em .env.local nem no ambiente.");
  process.exit(1);
}
const dataPath=path.resolve("data","biblia-arc2009.json");
if (!fs.existsSync(dataPath)) {
  console.error("Arquivo não encontrado:",dataPath);
  process.exit(1);
}
const payload=JSON.parse(fs.readFileSync(dataPath,"utf8"));
if (payload?.source?.verses!==31105 || payload?.source?.books!==66 || payload?.source?.chapters!==1189) {
  throw new Error("Pacote ARC2009 inválido ou incompleto.");
}

const client=new Client({connectionString:process.env.DATABASE_URL});
await client.connect();

const colsRes=await client.query(`
  SELECT column_name, is_nullable, column_default, is_identity, is_generated
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='bible_verses'
  ORDER BY ordinal_position
`);
if (!colsRes.rowCount) throw new Error("Tabela public.bible_verses não encontrada.");

const cols=new Map(colsRes.rows.map(r=>[r.column_name,r]));
const required=["book_order","book","abbreviation","chapter","verse","text","pdf_page"];
for (const c of required) if (!cols.has(c)) throw new Error(`Coluna obrigatória ausente: ${c}`);

const optional=["testament","version_code","version_name","edition","text_norm"];
const insertCols=[...required];
for (const c of optional) {
  const meta=cols.get(c);
  if (meta && meta.is_generated==="NEVER") insertCols.push(c);
}

const stamp=new Date().toISOString().slice(0,10).replaceAll("-","");
const backup=`bible_verses_backup_before_arc2009_${stamp}`;

console.log("Substituição da Bíblia por ARC 2009");
console.log("-----------------------------------");
console.log("Versículos do novo pacote:",payload.verses.length);
console.log("Backup:",backup);

try {
  await client.query("BEGIN");
  await client.query(`CREATE TABLE IF NOT EXISTS ${qid(backup)} AS TABLE public.bible_verses WITH DATA`);
  await client.query("TRUNCATE TABLE public.bible_verses RESTART IDENTITY");

  const batchSize=400;
  for (let start=0; start<payload.verses.length; start+=batchSize) {
    const batch=payload.verses.slice(start,start+batchSize);
    const vals=[];
    const rows=[];
    for (const v of batch) {
      const row=[];
      for (const c of insertCols) {
        let value=v[c];
        if (c==="text_norm") value=norm(v.text);
        row.push(value);
      }
      const base=vals.length;
      vals.push(...row);
      rows.push("(" + row.map((_,i)=>"$"+(base+i+1)).join(",") + ")");
    }
    await client.query(
      `INSERT INTO public.bible_verses (${insertCols.map(qid).join(",")}) VALUES ${rows.join(",")}`,
      vals
    );
    process.stdout.write(`\rImportados ${Math.min(start+batch.length,payload.verses.length)} / ${payload.verses.length}`);
  }
  process.stdout.write("\n");

  const check=await client.query(`
    SELECT
      count(*)::int AS verses,
      count(DISTINCT book)::int AS books,
      count(DISTINCT (book, chapter))::int AS chapters
    FROM public.bible_verses
  `);
  const got=check.rows[0];
  if (got.verses!==31105 || got.books!==66 || got.chapters!==1189) {
    throw new Error(`Validação falhou: ${JSON.stringify(got)}`);
  }

  await client.query("COMMIT");
  await client.query("ANALYZE public.bible_verses");

  const changed=patchVersionLabels();
  console.log("Banco validado: 66 livros · 1189 capítulos · 31105 versículos");
  console.log("Rótulo da versão: ARC2009 / edição 2009");
  if (changed.length) {
    console.log("Arquivos locais atualizados para ARC2009:");
    for (const p of changed) console.log("-",p);
  } else {
    console.log("Nenhuma ocorrência local de ARC1995 foi encontrada para atualizar.");
  }
  console.log("Concluído com sucesso.");
  console.log("O backup anterior foi preservado em:",backup);
} catch (err) {
  try { await client.query("ROLLBACK"); } catch {}
  console.error("\nFalha. Nenhuma substituição foi confirmada.");
  console.error(err?.stack || err);
  process.exitCode=1;
} finally {
  await client.end();
}
