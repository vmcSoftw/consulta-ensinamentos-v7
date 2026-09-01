import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pagePath = path.join(root, "app", "page.tsx");
const manifestPath = path.join(root, "app", "manifest.ts");
const cssPath = path.join(root, "app", "globals.css");
const svgIconPath = path.join(root, "app", "icon.svg");

if (!fs.existsSync(pagePath) || !fs.existsSync(cssPath)) {
  console.error("Execute este script na raiz do projeto.");
  process.exit(1);
}

let page = fs.readFileSync(pagePath, "utf8");

const oldBrand = '<div className="brandMark">CE</div>';
const newBrand = '<div className="brandMark"><img src="/consulta-ensinamentos-icon-192.png" alt="" aria-hidden="true" /></div>';

if (page.includes(oldBrand)) {
  page = page.replace(oldBrand, newBrand);
} else if (!page.includes('consulta-ensinamentos-icon-192.png')) {
  console.warn('Aviso: marca "CE" não encontrada automaticamente em app/page.tsx.');
}
fs.writeFileSync(pagePath, page, "utf8");

let css = fs.readFileSync(cssPath, "utf8");
const marker = "/* ===== ÍCONE OFICIAL — CONSULTA DE ENSINAMENTOS ===== */";
if (!css.includes(marker)) {
  css += `
${marker}
.brandMark{
  overflow:hidden;
  padding:0 !important;
}
.brandMark img{
  display:block;
  width:100%;
  height:100%;
  object-fit:cover;
  border-radius:inherit;
}
`;
  fs.writeFileSync(cssPath, css, "utf8");
}

if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, "utf8");
  if (!manifest.includes("consulta-ensinamentos-icon-192.png")) {
    manifest = manifest.replace(
      "lang: 'pt-BR'",
      `lang: 'pt-BR',
    icons: [
      { src: '/consulta-ensinamentos-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/consulta-ensinamentos-icon-512.png', sizes: '512x512', type: 'image/png' }
    ]`
    );
    fs.writeFileSync(manifestPath, manifest, "utf8");
  }
}

if (fs.existsSync(svgIconPath)) {
  fs.renameSync(svgIconPath, svgIconPath + ".backup");
  console.log("app/icon.svg preservado como app/icon.svg.backup");
}

console.log("Ícone oficial aplicado.");
console.log("- favicon/app icon: app/icon.png");
console.log("- cabeçalho: novo ícone gráfico");
console.log("- manifest/PWA: ícones 192 e 512 px");
console.log("Agora execute: npm run dev");
