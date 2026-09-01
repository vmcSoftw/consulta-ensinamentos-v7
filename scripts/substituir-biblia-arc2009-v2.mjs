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

function qid(s) {
  return '"' + String(s).replaceAll('"','""') + '"';
}

function patchVersionLabels() {
  const roots = ["app","lib","data"];
  const changed = [];
  const skip = new Set(["node_modules",".next",".git",".vercel"]);
  const exts = new Set([".ts",".tsx",".js",".jsx",".mjs",".cjs",".json"]);

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir,{withFileTypes:true})) {
      if (skip.has(ent.name)) continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (exts.has(path.extname(ent.name))) {
        const before = fs.readFileSync(p,"utf8");
        let after = before
          .replaceAll("ARC1995","ARC2009")
          .replaceAll("ARC 1995","ARC 2009")
          .replaceAll("Almeida Revista e Corrigida 1995","Almeida Revista e Corrigida 2009");
        after = after.replace(/(edition\s*:\s*["'])1995(["'])/g,"$12009$2");
        after = after.replace(/("edition"\s*:\s*")1995(")/g,"$12009$2");
        if (after !== before) {
          fs.writeFileSync(p, after, "utf8");
          changed.push(p);
        }
      }
    }
  }
  for (const r of roots) walk(r);
  return changed;
}

async function getForeignTarget(client, columnName) {
  const r = await client.query(`
    SELECT ccu.table_schema, ccu.table_name, ccu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'bible_verses'
      AND kcu.column_name = $1
    LIMIT 1
  `,[columnName]);
  return r.rows[0] || null;
}

async function updateVersionMetadata(client, versionId) {
  const fk = await getForeignTarget(client, "version_id");
  if (!fk) {
    console.log("Aviso: não encontrei FK de version_id; metadados da versão não foram alterados no banco.");
    return;
  }

  const colsRes = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema=$1 AND table_name=$2
  `,[fk.table_schema, fk.table_name]);
  const cols = new Set(colsRes.rows.map(r => r.column_name));

  const setters = [];
  const vals = [];
  function add(col, val) {
    if (!cols.has(col)) return;
    vals.push(val);
    setters.push(`${qid(col)} = $${vals.length}`);
  }

  add("code","ARC2009");
  add("version_code","ARC2009");
  add("name","Almeida Revista e Corrigida");
  add("version_name","Almeida Revista e Corrigida");
  add("edition","2009");
  add("year",2009);

  if (!setters.length) {
    console.log(`Aviso: tabela ${fk.table_name} não possui colunas de metadados reconhecidas.`);
    return;
  }

  vals.push(versionId);
  await client.query(
    `UPDATE ${qid(fk.table_schema)}.${qid(fk.table_name)}
     SET ${setters.join(", ")}
     WHERE ${qid(fk.column_name)} = $${vals.length}`,
    vals
  );
  console.log(`Metadados atualizados em ${fk.table_schema}.${fk.table_name}.`);
}

loadEnvLocal();
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não encontrada em .env.local nem no ambiente.");
  process.exit(1);
}

const dataPath = path.resolve("data","biblia-arc2009.json");
if (!fs.existsSync(dataPath)) {
  console.error("Arquivo não encontrado:", dataPath);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(dataPath,"utf8"));
if (payload?.source?.verses !== 31105 || payload?.source?.books !== 66 || payload?.source?.chapters !== 1189) {
  throw new Error("Pacote ARC2009 inválido ou incompleto.");
}

const client = new Client({connectionString:process.env.DATABASE_URL});
await client.connect();

console.log("Substituição segura da Bíblia por ARC 2009");
console.log("------------------------------------------");

const schema = await client.query(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='bible_verses'
`);
const cols = new Set(schema.rows.map(r => r.column_name));
const expected = ["id","version_id","book_id","book_order","chapter","verse","text","pdf_page"];
for (const c of expected) {
  if (!cols.has(c)) throw new Error(`Estrutura inesperada: coluna ${c} não encontrada.`);
}

const versionIds = await client.query(`SELECT DISTINCT version_id FROM public.bible_verses ORDER BY version_id`);
if (versionIds.rowCount !== 1) {
  throw new Error(`Esperado 1 version_id atual, encontrados ${versionIds.rowCount}.`);
}
const versionId = versionIds.rows[0].version_id;

const bookMapRes = await client.query(`
  SELECT book_order, min(book_id) AS book_id, count(DISTINCT book_id)::int AS ids
  FROM public.bible_verses
  GROUP BY book_order
  ORDER BY book_order
`);
if (bookMapRes.rowCount !== 66) {
  throw new Error(`Esperados 66 livros na base atual, encontrados ${bookMapRes.rowCount}.`);
}
for (const r of bookMapRes.rows) {
  if (r.ids !== 1) throw new Error(`book_order ${r.book_order} possui mais de um book_id.`);
}
const bookMap = new Map(bookMapRes.rows.map(r => [Number(r.book_order), r.book_id]));

const stamp = new Date().toISOString().replace(/[-:TZ.]/g,"").slice(0,14);
const backup = `bible_verses_backup_before_arc2009_${stamp}`;

console.log("Versão atual ID:", versionId);
console.log("Mapeamento de livros:", bookMap.size);
console.log("Novo pacote:", payload.verses.length, "versículos");
console.log("Backup:", backup);

try {
  await client.query("BEGIN");

  await client.query(`CREATE TABLE ${qid(backup)} AS TABLE public.bible_verses WITH DATA`);
  await client.query("TRUNCATE TABLE public.bible_verses RESTART IDENTITY");

  const insertCols = ["version_id","book_id","book_order","chapter","verse","text","pdf_page"];
  const batchSize = 400;

  for (let start=0; start<payload.verses.length; start+=batchSize) {
    const batch = payload.verses.slice(start,start+batchSize);
    const vals = [];
    const rows = [];

    for (const v of batch) {
      const bookId = bookMap.get(Number(v.book_order));
      if (bookId == null) throw new Error(`book_id não encontrado para book_order ${v.book_order}`);

      const row = [
        versionId,
        bookId,
        Number(v.book_order),
        Number(v.chapter),
        Number(v.verse),
        v.text,
        Number(v.pdf_page)
      ];
      const base = vals.length;
      vals.push(...row);
      rows.push("(" + row.map((_,i)=>"$"+(base+i+1)).join(",") + ")");
    }

    await client.query(
      `INSERT INTO public.bible_verses (${insertCols.map(qid).join(",")})
       VALUES ${rows.join(",")}`,
      vals
    );
    process.stdout.write(`\rImportados ${Math.min(start+batch.length,payload.verses.length)} / ${payload.verses.length}`);
  }
  process.stdout.write("\n");

  const check = await client.query(`
    SELECT
      count(*)::int AS verses,
      count(DISTINCT book_order)::int AS books,
      count(DISTINCT (book_order, chapter))::int AS chapters,
      min(book_order)::int AS first_book,
      max(book_order)::int AS last_book
    FROM public.bible_verses
  `);
  const got = check.rows[0];

  if (got.verses !== 31105 || got.books !== 66 || got.chapters !== 1189 || got.first_book !== 1 || got.last_book !== 66) {
    throw new Error(`Validação falhou: ${JSON.stringify(got)}`);
  }

  await updateVersionMetadata(client, versionId);

  await client.query("COMMIT");
  await client.query("ANALYZE public.bible_verses");

  const changed = patchVersionLabels();

  console.log("Banco validado: 66 livros · 1189 capítulos · 31105 versículos");
  console.log("Versão configurada: ARC2009 / edição 2009");
  console.log("Primeiro backup preservado em:", backup);

  if (changed.length) {
    console.log("Arquivos locais atualizados para ARC2009:");
    for (const p of changed) console.log("-",p);
  } else {
    console.log("Nenhuma ocorrência local de ARC1995 precisou ser alterada.");
  }

  console.log("Concluído com sucesso.");
} catch (err) {
  try { await client.query("ROLLBACK"); } catch {}
  console.error("\nFalha. A transação foi revertida.");
  console.error(err?.stack || err);
  process.exitCode = 1;
} finally {
  await client.end();
}
