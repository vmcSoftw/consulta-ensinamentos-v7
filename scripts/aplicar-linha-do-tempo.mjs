import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const patchRoot = path.join(root, "linha-do-tempo-patch");

const files = [
  {
    src: path.join(patchRoot, "api", "route.ts"),
    dest: path.join(root, "app", "api", "timeline", "route.ts"),
  },
  {
    src: path.join(patchRoot, "page", "page.tsx"),
    dest: path.join(root, "app", "linha-do-tempo", "page.tsx"),
  },
  {
    src: path.join(patchRoot, "page", "timeline.module.css"),
    dest: path.join(root, "app", "linha-do-tempo", "timeline.module.css"),
  },
];

if (!fs.existsSync(path.join(root, "app", "page.tsx"))) {
  console.error("Execute este script na raiz do projeto Next.js.");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");

for (const file of files) {
  if (!fs.existsSync(file.src)) {
    console.error("Arquivo do pacote não encontrado:", path.relative(root, file.src));
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(file.dest), { recursive: true });

  if (fs.existsSync(file.dest)) {
    const backup = `${file.dest}.backup-${stamp}`;
    fs.copyFileSync(file.dest, backup);
    console.log("Backup:", path.relative(root, backup));
  }

  fs.copyFileSync(file.src, file.dest);
  console.log("Aplicado:", path.relative(root, file.dest));
}

// Integração discreta no cabeçalho da página principal.
const pagePath = path.join(root, "app", "page.tsx");
let page = fs.readFileSync(pagePath, "utf8");

if (!page.includes('href="/linha-do-tempo"')) {
  const adminAnchor = '<a className="adminButton" href="/admin">';
  const adminLink = '<Link className="adminButton" href="/admin">';
  const insertion = `<a className="timelineHeaderButton" href="/linha-do-tempo">
            Linha do tempo
          </a>
          `;

  let changed = false;

  if (page.includes(adminAnchor)) {
    page = page.replace(adminAnchor, insertion + adminAnchor);
    changed = true;
  } else if (page.includes(adminLink)) {
    page = page.replace(adminLink, insertion + adminLink);
    changed = true;
  }

  if (changed) {
    const backup = `${pagePath}.backup-timeline-${stamp}`;
    fs.copyFileSync(pagePath, backup);
    fs.writeFileSync(pagePath, page, "utf8");
    console.log("Atalho adicionado ao cabeçalho.");
    console.log("Backup:", path.relative(root, backup));
  } else {
    console.log("Página da linha do tempo criada, mas o atalho do cabeçalho não foi inserido automaticamente.");
    console.log("Você pode acessar em /linha-do-tempo.");
  }
}

// CSS global do atalho.
const globalsPath = path.join(root, "app", "globals.css");
if (fs.existsSync(globalsPath)) {
  let globals = fs.readFileSync(globalsPath, "utf8");
  if (!globals.includes(".timelineHeaderButton")) {
    globals += `

/* Atalho para a Linha do Tempo */
.timelineHeaderButton {
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

.timelineHeaderButton:hover {
  border-color: rgba(174, 138, 67, 0.48);
  background: rgba(174, 138, 67, 0.12);
}
`;
    fs.writeFileSync(globalsPath, globals, "utf8");
    console.log("Estilo do atalho aplicado.");
  }
}

console.log("");
console.log("Linha do Tempo dos Ensinamentos instalada.");
console.log("Acesse: http://localhost:3000/linha-do-tempo");
console.log("Próximo passo: npm run dev");
