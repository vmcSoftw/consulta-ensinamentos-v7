import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadLocalEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return false;

  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
  return true;
}

export function requireDatabaseUrl() {
  loadLocalEnv();
  const value = process.env.DATABASE_URL;
  if (!value || value.includes('USUARIO:SENHA@HOST')) {
    console.error('\nERRO: DATABASE_URL ainda não foi configurada.');
    console.error('1) Copie .env.example para .env.local');
    console.error('2) No Neon, copie a Pooled connection string');
    console.error('3) Cole a string em DATABASE_URL no arquivo .env.local\n');
    process.exit(1);
  }
  return value;
}
