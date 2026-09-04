"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./banco-perguntas.module.css";

type Item = { id:number; question:string; shortAnswer:string; fullAnswer:string; sourceCount:number };
type Detail = Item & { aliases:string[]; defaultAnswerMode:string; sources:any[] };

export default function BancoPerguntasPage(){
  const [q,setQ]=useState(""); const [items,setItems]=useState<Item[]>([]); const [selected,setSelected]=useState<Detail|null>(null); const [mode,setMode]=useState<"short"|"full">("short"); const [loading,setLoading]=useState(false); const [error,setError]=useState("");
  async function search(term=q){setLoading(true);setError("");try{const r=await fetch(`/api/question-bank?q=${encodeURIComponent(term.trim())}`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"Falha na consulta.");setItems(d.items||[]);}catch(e){setError(e instanceof Error?e.message:"Falha na consulta.");}finally{setLoading(false)}}
  async function open(id:number){setLoading(true);setError("");try{const r=await fetch(`/api/question-bank?id=${id}`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"Falha ao abrir.");setSelected(d);setMode(d.defaultAnswerMode==="full"?"full":"short");window.scrollTo({top:0,behavior:"smooth"});}catch(e){setError(e instanceof Error?e.message:"Falha ao abrir.");}finally{setLoading(false)}}
  useEffect(()=>{const p=new URLSearchParams(window.location.search);const initial=p.get("q")||"";setQ(initial);search(initial);},[]);
  function submit(e:FormEvent){e.preventDefault();search()}

  if(selected)return <main className={styles.shell}>
    <header className={styles.hero}><button className={styles.back} onClick={()=>setSelected(null)}>← Voltar ao Banco</button><span className={styles.eyebrow}>Banco de Perguntas</span><h1>{selected.question}</h1><p>Resposta revisada e aprovada para reutilização pelo sistema.</p></header>
    <section className={styles.panel}>
      <div className={styles.tabs}><button className={mode==="short"?styles.active:""} onClick={()=>setMode("short")}>Resposta simplificada</button><button className={mode==="full"?styles.active:""} onClick={()=>setMode("full")}>Resposta ampla</button></div>
      <article className={styles.answer}>{(mode==="short"?selected.shortAnswer:selected.fullAnswer).split(/\n{2,}/).map((p,i)=><p key={i}>{p}</p>)}</article>
      {!!selected.sources?.length&&<section className={styles.sources}><span className={styles.eyebrow}>Fontes cadastradas</span><h2>Referências da resposta</h2>{selected.sources.map((s:any)=><article key={s.id}><strong>{s.sourceTitle||s.sourceType||"Fonte documental"}</strong><span>{s.sourceYear||"s/ano"}{s.sourceType?` · ${s.sourceType}`:""}{s.pageStart?` · pág. ${s.pageStart}`:""}</span>{s.citationText&&<p>{s.citationText}</p>}{s.topicId&&<a href={`/?topic=${s.topicId}`}>Visualizar tópico relacionado →</a>}</article>)}</section>}
      {!!selected.aliases?.length&&<div className={styles.aliases}><b>Perguntas semelhantes reconhecidas:</b><div>{selected.aliases.map(a=><span key={a}>{a}</span>)}</div></div>}
    </section>
  </main>;

  return <main className={styles.shell}>
    <header className={styles.hero}><div className={styles.top}><a href="/">← Voltar à consulta</a><span>Base de conhecimento</span></div><span className={styles.eyebrow}>Banco de Perguntas</span><h1>Perguntas estudadas, respostas reutilizáveis.</h1><p>Pesquise perguntas já revisadas e consulte a resposta simplificada ou a resposta ampla.</p><form className={styles.search} onSubmit={submit}><span>⌕</span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Digite uma pergunta ou assunto..."/><button disabled={loading}>{loading?"Consultando…":"Pesquisar"}</button></form></header>
    {error&&<div className={styles.error}>{error}</div>}
    <section className={styles.panel}><div className={styles.head}><div><span className={styles.eyebrow}>Resultados</span><h2>{q.trim()?`Perguntas relacionadas a “${q.trim()}”`:"Perguntas publicadas"}</h2></div><span>{items.length} encontrada(s)</span></div>{!loading&&!items.length?<div className={styles.empty}><h3>Nenhuma pergunta encontrada</h3><p>Tente outra forma de escrever ou faça a pergunta na área Perguntar.</p></div>:<div className={styles.list}>{items.map(item=><button key={item.id} className={styles.card} onClick={()=>open(item.id)}><div><span>Resposta aprovada</span><span>{item.sourceCount} fonte(s)</span></div><h3>{item.question}</h3><p>{item.shortAnswer}</p><b>Abrir resposta simplificada/ampla →</b></button>)}</div>}</section>
  </main>;
}
