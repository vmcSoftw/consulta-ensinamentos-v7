import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pagePath = path.join(root, "app", "page.tsx");
const cssPath = path.join(root, "app", "globals.css");

if (!fs.existsSync(pagePath) || !fs.existsSync(cssPath)) {
  console.error("Execute na raiz do projeto: app/page.tsx e app/globals.css precisam existir.");
  process.exit(1);
}

let page = fs.readFileSync(pagePath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const pageBackup = `${pagePath}.backup-perguntar-plus-${stamp}`;
const cssBackup = `${cssPath}.backup-perguntar-plus-${stamp}`;
fs.copyFileSync(pagePath, pageBackup);
fs.copyFileSync(cssPath, cssBackup);

let changes = 0;

// 1) Troca o badge percentual por classificação humana de aderência.
// Mantém a porcentagem no title para auditoria.
const oldBadge = `<span className={\`coverageBadge \${e.strictMatch ? "high" : ""}\`}>
                                  {e.strictMatch ? "Todos os termos" : \`\${Math.round((e.coverage || 0) * 100)}% de aderência\`}
                                </span>`;

const newBadge = `<span
                                  className={\`coverageBadge \${e.strictMatch || (e.coverage || 0) >= 0.8 ? "high" : (e.coverage || 0) >= 0.5 ? "medium" : "low"}\`}
                                  title={\`\${Math.round((e.coverage || 0) * 100)}% dos conceitos identificados\`}
                                >
                                  {e.strictMatch || (e.coverage || 0) >= 0.8
                                    ? "Alta aderência"
                                    : (e.coverage || 0) >= 0.5
                                      ? "Média aderência"
                                      : "Baixa aderência"}
                                </span>`;

if (page.includes(oldBadge)) {
  page = page.replace(oldBadge, newBadge);
  changes++;
} else if (!page.includes("Média aderência") && page.includes("coverageBadge")) {
  // Fallback para variação compacta do mesmo trecho.
  page = page.replace(
    /<span className=\{`coverageBadge \$\{e\.strictMatch \? "high" : ""\}`\}>\s*\{e\.strictMatch \? "Todos os termos" : `\$\{Math\.round\(\(e\.coverage \|\| 0\) \* 100\)\}% de aderência`\}\s*<\/span>/m,
    newBadge
  );
  if (page.includes("Média aderência")) changes++;
}

// 2) Ação explícita para abrir o tópico completo.
if (!page.includes('className="evidenceOpenTopic"')) {
  const anchor = `{!!e.matchedTerms?.length && (
                                  <div className="matchedTerms">
                                    <b>Conceitos encontrados:</b> {e.matchedTerms.join(" · ")}
                                  </div>
                                )}`;
  const insert = `${anchor}
                                <span className="evidenceOpenTopic" aria-hidden="true">
                                  Visualizar tópico completo →
                                </span>`;
  if (page.includes(anchor)) {
    page = page.replace(anchor, insert);
    changes++;
  }
}

// 3) Painel "Fontes consultadas" após a lista de evidências.
if (!page.includes('className="askSourcesPanel"')) {
  const evidenceClose = `              <div className="evidenceList">
                {z.evidence.map((e, a) => (
                  <button`;

  const start = page.indexOf(evidenceClose);
  if (start >= 0) {
    // Encontra o fechamento do div evidenceList procurando o trecho depois do map.
    const mapEndNeedle = `                ))}
              </div>`;
    const mapEnd = page.indexOf(mapEndNeedle, start);
    if (mapEnd >= 0) {
      const insertPos = mapEnd + mapEndNeedle.length;
      const panel = `

              {!!z.evidence?.length && (
                <section className="askSourcesPanel">
                  <div className="askSourcesHead">
                    <div>
                      <span className="sectionEyebrow">Transparência documental</span>
                      <h4>Fontes consultadas</h4>
                    </div>
                    <span>{new Set(z.evidence.map((item) => item.sourceTitle)).size} fonte(s)</span>
                  </div>

                  <div className="askSourcesList">
                    {Array.from(
                      new Map(
                        z.evidence.map((item) => [
                          \`\${item.sourceTitle}-\${item.page}-\${item.topicId}\`,
                          item,
                        ])
                      ).values()
                    ).map((item) => (
                      <button
                        type="button"
                        key={\`source-\${item.topicId}\`}
                        className="askSourceItem"
                        onClick={() => openTopic(item.topicId)}
                      >
                        <span className="askSourceYear">{item.year || "—"}</span>
                        <span className="askSourceText">
                          <strong>{item.sourceTitle || item.title}</strong>
                          <small>
                            {item.sourceType || "Documento"}
                            {item.page ? \` · pág. \${item.page}\` : ""}
                          </small>
                        </span>
                        <span className="askSourceArrow" aria-hidden="true">→</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}`;
      page = page.slice(0, insertPos) + panel + page.slice(insertPos);
      changes++;
    }
  }
}

// 4) Perguntas relacionadas usando o campo suggestions já retornado pela Perguntar V2.
// Apenas preenche a pergunta para que o usuário possa revisar antes de pesquisar.
if (!page.includes('className="askSuggestionsPanel"')) {
  const sourcePanelMarker = `              {!!z.evidence?.length && (
                <section className="askSourcesPanel">`;
  const pos = page.indexOf(sourcePanelMarker);
  if (pos >= 0) {
    // Insere antes de Fontes consultadas.
    const suggestions = `              {!!z.suggestions?.length && (
                <section className="askSuggestionsPanel">
                  <div className="askSuggestionsHead">
                    <b>Explore perguntas relacionadas</b>
                    <span>Toque em uma sugestão para preencher a próxima consulta.</span>
                  </div>
                  <div className="askSuggestionChips">
                    {z.suggestions.slice(0, 6).map((suggestion) => (
                      <button
                        type="button"
                        key={suggestion}
                        onClick={() => {
                          setQuestion(suggestion);
                          window.scrollTo({ top: 260, behavior: "smooth" });
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </section>
              )}

`;
    page = page.slice(0, pos) + suggestions + page.slice(pos);
    changes++;
  }
}

// 5) Compatibilidade: detecta o nome real das funções/sets atuais e substitui aliases temporários.
// A função que abre tópico costuma ser openTopic ou equivalente; o setter da pergunta varia.
const openTopicCandidates = [
  /async function\s+([A-Za-z_$][\w$]*)\(e\)\s*\{\s*let s=await fetch\(`\/api\/topic\/\$\{e\}`\)/,
  /async function\s+([A-Za-z_$][\w$]*)\(e\)\s*\{\s*const s=await fetch\(`\/api\/topic\/\$\{e\}`\)/
];
let openTopicName = null;
for (const re of openTopicCandidates) {
  const m = page.match(re);
  if (m) { openTopicName = m[1]; break; }
}
if (!openTopicName) {
  // TSX fonte não minificado geralmente tem um nome semântico; tenta encontrar onClick existente.
  const m = page.match(/onClick=\{\(\) => ([A-Za-z_$][\w$]*)\(e\.topicId\)\}/);
  if (m) openTopicName = m[1];
}
if (openTopicName) {
  page = page.replaceAll("openTopic(item.topicId)", `${openTopicName}(item.topicId)`);
}

// Setter da pergunta: encontra value={...} do textarea/input na askWorkspace seguido do onChange.
let questionSetter = null;
const askPos = page.indexOf('className="workspace askWorkspace"');
if (askPos >= 0) {
  const askChunk = page.slice(askPos, askPos + 9000);
  const setterMatch = askChunk.match(/value=\{([A-Za-z_$][\w$]*)\}\s*onChange=\{\(e\) => ([A-Za-z_$][\w$]*)\(e\.target\.value\)\}/);
  if (setterMatch) questionSetter = setterMatch[2];
}
if (questionSetter) {
  page = page.replaceAll("setQuestion(suggestion)", `${questionSetter}(suggestion)`);
}

// Se não encontrou aliases reais, aborta antes de salvar para evitar build quebrado.
if (page.includes("openTopic(item.topicId)") || page.includes("setQuestion(suggestion)")) {
  fs.copyFileSync(pageBackup, pagePath);
  fs.copyFileSync(cssBackup, cssPath);
  console.error("Não consegui identificar automaticamente as funções internas do app/page.tsx.");
  console.error("As alterações foram revertidas. Envie o trecho da aba Perguntar para adaptação.");
  process.exit(1);
}

// CSS
if (!css.includes("/* Perguntar V2 Plus */")) {
  css += `

/* Perguntar V2 Plus */
.coverageBadge.medium {
  background: rgba(154, 116, 39, 0.11);
  border-color: rgba(154, 116, 39, 0.26);
}

.coverageBadge.low {
  opacity: 0.78;
}

.evidenceOpenTopic {
  display: inline-flex;
  margin-top: 0.85rem;
  font-weight: 750;
  font-size: 0.9rem;
  color: #9a7427;
  transition: transform 160ms ease;
}

.evidenceCard:hover .evidenceOpenTopic,
.evidenceCard:focus-visible .evidenceOpenTopic {
  transform: translateX(3px);
}

.askSuggestionsPanel,
.askSourcesPanel {
  margin-top: 1rem;
  border: 1px solid rgba(21, 35, 53, 0.11);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  padding: 1rem;
}

.askSuggestionsHead,
.askSourcesHead {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 0.8rem;
}

.askSuggestionsHead {
  flex-direction: column;
  gap: 0.2rem;
}

.askSuggestionsHead span,
.askSourcesHead > span {
  font-size: 0.82rem;
  opacity: 0.68;
}

.askSuggestionChips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.askSuggestionChips button {
  border: 1px solid rgba(154, 116, 39, 0.24);
  background: rgba(154, 116, 39, 0.07);
  border-radius: 999px;
  padding: 0.55rem 0.8rem;
  cursor: pointer;
  font: inherit;
}

.askSourcesHead h4 {
  margin: 0.15rem 0 0;
}

.askSourcesList {
  display: grid;
  gap: 0.55rem;
}

.askSourceItem {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.8rem;
  align-items: center;
  text-align: left;
  border: 1px solid rgba(21, 35, 53, 0.09);
  background: rgba(250, 248, 243, 0.8);
  border-radius: 14px;
  padding: 0.75rem;
  cursor: pointer;
}

.askSourceYear {
  min-width: 3.4rem;
  font-weight: 800;
}

.askSourceText {
  display: grid;
  gap: 0.18rem;
}

.askSourceText small {
  opacity: 0.66;
}

.askSourceArrow {
  font-size: 1.05rem;
}

@media (max-width: 680px) {
  .askSourcesHead {
    flex-direction: column;
  }

  .askSourceItem {
    grid-template-columns: auto 1fr;
  }

  .askSourceArrow {
    display: none;
  }
}
`;
  changes++;
}

if (changes === 0) {
  fs.unlinkSync(pageBackup);
  fs.unlinkSync(cssBackup);
  console.log("Nenhuma alteração necessária: os recursos já parecem estar aplicados.");
  process.exit(0);
}

fs.writeFileSync(pagePath, page, "utf8");
fs.writeFileSync(cssPath, css, "utf8");

console.log("Perguntar V2 Plus aplicado com sucesso.");
console.log("Melhorias:");
console.log("- Alta / Média / Baixa aderência");
console.log("- Visualizar tópico completo");
console.log("- Fontes consultadas");
console.log("- Perguntas relacionadas");
console.log("Backup page:", path.relative(root, pageBackup));
console.log("Backup CSS :", path.relative(root, cssBackup));
console.log("Próximo passo: npm run dev");
