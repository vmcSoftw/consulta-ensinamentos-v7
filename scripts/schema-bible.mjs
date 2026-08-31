import pg from 'pg';
import { requireDatabaseUrl } from '../lib/env.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: requireDatabaseUrl(), max: 1 });
const client = await pool.connect();

const statements = [
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  `CREATE TABLE IF NOT EXISTS public.bible_versions (
    id BIGSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    edition TEXT,
    publisher TEXT,
    source_title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS public.bible_books (
    id BIGSERIAL PRIMARY KEY,
    version_id BIGINT NOT NULL REFERENCES public.bible_versions(id) ON DELETE CASCADE,
    book_order INTEGER NOT NULL,
    testament TEXT NOT NULL,
    name TEXT NOT NULL,
    abbreviation TEXT NOT NULL,
    chapters INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT bible_books_version_order_unique UNIQUE(version_id, book_order)
  )`,
  `CREATE TABLE IF NOT EXISTS public.bible_verses (
    id BIGSERIAL PRIMARY KEY,
    version_id BIGINT NOT NULL REFERENCES public.bible_versions(id) ON DELETE CASCADE,
    book_id BIGINT NOT NULL REFERENCES public.bible_books(id) ON DELETE CASCADE,
    book_order INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    text TEXT NOT NULL,
    pdf_page INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT bible_verses_reference_unique UNIQUE(version_id, book_order, chapter, verse)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bible_books_name ON public.bible_books(version_id, name)`,
  `CREATE INDEX IF NOT EXISTS idx_bible_verses_reference ON public.bible_verses(version_id, book_order, chapter, verse)`,
  `CREATE INDEX IF NOT EXISTS idx_bible_verses_book_chapter ON public.bible_verses(book_id, chapter, verse)`,
  `CREATE INDEX IF NOT EXISTS idx_bible_verses_fts ON public.bible_verses USING GIN (to_tsvector('portuguese'::regconfig, text))`,
  `CREATE INDEX IF NOT EXISTS idx_bible_verses_text_norm_trgm ON public.bible_verses USING GIN (lower(translate(text, 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')) gin_trgm_ops)`
];

try {
  console.log('Criando/verificando estrutura da Pesquisa Bíblica...');
  await client.query('BEGIN');
  for (const sql of statements) await client.query(sql);
  await client.query('COMMIT');
  console.log('Estrutura bíblica: OK');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Falha ao preparar a estrutura bíblica.');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
