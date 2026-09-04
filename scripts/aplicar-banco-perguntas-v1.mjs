import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const patch=path.join(root,"banco-perguntas-patch");
const stamp=new Date().toISOString().replace(/[:.]/g,"-");
const files=[
 ["lib/question-bank.ts","lib/question-bank.ts"],
 ["app/api/question-bank/route.ts","app/api/question-bank/route.ts"],
 ["app/banco-perguntas/page.tsx","app/banco-perguntas/page.tsx"],
 ["app/banco-perguntas/banco-perguntas.module.css","app/banco-perguntas/banco-perguntas.module.css"],
 ["app/admin/banco-perguntas/page.tsx","app/admin/banco-perguntas/page.tsx"],
 ["app/admin/banco-perguntas/banco-perguntas-admin.module.css","app/admin/banco-perguntas/banco-perguntas-admin.module.css"],
];

if(!fs.existsSync(path.join(root,"app","page.tsx"))){console.error("Execute na raiz do projeto Next.js.");process.exit(1)}
for(const [srcRel,dstRel] of files){const src=path.join(patch,srcRel),dst=path.join(root,dstRel);if(!fs.existsSync(src)){console.error("Arquivo ausente:",srcRel);process.exit(1)}fs.mkdirSync(path.dirname(dst),{recursive:true});if(fs.existsSync(dst))fs.copyFileSync(dst,`${dst}.backup-bank-${stamp}`);fs.copyFileSync(src,dst);console.log("Aplicado:",dstRel)}

const askPath=path.join(root,"app","api","ask","route.ts");
let ask=fs.readFileSync(askPath,"utf8");fs.copyFileSync(askPath,`${askPath}.backup-bank-${stamp}`);
if(!ask.includes("findApprovedQuestion")){
 const imp='import { NextRequest, NextResponse } from "next/server";';
 if(!ask.includes(imp)){console.error("Import principal de /api/ask não encontrado.");process.exit(1)}
 ask=ask.replace(imp,imp+'\nimport { findApprovedQuestion } from "../../../lib/question-bank";');
}
if(!ask.includes("fromQuestionBank: true")){
 const marker="    const concepts = detectIntent(question);";
 if(!ask.includes(marker)){console.error("Marcador da Perguntar V2 não encontrado. Nenhuma alteração mantida em /api/ask.");process.exit(1)}
 const block=`    const bankMatch = await findApprovedQuestion(question, 0.80);\n\n    if (bankMatch) {\n      const bankEvidence = bankMatch.sources.filter((source) => source.topicId).map((source) => ({\n        topicId: String(source.topicId),\n        year: source.sourceYear,\n        sourceType: source.sourceType || "Banco de Perguntas",\n        page: source.pageStart,\n        title: bankMatch.question,\n        text: source.citationText || "",\n        sourceTitle: source.sourceTitle || "Fonte cadastrada",\n        strictMatch: true,\n        coverage: 1,\n        matchedTerms: [],\n        rankScore: 1000\n      }));\n\n      return NextResponse.json({\n        version: "Banco de Perguntas V1",\n        question,\n        answer: bankMatch.shortAnswer || bankMatch.fullAnswer,\n        fromQuestionBank: true,\n        bankQuestionId: bankMatch.id,\n        bankMatchScore: bankMatch.score,\n        shortAnswer: bankMatch.shortAnswer,\n        fullAnswer: bankMatch.fullAnswer,\n        bankSources: bankMatch.sources,\n        strictTotal: 1,\n        total: 1,\n        coreTerms: [],\n        expandedTerms: [],\n        evidence: bankEvidence,\n        suggestions: bankMatch.aliases.slice(0, 6)\n      });\n    }\n\n`;
 ask=ask.replace(marker,block+marker);
}
fs.writeFileSync(askPath,ask,"utf8");console.log("Integrado: Perguntar consulta o Banco primeiro.");

const pagePath=path.join(root,"app","page.tsx");let page=fs.readFileSync(pagePath,"utf8");fs.copyFileSync(pagePath,`${pagePath}.backup-bank-${stamp}`);
if(!page.includes('href="/banco-perguntas"')){
 const re=/(<(?:Link|a)\b[^>]*className="adminButton"[^>]*href="\/admin"[^>]*>)/;
 if(re.test(page))page=page.replace(re,'<a className="bankHeaderButton" href="/banco-perguntas">Banco de Perguntas</a>\n          $1');
 else console.warn("Atalho público não inserido automaticamente.");
}
if(!page.includes("bankAnswerModes")){
 const re=/<p className="answerLead">\{([A-Za-z_$][\w$]*)\.answer\}<\/p>/;
 const m=page.match(re);
 if(m){const v=m[1];const replacement=`{${v}.fromQuestionBank ? (\n              <div className="bankAnswerBox">\n                <div className="bankAnswerOrigin">\n                  <b>Resposta encontrada no Banco de Perguntas</b>\n                  <span>Correspondência {Math.round((${v}.bankMatchScore || 0) * 100)}%</span>\n                </div>\n                <div className="bankAnswerModes">\n                  <details open><summary>Resposta simplificada</summary><p>{${v}.shortAnswer || ${v}.answer}</p></details>\n                  <details><summary>Resposta ampla</summary><p>{${v}.fullAnswer || ${v}.answer}</p></details>\n                </div>\n                {!!${v}.bankSources?.length && <div className="bankSourcesMini"><b>Fontes cadastradas</b>{${v}.bankSources.slice(0,8).map((source,index)=><span key={source.id || index}>{source.sourceYear || "s/ano"}{source.sourceType ? \` · \${source.sourceType}\` : ""}{source.sourceTitle ? \` · \${source.sourceTitle}\` : ""}{source.pageStart ? \` · pág. \${source.pageStart}\` : ""}</span>)}</div>}\n                <a className="bankOpenButton" href={\`/banco-perguntas?q=\${encodeURIComponent(${v}.question)}\`}>Abrir no Banco de Perguntas →</a>\n              </div>\n            ) : (\n              <>\n                <p className="answerLead">{${v}.answer}</p>\n                <button type="button" className="bankSuggestButton" onClick={async()=>{try{const response=await fetch("/api/question-bank",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"submit",question:${v}.question,answer:${v}.answer,shortAnswer:${v}.answer,fullAnswer:${v}.answer,evidence:${v}.evidence || []})});const data=await response.json();if(!response.ok)throw Error(data.error||"Falha ao enviar.");window.alert(data.message||"Pergunta enviada para revisão.")}catch(error){window.alert(error instanceof Error?error.message:"Não foi possível enviar para revisão.")}}}>Sugerir inclusão no Banco de Perguntas</button>\n              </>\n            )}`;page=page.replace(re,replacement)}else console.warn("Bloco answerLead não localizado; a API funcionará, mas a alternância curta/ampla precisa ser revisada no front-end.");
}
fs.writeFileSync(pagePath,page,"utf8");

const adminPath=path.join(root,"app","admin","page.tsx");if(fs.existsSync(adminPath)){let admin=fs.readFileSync(adminPath,"utf8");fs.copyFileSync(adminPath,`${adminPath}.backup-bank-${stamp}`);if(!admin.includes('href="/admin/banco-perguntas"')){const re=/(\s*<(?:Link|a)\b[^>]*href="\/admin\/duplicados"[^>]*>)/;if(re.test(admin)){admin=admin.replace(re,'\n            <a className="adminLink bankAdminLink" href="/admin/banco-perguntas">❓ Banco de Perguntas</a>$1');fs.writeFileSync(adminPath,admin,"utf8")}else console.warn("Atalho no Admin não inserido automaticamente.")}}

const cssPath=path.join(root,"app","globals.css");if(fs.existsSync(cssPath)){let css=fs.readFileSync(cssPath,"utf8");fs.copyFileSync(cssPath,`${cssPath}.backup-bank-${stamp}`);if(!css.includes("/* Banco de Perguntas V1 */")){css+=`\n\n/* Banco de Perguntas V1 */\n.bankHeaderButton{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;border:1px solid rgba(174,138,67,.28);color:inherit;border-radius:999px;padding:.62rem .9rem;font-size:.86rem;font-weight:750;background:rgba(174,138,67,.07)}\n.bankAnswerBox{margin-top:1rem;border:1px solid rgba(154,116,39,.18);border-radius:18px;background:rgba(154,116,39,.055);padding:1rem}.bankAnswerOrigin{display:flex;justify-content:space-between;gap:.8rem;align-items:center;margin-bottom:.8rem}.bankAnswerOrigin span{font-size:.78rem;opacity:.62}.bankAnswerModes{display:grid;gap:.6rem}.bankAnswerModes details{border:1px solid rgba(21,35,53,.09);border-radius:13px;background:rgba(255,255,255,.78);padding:.75rem .85rem}.bankAnswerModes summary{cursor:pointer;font-weight:800}.bankAnswerModes p{line-height:1.65;white-space:pre-wrap}.bankSourcesMini{display:grid;gap:.25rem;margin-top:.8rem;font-size:.8rem}.bankSourcesMini span{opacity:.72}.bankOpenButton,.bankSuggestButton{display:inline-flex;margin-top:.9rem;border:1px solid rgba(154,116,39,.26);border-radius:999px;background:rgba(154,116,39,.08);color:#80601e;padding:.58rem .82rem;text-decoration:none;font:inherit;font-size:.82rem;font-weight:800;cursor:pointer}\n`;fs.writeFileSync(cssPath,css,"utf8")}}
console.log("\nBanco de Perguntas V1 aplicado.");console.log("Teste: /banco-perguntas e /admin/banco-perguntas");console.log("Próximo passo: npm run dev");
