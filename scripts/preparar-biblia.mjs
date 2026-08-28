import { spawnSync } from 'node:child_process';

for (const script of ['scripts/schema-bible.mjs', 'scripts/import-bible.mjs']) {
  const result = spawnSync(process.execPath, [script], { stdio: 'inherit', shell: false });
  if (result.status !== 0) process.exit(result.status || 1);
}
