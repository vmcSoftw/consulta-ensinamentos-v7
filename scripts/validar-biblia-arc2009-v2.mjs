import fs from "node:fs";
import path from "node:path";
import pg from "pg";
const { Client } = pg;

const p = path.resolve(".env.local");
if (fs.existsSync(p)) {
  for (const raw of fs.readFileSync(p,"utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0,i).trim();
    let v = line.slice(i+1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v=v.slice(1,-1);
    if (!process.env[k]) process.env[k]=v;
  }
}

const c = new Client({connectionString:process.env.DATABASE_URL});
await c.connect();

const count = await c.query(`
  SELECT count(*)::int verses,
         count(DISTINCT book_order)::int books,
         count(DISTINCT (book_order,chapter))::int chapters,
         min(pdf_page)::int first_pdf_page,
         max(pdf_page)::int last_pdf_page
  FROM bible_verses
`);
console.log("Estrutura:", count.rows[0]);

const first = await c.query(`
  SELECT book_order,chapter,verse,text,pdf_page
  FROM bible_verses
  ORDER BY book_order,chapter,verse
  LIMIT 1
`);
const last = await c.query(`
  SELECT book_order,chapter,verse,text,pdf_page
  FROM bible_verses
  ORDER BY book_order DESC,chapter DESC,verse DESC
  LIMIT 1
`);
console.log("Primeiro:", first.rows[0]);
console.log("Último:", last.rows[0]);

await c.end();
