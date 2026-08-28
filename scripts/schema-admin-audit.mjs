import pg from 'pg';
import { requireDatabaseUrl } from '../lib/env.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: requireDatabaseUrl(), max: 1 });
const client = await pool.connect();

const statements = [
`CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id BIGINT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id BIGINT,
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
)`,
`CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON public.admin_audit_log (created_at DESC)`,
`CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action_created_at
  ON public.admin_audit_log (action, created_at DESC)`,
`CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity
  ON public.admin_audit_log (entity_type, entity_id)
  WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL`
];

try {
  console.log('Criando/verificando estrutura de histórico e auditoria...');
  await client.query('BEGIN');
  for (const sql of statements) await client.query(sql);
  await client.query(`
    INSERT INTO public.admin_audit_log (action, entity_type, summary, details)
    SELECT 'system.audit.enabled', 'system', 'Histórico e auditoria administrativa ativados.', '{"version":"V7"}'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM public.admin_audit_log WHERE action='system.audit.enabled')
  `);
  await client.query('COMMIT');
  console.log('Histórico administrativo: OK');
  console.log('Novos logins, cadastros, importações por PDF e ações administrativas passarão a ser registrados.');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Falha ao preparar o histórico administrativo.');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
