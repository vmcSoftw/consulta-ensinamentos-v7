import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadLocalEnv } from '../lib/env.mjs';

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const hasEnv = loadLocalEnv();
const dataTopics = fs.readFileSync(path.join(ROOT, 'data', 'topics.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).length;
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sources.json'), 'utf8')).length;

console.log('\nConsulta de Ensinamentos - Diagnóstico V6');
console.log('Pasta atual:', process.cwd());
console.log('Pasta do projeto:', ROOT);
console.log('Projeto:', pkg.name, pkg.version);
console.log('Node:', process.version);
console.log('.env.local:', hasEnv ? 'encontrado' : 'NÃO encontrado');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'configurada' : 'NÃO configurada');
console.log('Fontes no pacote:', sources);
console.log('Tópicos no pacote:', dataTopics);
console.log('Scripts:', Object.keys(pkg.scripts).join(', '));
console.log('');
