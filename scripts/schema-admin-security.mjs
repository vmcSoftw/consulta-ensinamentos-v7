import pg from 'pg';
import { requireDatabaseUrl } from '../lib/env.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: requireDatabaseUrl(), max: 1 });
const client = await pool.connect();

const statements = [
`CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  ip_hash TEXT,
  user_agent_hash TEXT
)`,
`CREATE INDEX IF NOT EXISTS idx_admin_sessions_active
  ON public.admin_sessions (expires_at)
  WHERE revoked_at IS NULL`,
`CREATE TABLE IF NOT EXISTS public.admin_login_attempts (
  identifier_hash TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
`CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_blocked
  ON public.admin_login_attempts (blocked_until)
  WHERE blocked_until IS NOT NULL`
];

try {
  console.log('Criando/verificando estrutura de segurança administrativa...');
  await client.query('BEGIN');
  for (const sql of statements) await client.query(sql);
  await client.query('COMMIT');
  console.log('Segurança administrativa: OK');
  console.log('Sessões revogáveis e proteção contra tentativas repetidas estão prontas.');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Falha ao preparar a segurança administrativa.');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
