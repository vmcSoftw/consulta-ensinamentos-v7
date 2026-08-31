import pg from 'pg';
import { requireDatabaseUrl } from '../lib/env.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: requireDatabaseUrl(), max: 1 });
const client = await pool.connect();

const accents = 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ';
const plain   = 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn';

function interestingPlanLines(text) {
  return String(text || '')
    .split('\n')
    .filter(line => /Execution Time|Planning Time|Index Scan|Bitmap Index Scan|Bitmap Heap Scan|Seq Scan/i.test(line));
}

const checks = [
  {
    name: 'Ensinamentos — busca parcial normalizada em conteúdo',
    sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
          SELECT id FROM public.topics
          WHERE lower(translate(content, '${accents}', '${plain}')) LIKE '%casamento%'
          LIMIT 30`
  },
  {
    name: 'Referências bíblicas nos ensinamentos — regex',
    sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
          SELECT id FROM public.topics
          WHERE title ~* 'Mateus[.]?[[:space:]]*19[[:space:]]*[:.,][[:space:]]*9'
             OR content ~* 'Mateus[.]?[[:space:]]*19[[:space:]]*[:.,][[:space:]]*9'
          LIMIT 12`
  },
  {
    name: 'Bíblia — busca parcial sem acento',
    sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
          SELECT id FROM public.bible_verses
          WHERE lower(translate(text, '${accents}', '${plain}')) LIKE '%graca%'
          LIMIT 80`
  },
  {
    name: 'Dicionário — busca parcial de verbete',
    sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
          SELECT id FROM public.bible_dictionary_entries
          WHERE headword_normalized LIKE '%adoracao%'
          LIMIT 80`
  }
];

try {
  console.log('Diagnóstico de desempenho — Fase 2');
  console.log('-----------------------------------');
  for (const check of checks) {
    const { rows } = await client.query(check.sql);
    const plan = rows.map(r => r['QUERY PLAN']).join('\n');
    console.log(`\n${check.name}`);
    const lines = interestingPlanLines(plan);
    console.log(lines.length ? lines.join('\n') : plan);
  }

  const { rows: indexRows } = await client.query(`
    SELECT indexrelname,
           idx_scan,
           pg_size_pretty(pg_relation_size(indexrelid)) AS size
    FROM pg_stat_user_indexes
    WHERE indexrelname = ANY($1::text[])
    ORDER BY indexrelname
  `, [[
    'idx_topics_title_norm_trgm',
    'idx_topics_content_norm_trgm',
    'idx_topics_title_trgm',
    'idx_topics_content_trgm',
    'idx_bible_verses_text_norm_trgm',
    'idx_bible_dictionary_headword_norm_trgm'
  ]]);
  if (indexRows.length) {
    console.log('\nÍndices Fase 2 presentes:');
    for (const row of indexRows) console.log(`- ${row.indexrelname}: ${row.size} · scans=${row.idx_scan}`);
  }
} catch (error) {
  console.error('Falha ao executar o diagnóstico Fase 2.');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
