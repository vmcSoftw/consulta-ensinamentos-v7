import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const files = {
  page: path.join(ROOT, "app", "page.tsx"),
  layout: path.join(ROOT, "app", "layout.tsx"),
  css: path.join(ROOT, "app", "globals.css"),
};

for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) {
    console.error(`Arquivo obrigatório não encontrado (${name}): ${file}`);
    process.exit(1);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(ROOT, `.v8-visual-backup-${stamp}`);
for (const file of Object.values(files)) {
  const rel = path.relative(ROOT, file);
  const dest = path.join(backupRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(file, dest);
}

function replaceSafe(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) {
    console.warn(`Aviso: trecho não localizado para "${label}". Mantido como está.`);
    return text;
  }
  return text.replace(from, to);
}

let page = fs.readFileSync(files.page, "utf8");

page = replaceSafe(
  page,
  '<div className="brandKicker">Biblioteca digital documental</div>',
  '<div className="brandKicker">Pesquisa bíblica, histórica e documental</div>',
  "subtítulo da marca"
);

page = replaceSafe(
  page,
  '<Link className="adminButton" href="/admin">🔐 Área administrativa</Link>',
  '<Link className="adminButton" href="/admin"><span aria-hidden="true">◆</span> Administração</Link>',
  "botão administrativo"
);

page = replaceSafe(
  page,
  '<span className="techBadge"><i /> Neon PostgreSQL</span>',
  '<span className="techBadge"><i /> Acervo documental</span>',
  "selo do cabeçalho"
);

page = replaceSafe(
  page,
  '<h2>Encontre ensinamentos com contexto, fonte e ordem histórica.</h2>',
  '<h2>Pesquise ensinamentos, referências bíblicas e documentos em um só lugar.</h2>',
  "chamada principal"
);

page = replaceSafe(
  page,
  '<p>Pesquise assuntos, faça perguntas ao acervo, imprima resultados e gere compilações por tipo de documento ou ano.</p>',
  '<p>Uma consulta organizada para localizar assuntos, comparar registros históricos, estudar a Bíblia e acessar documentos com suas referências.</p>',
  "texto principal"
);

page = replaceSafe(
  page,
  '<span className="tabIcon">📖</span><span><b>Bíblia</b><small>Referências e dicionário</small></span>',
  '<span className="tabIcon">B</span><span><b>Bíblia</b><small>Referências e dicionário</small></span>',
  "ícone Bíblia"
);

page = replaceSafe(
  page,
  '<span className="tabIcon">↓</span><span><b>Documentos</b><small>Baixar compilações</small></span>',
  '<span className="tabIcon">D</span><span><b>Documentos</b><small>Compilações e PDF</small></span>',
  "ícone Documentos"
);

page = replaceSafe(
  page,
  '<div className="sectionEyebrow">Pesquisa no acervo</div>',
  '<div className="sectionEyebrow">Consulta rápida</div>',
  "eyebrow da pesquisa"
);

page = replaceSafe(
  page,
  '<h2>O que você deseja localizar?</h2>',
  '<h2>O que você deseja consultar?</h2>',
  "título da pesquisa"
);

page = replaceSafe(
  page,
  'placeholder="Ex.: casamento, Convenção, batismo de enfermos, oração..."',
  'placeholder="Digite um assunto, ensinamento ou referência..."',
  "placeholder da pesquisa"
);

page = replaceSafe(
  page,
  '<div className="quickRow"><span>Atalhos:</span>',
  '<div className="quickRow"><span>Mais pesquisados:</span>',
  "atalhos"
);

page = replaceSafe(
  page,
  '<div><b>Consulta documental rastreável</b><span>A pesquisa documental e a pesquisa bíblica utilizam registros catalogados no PostgreSQL/Neon, com indicação de fonte, página e referência.</span></div>',
  '<div><b>Consulta documental rastreável</b><span>Os resultados preservam a indicação de fonte, página, ano e referência para facilitar a conferência no documento original.</span></div>',
  "barra de confiança"
);

const oldFooter = '<footer className="appFooter"><span>Consulta de Ensinamentos V7</span><span>Neon PostgreSQL · pesquisa histórica · Bíblia ARC · Dicionário Bíblico · documentos rastreáveis</span></footer>';
const newFooter = '<footer className="appFooter"><div><strong>Consulta de Ensinamentos</strong><span>Pesquisa bíblica, histórica e documental</span></div><div className="footerRight"><span>Bíblia ARC 2009 · Dicionário Bíblico · Documentos</span><small>Ferramenta independente de consulta documental. Não representa canal oficial da Congregação Cristã no Brasil.</small></div></footer>';
page = replaceSafe(page, oldFooter, newFooter, "rodapé");

fs.writeFileSync(files.page, page, "utf8");

let layout = fs.readFileSync(files.layout, "utf8");
layout = layout
  .replace("title: 'Consulta de Ensinamentos V7'", "title: 'Consulta de Ensinamentos'")
  .replace(
    "description: 'Pesquisa histórica, perguntas documentais, impressão e compilações do acervo de ensinamentos'",
    "description: 'Pesquisa bíblica, histórica e documental de ensinamentos, Bíblia, dicionário e documentos.'"
  );
fs.writeFileSync(files.layout, layout, "utf8");

const cssStart = "/* ===== V8 VISUAL — INÍCIO ===== */";
const cssEnd = "/* ===== V8 VISUAL — FIM ===== */";

let css = fs.readFileSync(files.css, "utf8");
const startAt = css.indexOf(cssStart);
const endAt = css.indexOf(cssEnd);
if (startAt >= 0 && endAt > startAt) {
  css = css.slice(0, startAt).trimEnd() + "\n";
}

const v8css = String.raw`
/* ===== V8 VISUAL — INÍCIO =====
   Consulta de Ensinamentos
   Identidade: biblioteca digital institucional, limpa e responsiva
*/
:root{
  --v8-ink:#172234;
  --v8-navy:#13243d;
  --v8-navy-2:#1b3150;
  --v8-gold:#a98245;
  --v8-gold-soft:#f4ead8;
  --v8-paper:#f7f5f0;
  --v8-surface:#fffefb;
  --v8-line:#e5e0d7;
  --v8-muted:#6d7480;
}

body{
  background:
    radial-gradient(circle at 8% 0%,rgba(169,130,69,.08),transparent 30%),
    radial-gradient(circle at 94% 4%,rgba(19,36,61,.055),transparent 28%),
    linear-gradient(180deg,#fbfaf7 0%,#f4f2ed 100%);
  color:var(--v8-ink);
}

.appShell{
  width:min(1180px,calc(100% - 32px));
  padding:22px 0 54px;
}

/* Cabeçalho mais institucional e menos técnico */
.appHeader{
  color:var(--v8-ink);
  background:
    linear-gradient(115deg,rgba(255,254,251,.98),rgba(249,246,239,.98));
  border:1px solid var(--v8-line);
  border-radius:24px;
  padding:22px 26px 24px;
  box-shadow:0 18px 50px rgba(26,35,49,.075);
}
.appHeader .headerGlow{display:none}
.headerTop{
  padding-bottom:18px;
  border-bottom:1px solid #ebe6dd;
}
.brandMark{
  width:48px;height:48px;border-radius:14px;
  background:linear-gradient(145deg,var(--v8-navy),var(--v8-navy-2));
  color:#fff;
  box-shadow:0 10px 24px rgba(19,36,61,.18),inset 0 0 0 1px rgba(255,255,255,.12);
}
.brandKicker{color:var(--v8-gold);font-size:9px;letter-spacing:.13em}
.brandBlock h1{color:var(--v8-navy);font-size:21px}
.adminButton{
  border:1px solid #ddd7cc;
  background:#fffdfa;
  color:#56606d;
  padding:9px 12px;
  box-shadow:none;
  font-size:10px;
}
.adminButton span{font-size:8px;color:var(--v8-gold)}
.adminButton:hover{
  color:var(--v8-navy);
  border-color:#c9b99d;
  background:#fff;
  transform:none;
}
.headerContent{
  grid-template-columns:minmax(0,1.65fr) minmax(300px,.72fr);
  gap:34px;
  padding-top:22px;
}
.appHeader .techBadge{display:none}
.headerContent h2{
  color:var(--v8-navy);
  font-size:31px;
  line-height:1.13;
  margin:0 0 9px;
  max-width:760px;
}
.headerContent p{
  color:#69727e;
  font-size:13px;
  line-height:1.65;
  max-width:720px;
}
.statsGrid{
  background:#fffdfa;
  border:1px solid #e8e1d6;
  border-radius:16px;
  padding:7px;
  backdrop-filter:none;
}
.statsGrid div{background:#faf7f1;padding:13px 8px}
.statsGrid strong{color:var(--v8-navy);font-size:19px}
.statsGrid span{color:#827b70;font-size:8.5px}

/* Navegação: quatro áreas claras */
.mainTabs{
  position:sticky;
  top:10px;
  z-index:30;
  grid-template-columns:repeat(4,1fr);
  margin:14px 0;
  padding:5px;
  border:1px solid rgba(218,213,204,.92);
  border-radius:16px;
  background:rgba(249,247,242,.88);
  box-shadow:0 8px 28px rgba(26,35,49,.06);
  backdrop-filter:blur(14px);
}
.mainTabs button{
  min-height:52px;
  padding:9px 12px;
  border-radius:11px;
  color:#69717d;
}
.mainTabs button:hover{background:#fffdf9}
.mainTabs button.active{
  color:var(--v8-navy);
  background:#fff;
  box-shadow:0 4px 16px rgba(19,36,61,.07);
}
.tabIcon{
  width:29px;height:29px;border-radius:9px;
  background:#eeeae2;
  color:#69717d;
  font-size:12px;
}
.mainTabs button.active .tabIcon{
  color:#fff;
  background:var(--v8-navy);
  box-shadow:none;
}
.mainTabs small{font-size:9px}

/* Área de trabalho e pesquisa principal */
.workspace{
  background:rgba(255,254,251,.94);
  border:1px solid var(--v8-line);
  border-radius:22px;
  padding:24px;
  box-shadow:0 14px 44px rgba(26,35,49,.055);
  backdrop-filter:none;
}
.sectionEyebrow{color:var(--v8-gold);font-size:9px;letter-spacing:.13em}
.searchHero{padding:3px 2px 0}
.searchHero h2,.askHeader h2,.documentsHero h2{
  color:var(--v8-navy);
  font-size:26px;
  margin:4px 0 15px;
}
.modernSearch{
  border:1px solid #dcd6cc;
  border-radius:16px;
  padding:7px 7px 7px 15px;
  box-shadow:0 10px 30px rgba(19,36,61,.07);
}
.modernSearch:focus-within{
  border-color:#bca57c;
  box-shadow:0 0 0 4px rgba(169,130,69,.09),0 10px 30px rgba(19,36,61,.07);
}
.searchGlyph{color:#8c7b62}
.modernSearch input{font-size:15px;color:var(--v8-ink)}
.modernSearch button,.questionFooter button,.primaryButton,.saveButton{
  background:var(--v8-navy);
  box-shadow:none;
}
.modernSearch button:hover,.questionFooter button:hover,.primaryButton:hover{
  background:var(--v8-navy-2);
}
.quickRow{margin-top:12px}
.quickRow>span{color:#8b8378;font-size:10px}
.quickRow button,.downloadHints button{
  background:#fbf8f2;
  border-color:#e6dfd3;
  color:#5d6470;
}
.quickRow button:hover,.downloadHints button:hover{
  border-color:#c7b18b;
  color:var(--v8-navy);
  background:#fffdf9;
  transform:none;
}

/* Filtros com menos peso visual */
.filterCard{
  margin-top:18px;
  border-color:#e7e1d8;
  background:#faf8f4;
  border-radius:16px;
}
.filterHead b{color:var(--v8-navy)}
.textButton{color:#8e7040}
.filterGrid select,.builderControls select,.questionFooter select{
  border-color:#ded8ce;
  background:#fff;
}
.applyButton{background:var(--v8-navy)}

/* Resultados mais editoriais e legíveis */
.resultsToolbar h2{color:var(--v8-navy)}
.resultList{gap:12px}
.resultCard{
  min-height:285px;
  border-color:#e5e0d7;
  background:#fff;
  border-radius:16px;
  padding:17px;
  box-shadow:0 5px 18px rgba(26,35,49,.035);
}
.resultCard:hover{
  border-color:#cab791;
  box-shadow:0 12px 28px rgba(26,35,49,.075);
  transform:translateY(-1px);
}
.resultCardTop{border-bottom-color:#eee9e1}
.resultYearBadge{
  background:#f7f1e6!important;
  border-color:#e4d4b8!important;
}
.resultYearBadge strong{color:var(--v8-navy)!important}
.resultYearBadge span{color:#8a7048!important}
.resultBody h3{color:var(--v8-navy)}
.resultBody p{color:#515b68;line-height:1.7}
.resultSource{background:#faf8f4!important;border-color:#e7e1d8!important}
.resultMatchBadge{
  background:#f6efe3!important;
  border-color:#eadcc4!important;
  color:#7d6135!important;
}
.resultCardFooter{
  color:#8b6a36;
  border-top-color:#eee9e1;
}
.outlineButton{
  border-color:#ded8ce;
  color:#4f5966;
  background:#fff;
}
.outlineButton:hover{
  border-color:#c7b18b;
  color:var(--v8-navy);
  background:#fffdf9;
  transform:none;
}
.loadMore{background:var(--v8-navy)!important}

/* Perguntas */
.questionCard{
  border-color:#e4ded4!important;
  background:#fff!important;
  box-shadow:0 8px 26px rgba(26,35,49,.045)!important;
}
.shieldBadge{
  background:#f4ead8!important;
  border-color:#e4d2b2!important;
  color:#795f36!important;
}
.answerBox{border-color:#ddd7cd!important}
.answerLead{color:#35404e}
.intentBar,.relatedBar{
  border-color:#e6ded1;
  background:linear-gradient(135deg,#fbf8f2,#fff);
}
.intentChips span,.relatedChips button{
  background:#fffdf9!important;
  border-color:#e4d7c3!important;
  color:#765a2d!important;
}

/* Bíblia: leitura com aspecto de livro */
.bibleHero h2,.dictionaryIntro h3{color:var(--v8-navy)}
.bibleSubtabs{
  background:#f2eee7!important;
  border-color:#e2dcd2!important;
}
.bibleSubtabs button.active{
  color:var(--v8-navy)!important;
  box-shadow:0 3px 12px rgba(26,35,49,.06)!important;
}
.bibleStats>div{
  border-color:#e4ded4!important;
  background:#faf8f4!important;
}
.bibleStats strong{color:var(--v8-navy)!important}
.bibleNavigator,.dictionaryIntro,.dictionarySourceNote{
  border-color:#e6e0d6!important;
  background:#faf8f4!important;
}
.chapterCard,.verseCard,.dictionaryCard{
  border-color:#e4ded4!important;
  background:#fffefb!important;
  box-shadow:0 8px 26px rgba(26,35,49,.045)!important;
}
.chapterCardHeader{
  border-bottom-color:#ebe4d9;
  background:linear-gradient(135deg,#faf6ee,#fffefb 72%);
}
.chapterCardHeader h3,.verseReference,.dictionaryHead h3{
  color:var(--v8-navy)!important;
}
.chapterText{
  max-width:820px;
  margin:0 auto;
  font-family:Georgia,"Times New Roman",serif;
  font-size:17px;
  line-height:1.9;
  color:#2f3741;
}
.chapterVerse sup{
  color:#9b7440!important;
  font-family:Inter,ui-sans-serif,system-ui,sans-serif;
}
.verseCard>p{
  font-family:Georgia,"Times New Roman",serif;
  font-size:16px;
  line-height:1.78;
}
.dictionaryAlphabet button.active{
  background:var(--v8-navy)!important;
  color:#fff!important;
}

/* Documentos */
.downloadCard{
  border-color:#e4ded4!important;
  background:#fffefb!important;
}
.downloadCard.selected{
  border-color:#cbb78e!important;
  box-shadow:0 0 0 3px rgba(169,130,69,.08)!important;
}
.downloadIcon{
  background:#f3eadb!important;
  color:#846637!important;
}
.radioDot{border-color:#cbbda7!important}
.downloadCard.selected .radioDot{border-color:var(--v8-gold)!important}
.downloadBuilder{
  background:linear-gradient(135deg,var(--v8-navy),#203858);
}
.documentPreviewPanel{border-color:#e1dbd0!important}

/* Confiança e rodapé público */
.trustBar{
  border-color:#e3ddd3;
  background:rgba(255,254,251,.82);
  color:#4c5664;
}
.trustIcon{
  background:#f4ead8;
  color:#846637;
}
.appFooter{
  align-items:flex-start;
  margin-top:22px;
  padding:14px 4px 0;
  border-top:1px solid #e2ddd4;
  color:#7d817f;
  font-size:9px;
  text-transform:none;
  letter-spacing:0;
}
.appFooter>div{display:grid;gap:3px}
.appFooter strong{
  color:var(--v8-navy);
  font-size:11px;
}
.appFooter .footerRight{
  text-align:right;
  max-width:620px;
}
.appFooter small{
  display:block;
  color:#96938d;
  line-height:1.45;
}

/* Detalhe do ensinamento */
.detailCard{
  border-color:#e4ded4;
  border-radius:22px;
  box-shadow:0 14px 40px rgba(26,35,49,.06);
}
.detailAccent{background:linear-gradient(var(--v8-navy),var(--v8-gold))}
.topicHero h1{color:var(--v8-navy)}
.topicYearBadge{
  border-color:#e3d3b6;
  background:#f8f1e5;
}
.topicYearBadge strong{color:var(--v8-navy)}
.topicFacts>div,.sourcePanel{
  border-color:#e7e1d8;
  background:#faf8f4;
}
.sourceIcon{background:var(--v8-navy)}
.readingPanel{border-color:#e5dfd5}
.readingHeader{background:#faf8f4;border-bottom-color:#ebe4da}
.topicContentStructured{max-width:840px}
.topicBlockHeading{color:var(--v8-navy)}
.topicBlockParagraph{
  color:#37414d;
  font-size:14.5px;
  line-height:1.95;
}

/* Estados de foco: acessibilidade */
.appShell button:focus-visible,
.appShell a:focus-visible,
.appShell input:focus-visible,
.appShell select:focus-visible,
.appShell textarea:focus-visible{
  outline:3px solid rgba(169,130,69,.2);
  outline-offset:2px;
}

/* Tablet */
@media(max-width:980px){
  .headerContent{grid-template-columns:1fr}
  .statsGrid{max-width:none}
}

/* Celular: navegação inferior estilo app */
@media(max-width:720px){
  body{padding-bottom:82px}
  .appShell{
    width:min(100% - 20px,1180px);
    padding-top:10px;
    padding-bottom:24px;
  }
  .appHeader{
    border-radius:18px;
    padding:17px 16px 18px;
  }
  .headerTop{
    align-items:flex-start;
    gap:12px;
    padding-bottom:14px;
  }
  .brandBlock{gap:10px}
  .brandMark{width:42px;height:42px;border-radius:12px}
  .brandKicker{font-size:7.5px;letter-spacing:.09em}
  .brandBlock h1{font-size:17px}
  .adminButton{
    width:34px;height:34px;
    padding:0;
    border-radius:10px;
    overflow:hidden;
    font-size:0;
    flex:0 0 34px;
  }
  .adminButton span{font-size:10px}
  .headerContent{padding-top:17px;gap:16px}
  .headerContent h2{font-size:23px;line-height:1.16}
  .headerContent p{font-size:12px}
  .statsGrid{grid-template-columns:repeat(3,1fr)}
  .statsGrid div{padding:10px 5px}
  .statsGrid strong{font-size:16px}
  .statsGrid span{font-size:7px}

  .mainTabs{
    position:fixed;
    left:8px;right:8px;bottom:8px;top:auto;
    z-index:100;
    grid-template-columns:repeat(4,1fr);
    gap:3px;
    margin:0;
    padding:5px;
    border-radius:18px;
    background:rgba(255,254,251,.96);
    box-shadow:0 14px 42px rgba(19,36,61,.20);
    padding-bottom:max(5px,env(safe-area-inset-bottom));
  }
  .mainTabs button{
    min-width:0;
    min-height:56px;
    padding:6px 3px;
    flex-direction:column;
    justify-content:center;
    gap:3px;
    text-align:center;
  }
  .mainTabs button>span:last-child{min-width:0}
  .mainTabs b{font-size:9px;white-space:nowrap}
  .mainTabs small{display:none}
  .tabIcon{width:27px;height:27px;border-radius:8px;font-size:11px}

  .workspace{padding:17px 14px;border-radius:18px}
  .searchHero h2,.askHeader h2,.documentsHero h2{font-size:22px}
  .modernSearch{
    grid-template-columns:auto 1fr;
    padding:7px 10px;
    gap:6px;
  }
  .modernSearch button{
    grid-column:1/-1;
    width:100%;
    margin-top:2px;
  }
  .quickRow{
    flex-wrap:nowrap;
    overflow-x:auto;
    padding-bottom:4px;
    scrollbar-width:none;
  }
  .quickRow::-webkit-scrollbar{display:none}
  .quickRow>span,.quickRow button{flex:0 0 auto}
  .filterCard{padding:13px}
  .resultCard{min-height:0}
  .resultList{grid-template-columns:1fr}
  .toolbarActions{width:100%}
  .toolbarActions>*{flex:1}
  .chapterText{
    padding:18px 15px;
    font-size:16px;
    line-height:1.86;
  }
  .appFooter{
    display:grid;
    gap:10px;
    padding-bottom:4px;
  }
  .appFooter .footerRight{text-align:left}
}

/* telas muito estreitas */
@media(max-width:390px){
  .statsGrid span{letter-spacing:0}
  .headerContent h2{font-size:21px}
  .quickRow button{padding:6px 9px}
}
/* ===== V8 VISUAL — FIM ===== */
`;

css = css.trimEnd() + "\n\n" + v8css.trim() + "\n";
fs.writeFileSync(files.css, css, "utf8");

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#13243d"/>
  <path d="M16 18c7-2 12-1 16 3v28c-4-4-9-5-16-3V18Zm32 0c-7-2-12-1-16 3v28c4-4 9-5 16-3V18Z" fill="#fffefb"/>
  <path d="M32 21v28" stroke="#a98245" stroke-width="2"/>
</svg>`;
fs.writeFileSync(path.join(ROOT,"app","icon.svg"), icon, "utf8");

const manifest = `import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Consulta de Ensinamentos',
    short_name: 'Ensinamentos',
    description: 'Pesquisa bíblica, histórica e documental.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f5f0',
    theme_color: '#13243d',
    lang: 'pt-BR'
  };
}
`;
const manifestPath = path.join(ROOT,"app","manifest.ts");
if (!fs.existsSync(manifestPath)) fs.writeFileSync(manifestPath, manifest, "utf8");

console.log("");
console.log("V8 Visual aplicada com sucesso.");
console.log("Backup dos arquivos anteriores:");
console.log(backupRoot);
console.log("");
console.log("Alterações:");
console.log("- identidade pública Consulta de Ensinamentos");
console.log("- visual institucional em azul profundo, papel claro e dourado discreto");
console.log("- pesquisa com maior destaque");
console.log("- resultados mais leves");
console.log("- Bíblia com leitura editorial");
console.log("- navegação inferior no celular");
console.log("- rodapé público e aviso de independência");
console.log("- favicon/ícone CE sem símbolo religioso");
console.log("");
console.log("Agora execute: npm run dev");
