import pg from 'pg';
import { requireDatabaseUrl } from '../lib/env.mjs';
const { Pool }=pg;
const pool=new Pool({connectionString:requireDatabaseUrl(),max:1});
const client=await pool.connect();
const statements=[
`CREATE EXTENSION IF NOT EXISTS pg_trgm`,
`CREATE TABLE IF NOT EXISTS public.bible_dictionary_sources (
 id BIGSERIAL PRIMARY KEY,
 code TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 edition TEXT,
 authors TEXT[] NOT NULL DEFAULT '{}',
 publisher TEXT,
 source_title TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS public.bible_dictionary_entries (
 id BIGSERIAL PRIMARY KEY,
 source_id BIGINT NOT NULL REFERENCES public.bible_dictionary_sources(id) ON DELETE CASCADE,
 headword TEXT NOT NULL,
 headword_normalized TEXT NOT NULL,
 definition TEXT NOT NULL,
 letter TEXT NOT NULL,
 source_anchor TEXT,
 source_part TEXT,
 links JSONB NOT NULL DEFAULT '[]'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT bible_dictionary_entry_unique UNIQUE(source_id,headword_normalized,source_anchor)
)`,
`CREATE INDEX IF NOT EXISTS idx_bible_dictionary_headword ON public.bible_dictionary_entries(source_id,headword_normalized)`,
`CREATE INDEX IF NOT EXISTS idx_bible_dictionary_letter ON public.bible_dictionary_entries(source_id,letter,headword_normalized)`,
`CREATE INDEX IF NOT EXISTS idx_bible_dictionary_fts ON public.bible_dictionary_entries USING GIN (to_tsvector('portuguese'::regconfig,headword || ' ' || definition))`,
`CREATE INDEX IF NOT EXISTS idx_bible_dictionary_headword_norm_trgm ON public.bible_dictionary_entries USING GIN (headword_normalized gin_trgm_ops)`
];
try{
 console.log('Criando/verificando estrutura do Dicionário Bíblico...');
 await client.query('BEGIN');
 for(const sql of statements) await client.query(sql);
 await client.query('COMMIT');
 console.log('Estrutura do dicionário: OK');
}catch(error){
 await client.query('ROLLBACK');console.error('Falha ao preparar a estrutura do dicionário.');console.error(error);process.exitCode=1;
}finally{client.release();await pool.end();}
