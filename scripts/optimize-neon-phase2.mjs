import pg from 'pg';
import { requireDatabaseUrl } from '../lib/env.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: requireDatabaseUrl(), max: 1 });
const client = await pool.connect();

const accents = 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ';
const plain   = 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn';

const indexes = [
  {
    name: 'idx_topics_title_norm_trgm',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_topics_title_norm_trgm
          ON public.topics USING GIN (lower(translate(title, '${accents}', '${plain}')) gin_trgm_ops)`
  },
  {
    name: 'idx_topics_content_norm_trgm',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_topics_content_norm_trgm
          ON public.topics USING GIN (lower(translate(content, '${accents}', '${plain}')) gin_trgm_ops)`
  },
  {
    name: 'idx_topics_title_trgm',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_topics_title_trgm
          ON public.topics USING GIN (title gin_trgm_ops)`
  },
  {
    name: 'idx_topics_content_trgm',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_topics_content_trgm
          ON public.topics USING GIN (content gin_trgm_ops)`
  },
  {
    name: 'idx_bible_verses_text_norm_trgm',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bible_verses_text_norm_trgm
          ON public.bible_verses USING GIN (lower(translate(text, '${accents}', '${plain}')) gin_trgm_ops)`
  },
  {
    name: 'idx_bible_dictionary_headword_norm_trgm',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bible_dictionary_headword_norm_trgm
          ON public.bible_dictionary_entries USING GIN (headword_normalized gin_trgm_ops)`
  }
];

try {
  console.log('Fase 2 — preparando otimizações de pesquisa no Neon...');
  await client.query(`SET statement_timeout = 0`);
  await client.query(`SET lock_timeout = '10s'`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  console.log('Extensão pg_trgm: OK');

  for (const index of indexes) {
    process.stdout.write(`Criando/verificando ${index.name}... `);
    await client.query(index.sql);
    console.log('OK');
  }

  console.log('Atualizando estatísticas do planejador...');
  await client.query('ANALYZE public.topics');
  await client.query('ANALYZE public.source_sections');
  await client.query('ANALYZE public.bible_verses');
  await client.query('ANALYZE public.bible_dictionary_entries');

  const { rows } = await client.query(`
    SELECT c.relname AS index_name,
           pg_size_pretty(pg_relation_size(c.oid)) AS size
    FROM pg_class c
    WHERE c.relname = ANY($1::text[])
    ORDER BY c.relname
  `, [indexes.map(x => x.name)]);

  console.log('\nÍndices da Fase 2:');
  for (const row of rows) console.log(`- ${row.index_name}: ${row.size}`);
  console.log('\nOtimização Fase 2 concluída com sucesso.');
} catch (error) {
  console.error('\nFalha durante a otimização Fase 2.');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
