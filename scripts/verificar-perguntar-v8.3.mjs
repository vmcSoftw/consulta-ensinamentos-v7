const base=(process.env.BASE_URL||"http://localhost:3000").replace(/\/$/,"");

async function ask(question){
  const response=await fetch(`${base}/api/ask/natural`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({question,sort:"relevance"})
  });
  const data=await response.json();

  console.log(`\n${response.ok?"OK":"ERRO"} ${response.status} · ${question}`);
  if(!response.ok){console.log(data);return false}

  console.log("Engine:",data.answerEngine);
  console.log("Resposta:",String(data.naturalAnswer||"").slice(0,360));
  console.log("Tópicos centrais:",data.topicReferences?.length||0);
  console.log("Situações específicas:",data.specificGuidance?.length||0);
  console.log("Referências bíblicas:",data.biblicalReferences?.length||0);
  console.log("Repetições agrupadas:",data.groupedRepeatCount||0);

  const badMeta=/foram encontrados \d+ registros/i.test(String(data.naturalAnswer||""));
  console.log("Resposta ainda é meta-resumo?",badMeta?"SIM - REVISAR":"NÃO");

  const funeralMain=(data.topicReferences||[]).some((x)=>/funeral|sepultamento/i.test(x.title||""));
  console.log("Funeral entre tópicos centrais?",funeralMain?"SIM - REVISAR":"NÃO");

  const first=data.topicReferences?.[0];
  if(first){
    const tr=await fetch(`${base}/api/topic/${first.topicId}`);
    const td=await tr.json();
    console.log("Primeiro tópico:",first.title);
    console.log("Tamanho integral:",String(td.content||"").length,"caracteres");
  }

  return !badMeta;
}

let ok=true;
for(const q of [
  "Qual o ensinamento sobre o uso do véu?",
  "O que os ensinamentos dizem sobre casamento?",
  "Qual o entendimento sobre oração de joelhos?"
]){
  ok=(await ask(q))&&ok;
}
process.exitCode=ok?0:1;
