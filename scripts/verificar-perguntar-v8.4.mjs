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
  console.log("Assunto pesquisado:",data.focusQuery);
  console.log("Banco verificado:",data.bankChecked);
  console.log("Banco aprovado:",data.bankApprovedMatch);
  if(data.bankMatch){
    console.log("Banco pergunta:",data.bankMatch.question);
    console.log("Banco ID:",data.bankMatch.id,"· correspondência:",data.bankMatch.confidence);
  }
  console.log("Tópicos filtrados:",data.subjectMatchedTopicCount);
  console.log("Tópicos centrais:",data.topicReferences?.map(x=>x.title).slice(0,5));
  console.log("Resposta:",String(data.naturalAnswer||"").slice(0,500));
  return {ok:true,data};
}

let ok=true;

const barba=await ask("A paz de Deus, tenho uma dúvida sobre a barba, por qual motivo os irmãos não tem costume de usa-la? Deus abençoe!");
if(!barba.ok) ok=false;
else{
  const d=barba.data;
  if(!d.bankChecked) ok=fail("A pergunta sobre barba não consultou o Banco de Perguntas.")&&ok;
  if(!d.bankApprovedMatch) ok=fail("A pergunta sobre barba não encontrou a resposta aprovada do Banco de Perguntas.")&&ok;
  if(Number(d.bankMatch?.id)!==66) ok=fail(`Esperado Banco de Perguntas ID 66 para barba; recebido ${d.bankMatch?.id}.`)&&ok;
  if(!/\bbarba\b/i.test(String(d.focusQuery||""))) ok=fail(`Assunto efetivo não ficou centrado em barba: ${d.focusQuery}`)&&ok;

  const titles=(d.topicReferences||[]).map(x=>String(x.title||"")).join(" | ");
  if(!/barba|cavanhaque/i.test(titles)) ok=fail("Nenhum tópico central sobre barba/cavanhaque foi localizado.")&&ok;
  if(/véu|veu|diana|afrodite/i.test(titles)) ok=fail("Tópico de véu/Diana ainda entrou na fundamentação principal da barba.")&&ok;

  const refs=(d.biblicalReferences||[]).map(x=>String(x.reference||"")).join(" | ");
  if(/1Cor[ií]ntios 11/i.test(refs)) ok=fail("Referências de 1 Coríntios 11 (véu) contaminaram a resposta sobre barba.")&&ok;
}

const joelhos=await ask("Qual o entendimento sobre oração de joelhos?");
if(!joelhos.ok) ok=false;
else{
  const d=joelhos.data;
  if(!d.bankChecked) ok=fail("A pergunta sobre oração de joelhos não consultou primeiro o Banco de Perguntas.")&&ok;
  if(!/oracao|oração|joelh/i.test(String(d.focusQuery||""))) ok=fail(`Assunto efetivo inesperado em oração de joelhos: ${d.focusQuery}`)&&ok;
}

const veu=await ask("Qual o ensinamento sobre o uso do véu?");
if(!veu.ok) ok=false;
else{
  const titles=(veu.data.topicReferences||[]).map(x=>String(x.title||"")).join(" | ");
  if(/barba|cavanhaque/i.test(titles)) ok=fail("Tópicos de barba contaminaram a pergunta sobre véu.")&&ok;
}

console.log(ok?"\nV8.4 VALIDADA NOS TESTES PRINCIPAIS.":"\nV8.4 PRECISA DE REVISÃO NOS ITENS ACIMA.");
process.exitCode=ok?0:1;
