const base=(process.env.BASE_URL||"http://localhost:3000").replace(/\/$/,"");

function fail(message){
  console.error("ERRO:",message);
  return false;
}

async function ask(question){
  const response=await fetch(`${base}/api/ask/natural`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({question,sort:"relevance"})
  });
  const data=await response.json();
  console.log(`\n${response.ok?"OK":"ERRO"} ${response.status} · ${question}`);
  if(!response.ok){
    console.log(data);
    return {ok:false,data};
  }

  console.log("Engine:",data.answerEngine);
  console.log("Assunto:",data.focusQuery);
  console.log("Banco aprovado:",data.bankApprovedMatch);
  console.log("Estrutura:",data.structuredResponse?.version);
  console.log("Bíblia:",data.structuredResponse?.referencesBible?.slice(0,8));
  console.log("CCB:",data.structuredResponse?.referencesCcb?.map(x=>x.title).slice(0,5));
  console.log("Aplicação prática:",data.structuredResponse?.practicalGuidance?.length||0);
  console.log("Conclusão:",String(data.structuredResponse?.conclusion||"").slice(0,220));
  return {ok:true,data};
}

let ok=true;

const barba=await ask("A paz de Deus, tenho uma dúvida sobre a barba, por qual motivo os irmãos não tem costume de usa-la? Deus abençoe!");
if(!barba.ok) ok=false;
else{
  const d=barba.data;
  if(d.answerEngine!=="v8.5-structured-bank-first") ok=fail(`Engine inesperado: ${d.answerEngine}`)&&ok;
  if(d.structuredResponse?.version!=="v8.5") ok=fail("structuredResponse v8.5 não foi retornado.")&&ok;
  if(Number(d.bankMatch?.id)!==66) ok=fail(`Esperado Banco ID 66 para barba; recebido ${d.bankMatch?.id}.`)&&ok;

  const ccb=(d.structuredResponse?.referencesCcb||[]).map(x=>String(x.title||"")).join(" | ");
  if(!/barba|cavanhaque/i.test(ccb)) ok=fail("Referências CCB sobre barba/cavanhaque não apareceram.")&&ok;
  if(/véu|veu|diana|afrodite/i.test(ccb)) ok=fail("Tema de véu/Diana contaminou as referências CCB da barba.")&&ok;

  const bible=(d.structuredResponse?.referencesBible||[]).join(" | ");
  if(/1Cor[ií]ntios 11/i.test(bible)) ok=fail("1 Coríntios 11 contaminou a resposta estruturada sobre barba.")&&ok;
}

const joelhos=await ask("Qual o entendimento sobre oração de joelhos?");
if(!joelhos.ok) ok=false;
else{
  if(joelhos.data.structuredResponse?.version!=="v8.5") ok=fail("Oração de joelhos sem resposta estruturada v8.5.")&&ok;
  const ccb=(joelhos.data.structuredResponse?.referencesCcb||[]).map(x=>String(x.title||"")).join(" | ");
  if(!/ora|joelh|ajoelh/i.test(ccb)) ok=fail("Oração de joelhos sem referências CCB coerentes.")&&ok;
}

const evangelizar=await ask("Como podemos evangelizar os nossos colegas de escola?");
if(!evangelizar.ok) ok=false;
else{
  if(evangelizar.data.structuredResponse?.version!=="v8.5") ok=fail("Pergunta sobre evangelização sem estrutura v8.5.")&&ok;
  if(!String(evangelizar.data.structuredResponse?.response||"").trim()) ok=fail("Resposta estruturada de evangelização ficou vazia.")&&ok;
}

console.log(ok
  ? "\nV8.5 VALIDADA NOS TESTES PRINCIPAIS."
  : "\nV8.5 PRECISA DE REVISÃO NOS ITENS ACIMA."
);
process.exitCode=ok?0:1;
