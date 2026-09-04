import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const patch = path.join(root, "banco-perguntas-patch");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const files = [
  ["app/api/question-bank/route.ts", "app/api/question-bank/route.ts"],
  ["app/admin/banco-perguntas/page.tsx", "app/admin/banco-perguntas/page.tsx"],
];

if (!fs.existsSync(path.join(root, "app", "page.tsx"))) {
  console.error("Execute este instalador na raiz do projeto Next.js.");
  process.exit(1);
}

for (const [srcRel, dstRel] of files) {
  const src = path.join(patch, srcRel);
  const dst = path.join(root, dstRel);

  if (!fs.existsSync(src)) {
    console.error("Arquivo do patch ausente:", srcRel);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(dst), { recursive: true });

  if (fs.existsSync(dst)) {
    fs.copyFileSync(dst, `${dst}.backup-importador-${stamp}`);
  }

  fs.copyFileSync(src, dst);
  console.log("Atualizado:", dstRel);
}

console.log("\nImportador do Banco de Perguntas V1.1 aplicado.");
console.log("Melhorias: numeração real do DOCX, linhas de PDF, separação segura e revisão de blocos ambíguos.");
console.log("Próximo passo: npm run dev");
