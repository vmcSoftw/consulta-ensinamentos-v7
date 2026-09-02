import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pagePath = path.join(root, "app", "page.tsx");

if (!fs.existsSync(pagePath)) {
  console.error("Não encontrei app/page.tsx. Execute na raiz do projeto.");
  process.exit(1);
}

let src = fs.readFileSync(pagePath, "utf8");

if (src.includes("evidenceOpenTopic")) {
  console.log("A opção 'Visualizar tópico completo' já está aplicada.");
  process.exit(0);
}

const marker = '<button className="evidenceCard"';
const start = src.indexOf(marker);

if (start < 0) {
  console.error('Não encontrei <button className="evidenceCard"...> em app/page.tsx.');
  console.error("Nenhuma alteração foi feita.");
  process.exit(1);
}

let pos = start;
let depth = 0;
let closeStart = -1;

while (pos < src.length) {
  const nextOpen = src.indexOf("<button", pos);
  const nextClose = src.indexOf("</button>", pos);

  if (nextClose < 0) break;

  if (nextOpen >= 0 && nextOpen < nextClose) {
    depth++;
    pos = nextOpen + 7;
  } else {
    depth--;
    if (depth === 0) {
      closeStart = nextClose;
      break;
    }
    pos = nextClose + 9;
  }
}

if (closeStart < 0) {
  console.error("Não foi possível localizar o fechamento do card de evidência.");
  console.error("Nenhuma alteração foi feita.");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${pagePath}.backup-topico-${stamp}`;
fs.copyFileSync(pagePath, backup);

const insert = `
                <span className="evidenceOpenTopic" aria-hidden="true">
                  Visualizar tópico completo →
                </span>
`;

src = src.slice(0, closeStart) + insert + src.slice(closeStart);
fs.writeFileSync(pagePath, src, "utf8");

const cssCandidates = [
  path.join(root, "app", "globals.css"),
  path.join(root, "app", "page.module.css"),
];

let cssPath = cssCandidates.find((p) => fs.existsSync(p));

if (!cssPath) {
  console.log("Texto aplicado no card, mas nenhum CSS conhecido foi localizado.");
  console.log("Backup:", path.relative(root, backup));
  process.exit(0);
}

let css = fs.readFileSync(cssPath, "utf8");

if (!css.includes(".evidenceOpenTopic")) {
  css += `

/* Ação explícita da aba Perguntar: abrir tópico completo */
.evidenceOpenTopic {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.9rem;
  font-weight: 700;
  font-size: 0.9rem;
  letter-spacing: 0.01em;
  color: #9a7427;
  transition: transform 160ms ease, opacity 160ms ease;
}

.evidenceCard:hover .evidenceOpenTopic,
.evidenceCard:focus-visible .evidenceOpenTopic {
  transform: translateX(3px);
}
`;
  fs.writeFileSync(cssPath, css, "utf8");
}

console.log("Opção aplicada com sucesso.");
console.log("Agora cada resultado da aba Perguntar mostra:");
console.log("  Visualizar tópico completo →");
console.log("Ao clicar no card, continua abrindo o tópico completo.");
console.log("Backup:", path.relative(root, backup));
console.log("CSS atualizado:", path.relative(root, cssPath));
console.log("Próximo passo: npm run dev");
