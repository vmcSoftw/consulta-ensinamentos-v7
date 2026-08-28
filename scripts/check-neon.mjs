import pg from 'pg';
import { requireDatabaseUrl } from '../lib/env.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: requireDatabaseUrl(), max: 1 });

try {
  const meta = await pool.query(`SELECT current_database() AS banco, current_user AS usuario, now() AS horario`);
  const tables = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('documents','source_sections','topics','search_synonyms')
    ORDER BY table_name
  `);

  console.log('\nConexão com Neon: OK');
  console.table(meta.rows);
  console.log(`Tabelas da aplicação encontradas: ${tables.rowCount}/4`);

  if (tables.rowCount === 4) {
    const counts = await pool.query(`SELECT
      (SELECT count(*) FROM documents)::int AS documentos,
      (SELECT count(*) FROM source_sections)::int AS fontes,
      (SELECT count(*) FROM topics)::int AS topicos,
      (SELECT count(*) FROM search_synonyms)::int AS sinonimos
    `);
    console.table(counts.rows);
  } else {
    console.log('Execute: npm run preparar');
  }
} catch (error) {
  console.error('\nNão foi possível conectar ao Neon.');
  console.error(error?.message || error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
