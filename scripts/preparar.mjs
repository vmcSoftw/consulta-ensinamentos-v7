import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from '../lib/env.mjs';

const steps = [
  ['1/3', 'Estrutura do banco', 'schema-neon.mjs'],
  ['2/3', 'Importação do acervo', 'import-neon.mjs'],
  ['3/3', 'Verificação final', 'check-neon.mjs']
];

for (const [n, title, file] of steps) {
  console.log(`\n=== ${n} ${title} ===`);
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', file)], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('\nPreparação interrompida. Corrija o erro acima e execute novamente: npm run preparar');
    process.exit(result.status ?? 1);
  }
}

console.log('\nTudo pronto. Agora execute: npm run dev');
console.log('Depois abra: http://localhost:3000\n');
