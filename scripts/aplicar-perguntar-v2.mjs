import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "app", "api", "ask", "route.ts");
const source = path.join(root, "perguntar-v2", "route.ts");

if (!fs.existsSync(path.join(root, "app", "page.tsx"))) {
  console.error("Execute este script na raiz do projeto Next.js.");
  process.exit(1);
}

if (!fs.existsSync(source)) {
  console.error("Arquivo perguntar-v2/route.ts não encontrado.");
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });

if (fs.existsSync(target)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `${target}.backup-${stamp}`;
  fs.copyFileSync(target, backup);
  console.log("Backup criado:", path.relative(root, backup));
}

fs.copyFileSync(source, target);
console.log("Perguntar V2 aplicado em:", path.relative(root, target));
console.log("A interface atual foi preservada.");
console.log("Próximo passo: npm run dev");
