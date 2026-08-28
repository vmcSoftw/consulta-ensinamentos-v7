import pg from 'pg';
import { requireDatabaseUrl } from '../lib/env.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: requireDatabaseUrl(), max: 1 });
const client = await pool.connect();

const statements = [
  `CREATE TABLE IF NOT EXISTS public.documents (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    file_name TEXT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS public.source_sections (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    year INTEGER,
    source_type TEXT,
    title TEXT NOT NULL,
    page_start INTEGER,
    page_end INTEGER,
    source_order INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS public.topics (
    id BIGSERIAL PRIMARY KEY,
    source_section_id BIGINT NOT NULL REFERENCES public.source_sections(id) ON DELETE CASCADE,
    topic_number TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    page_start INTEGER,
    page_end INTEGER,
    category TEXT,
    keywords TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS public.search_synonyms (
    id BIGSERIAL PRIMARY KEY,
    term TEXT NOT NULL,
    related_term TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT search_synonyms_term_related_unique UNIQUE (term, related_term)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_source_sections_year ON public.source_sections(year)`,
  `CREATE INDEX IF NOT EXISTS idx_source_sections_type ON public.source_sections(source_type)`,
  `CREATE INDEX IF NOT EXISTS idx_topics_source_section ON public.topics(source_section_id)`,
  `CREATE INDEX IF NOT EXISTS idx_topics_category ON public.topics(category)`,
  `CREATE INDEX IF NOT EXISTS idx_topics_keywords_gin ON public.topics USING GIN(keywords)`,
  `CREATE INDEX IF NOT EXISTS idx_topics_search_fts ON public.topics USING GIN (
    to_tsvector('portuguese'::regconfig, coalesce(title, '') || ' ' || coalesce(content, ''))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_search_synonyms_term_lower ON public.search_synonyms (lower(term))`,
  `CREATE INDEX IF NOT EXISTS idx_search_synonyms_related_lower ON public.search_synonyms (lower(related_term))`
];

try {
  console.log('Criando/verificando a estrutura do banco...');
  await client.query('BEGIN');
  for (const sql of statements) await client.query(sql);
  await client.query('COMMIT');
  console.log('Estrutura do banco: OK');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Falha ao preparar a estrutura do banco.');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
