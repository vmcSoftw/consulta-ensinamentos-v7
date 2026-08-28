import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import pg from 'pg';
import { ROOT, requireDatabaseUrl } from '../lib/env.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: requireDatabaseUrl(), max: 1 });
const client = await pool.connect();

const books = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bible-books.json'), 'utf8'));
const versesPath = path.join(ROOT, 'data', 'bible-verses.jsonl');
const VERSION = {
  code: 'ARC1995',
  name: 'Almeida Revista e Corrigida',
  edition: '1995',
  publisher: 'Sociedade Bíblica do Brasil',
  sourceTitle: 'A Bíblia Sagrada — Almeida Revista e Corrigida (ARC) 1995'
};

async function insertVerseBatch(versionId, bookIds, batch) {
  if (!batch.length) return;
  const payload = batch.map(v => ({
    book_order: v.book_order,
    chapter: v.chapter,
    verse: v.verse,
    text: v.text,
    pdf_page: v.pdf_page,
    book_id: bookIds.get(v.book_order)
  }));
  await client.query(`
    INSERT INTO public.bible_verses(version_id, book_id, book_order, chapter, verse, text, pdf_page)
    SELECT $1::bigint, x.book_id, x.book_order, x.chapter, x.verse, x.text, x.pdf_page
    FROM jsonb_to_recordset($2::jsonb) AS x(
      book_id bigint, book_order integer, chapter integer, verse integer, text text, pdf_page integer
    )
    ON CONFLICT(version_id, book_order, chapter, verse)
    DO UPDATE SET text = EXCLUDED.text, pdf_page = EXCLUDED.pdf_page, book_id = EXCLUDED.book_id
  `, [versionId, JSON.stringify(payload)]);
}

try {
  console.log('Importando Bíblia ARC 1995 para o Neon...');
  await client.query('BEGIN');
  const version = (await client.query(`
    INSERT INTO public.bible_versions(code, name, edition, publisher, source_title)
    VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, edition=EXCLUDED.edition, publisher=EXCLUDED.publisher, source_title=EXCLUDED.source_title
    RETURNING id
  `, [VERSION.code, VERSION.name, VERSION.edition, VERSION.publisher, VERSION.sourceTitle])).rows[0];
  const versionId = Number(version.id);

  // Reimportação idempotente: substitui apenas esta versão bíblica.
  await client.query('DELETE FROM public.bible_verses WHERE version_id=$1', [versionId]);
  await client.query('DELETE FROM public.bible_books WHERE version_id=$1', [versionId]);

  const bookIds = new Map();
  for (const b of books) {
    const row = (await client.query(`
      INSERT INTO public.bible_books(version_id, book_order, testament, name, abbreviation, chapters)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id
    `, [versionId, b.order, b.testament, b.name, b.abbreviation, b.chapters])).rows[0];
    bookIds.set(b.order, Number(row.id));
  }

  const rl = readline.createInterface({ input: fs.createReadStream(versesPath, { encoding: 'utf8' }), crlfDelay: Infinity });
  let batch=[]; let total=0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    batch.push(JSON.parse(line));
    if (batch.length >= 750) {
      await insertVerseBatch(versionId, bookIds, batch);
      total += batch.length;
      process.stdout.write(`\rVersículos importados: ${total.toLocaleString('pt-BR')}`);
      batch=[];
    }
  }
  if (batch.length) {
    await insertVerseBatch(versionId, bookIds, batch);
    total += batch.length;
  }

  const counts = (await client.query(`
    SELECT
      (SELECT count(*)::int FROM public.bible_books WHERE version_id=$1) AS books,
      (SELECT count(DISTINCT (book_order, chapter))::int FROM public.bible_verses WHERE version_id=$1) AS chapters,
      (SELECT count(*)::int FROM public.bible_verses WHERE version_id=$1) AS verses
  `, [versionId])).rows[0];

  if (counts.books !== 66 || counts.chapters !== 1189 || counts.verses !== 31105) {
    throw new Error(`Validação inesperada: ${JSON.stringify(counts)}`);
  }

  await client.query('COMMIT');
  console.log(`\nBíblia importada com sucesso: ${counts.books} livros, ${counts.chapters} capítulos e ${counts.verses.toLocaleString('pt-BR')} versículos.`);
} catch (error) {
  await client.query('ROLLBACK');
  console.error('\nFalha na importação da Bíblia. Nenhuma alteração parcial foi mantida.');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
