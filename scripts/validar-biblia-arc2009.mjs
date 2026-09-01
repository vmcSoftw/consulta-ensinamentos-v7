import fs from "node:fs";
import path from "node:path";
import pg from "pg";
const { Client }=pg;
const env=path.resolve(".env.local");
if (fs.existsSync(env)) {
  for (const raw of fs.readFileSync(env,"utf8").split(/\r?\n/)) {
    const i=raw.indexOf("="); if (i<1 || raw.trim().startsWith("#")) continue;
    const k=raw.slice(0,i).trim(); let v=raw.slice(i+1).trim().replace(/^['"]|['"]$/g,"");
    if (!process.env[k]) process.env[k]=v;
  }
}
const c=new Client({connectionString:process.env.DATABASE_URL});
await c.connect();
const r=await c.query(`
  SELECT count(*)::int verses,
         count(DISTINCT book)::int books,
         count(DISTINCT (book,chapter))::int chapters,
         min(pdf_page)::int first_pdf_page,
         max(pdf_page)::int last_pdf_page
  FROM bible_verses
`);
console.log(r.rows[0]);
const first=await c.query(`SELECT book,chapter,verse,text,pdf_page FROM bible_verses ORDER BY book_order,chapter,verse LIMIT 1`);
const last=await c.query(`SELECT book,chapter,verse,text,pdf_page FROM bible_verses ORDER BY book_order DESC,chapter DESC,verse DESC LIMIT 1`);
console.log("Primeiro:",first.rows[0]);
console.log("Último:",last.rows[0]);
await c.end();
