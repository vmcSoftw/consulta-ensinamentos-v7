const base=(process.env.BASE_URL||"http://localhost:3000").replace(/\/$/,"");
const tests=[
 ["/","Página inicial"],
 ["/pesquisa-total","Pesquisa Total"],
 ["/evolucao","Evolução histórica"],
 ["/dossie","Dossiê"],
 ["/biblia/concordancias","Concordâncias"],
 ["/biblia/referencias","Referências Bíblicas"],
 ["/api/search/smart?q=amor&limit=3","Busca documental inteligente"],
 ["/api/bible/concordance?q=amor&limit=3","Concordância API"],
];
let failed=0;
for(const [path,label] of tests){
 try{
  const r=await fetch(base+path);
  console.log(`${r.ok?"OK":"ERRO"} ${r.status} · ${label} · ${path}`);
  if(!r.ok)failed++;
 }catch(e){console.log(`ERRO · ${label} · ${e.message}`);failed++}
}
console.log(failed?`\n${failed} teste(s) falharam.`:"\nTodos os testes públicos básicos passaram.");
process.exitCode=failed?1:0;
