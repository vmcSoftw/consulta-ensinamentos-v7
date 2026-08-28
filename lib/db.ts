import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL não configurada. Crie .env.local a partir de .env.example.');
}

const globalForDb = globalThis as unknown as { consultaPool?: Pool };

export const pool = globalForDb.consultaPool ?? new Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

if (process.env.NODE_ENV !== 'production') globalForDb.consultaPool = pool;
