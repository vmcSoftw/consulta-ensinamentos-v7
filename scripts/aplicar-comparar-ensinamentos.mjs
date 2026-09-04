import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const patchRoot = path.join(root, "comparar-ensinamentos-patch");
const pageSrc = path.join(patchRoot, "page", "page.tsx");
const cssSrc = path.join(patchRoot, "page", "comparar.module.css");
const pageDest = path.join(root, "app", "comparar", "page.tsx");
const cssDest = path.join(root, "app", "comparar", "comparar.module.css");

if (!fs.existsSync(path.join(root, "app", "page.tsx"))) {
  console.error("Execute este script na raiz do projeto Next.js.");
  process.exit(1);
}

for (const src of [pageSrc, cssSrc]) {
  if (!fs.existsSync(src)) {
    console.error("Arquivo do pacote não encontrado:", path.relative(root, src));
    process.exit(1);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.mkdirSync(path.dirname(pageDest), { recursive: true });

for (const [src, dest] of [[pageSrc, pageDest], [cssSrc, cssDest]]) {
  if (fs.existsSync(dest)) {
    const backup = `${dest}.backup-${stamp}`;
    fs.copyFileSync(dest, backup);
    console.log("Backup:", path.relative(root, backup));
  }
  fs.copyFileSync(src, dest);
  console.log("Aplicado:", path.relative(root, dest));
}

// Adiciona atalho no cabeçalho principal ao lado da Linha do Tempo/Admin.
const mainPage = path.join(root, "app", "page.tsx");
let page = fs.readFileSync(mainPage, "utf8");

if (!page.includes('href="/comparar"')) {
  const timelineAnchor = '<a className="timelineHeaderButton" href="/linha-do-tempo">';
  const adminAnchor = '<a className="adminButton" href="/admin">';
  const adminLink = '<Link className="adminButton" href="/admin">';
  const compareLink = `<a className="compareHeaderButton" href="/comparar">
            Comparar
          </a>
          `;

  let changed = false;

  if (page.includes(timelineAnchor)) {
    page = page.replace(timelineAnchor, compareLink + timelineAnchor);
    changed = true;
  } else if (page.includes(adminAnchor)) {
    page = page.replace(adminAnchor, compareLink + adminAnchor);
    changed = true;
  } else if (page.includes(adminLink)) {
    page = page.replace(adminLink, compareLink + adminLink);
    changed = true;
  }

  if (changed) {
    const backup = `${mainPage}.backup-compare-${stamp}`;
    fs.copyFileSync(mainPage, backup);
    fs.writeFileSync(mainPage, page, "utf8");
    console.log("Atalho 'Comparar' adicionado ao cabeçalho.");
    console.log("Backup:", path.relative(root, backup));
  } else {
    console.log("Página criada. O atalho não foi inserido automaticamente.");
    console.log("Acesse manualmente /comparar.");
  }
}

// CSS do atalho.
const globalsPath = path.join(root, "app", "globals.css");
if (fs.existsSync(globalsPath)) {
  let globals = fs.readFileSync(globalsPath, "utf8");

  if (!globals.includes(".compareHeaderButton")) {
    globals += `

/* Atalho para Comparar Ensinamentos */
.compareHeaderButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  border: 1px solid rgba(174, 138, 67, 0.28);
  color: inherit;
  border-radius: 999px;
  padding: 0.62rem 0.9rem;
  font-size: 0.86rem;
  font-weight: 750;
  background: rgba(174, 138, 67, 0.07);
}

.compareHeaderButton:hover {
  border-color: rgba(174, 138, 67, 0.48);
  background: rgba(174, 138, 67, 0.12);
}
`;
    fs.writeFileSync(globalsPath, globals, "utf8");
    console.log("Estilo do atalho aplicado.");
  }
}

console.log("");
console.log("Comparar Ensinamentos instalado.");
console.log("Acesse: http://localhost:3000/comparar");
console.log("Próximo passo: npm run dev");
