"use client";
import { FormEvent, useEffect, useState } from "react";
import styles from "./qualidade.module.css";
type Data=any;
export default function QualidadePage(){
 const [data,setData]=useState<Data|null>(null);const [error,setError]=useState("");const [loading,setLoading]=useState(true);
 const [term,setTerm]=useState("");const [related,setRelated]=useState("");const [weight,setWeight]=useState("1");
 async function load(){setLoading(true);setError("");try{const r=await fetch("/api/admin/quality",{cache:"no-store"});const d=await r.json();if(r.status===401){window.location.href="/admin";return}if(!r.ok)throw new Error(d.error||"Falha.");setData(d)}catch(e){setError(e instanceof Error?e.message:"Falha.");}finally{setLoading(false)}}
 async function save(e:FormEvent){e.preventDefault();try{const r=await fetch("/api/admin/quality",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"upsert-synonym",term,relatedTerm:related,weight:Number(weight),enabled:true})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Falha.");setTerm("");setRelated("");setWeight("1");await load()}catch(e){setError(e instanceof Error?e.message:"Falha.")}}
 useEffect(()=>{void load()},[]);
 if(loading&&!data)return <main className={styles.shell}><div className={styles.empty}>Calculando qualidade do acervo…</div></main>;
 return <main className={styles.shell}>
  <header className={styles.hero}><a className={styles.back} href="/admin">← Administração</a><div className={styles.kicker}>V8 · Curadoria e qualidade</div><h1>Painel de Qualidade do Acervo</h1><p>Identifica lacunas de catalogação, perguntas sem fontes, duplicidades, histórico administrativo e comportamento de pesquisa.</p></header>
  {error&&<div className={styles.error}>{error}</div>}
  {data&&<>
   <section className={styles.stats}><div className={styles.stat}><strong>{data.topics?.total||0}</strong><span>tópicos</span></div><div className={styles.stat}><strong>{data.questionBank?.total||0}</strong><span>perguntas</span></div><div className={styles.stat}><strong>{data.questionBank?.uncategorized||0}</strong><span>perguntas sem classificação</span></div><div className={styles.stat}><strong>{data.questionBank?.without_sources||0}</strong><span>perguntas sem fontes</span></div></section>
   <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>Pendências objetivas</span><h2>O que precisa de curadoria</h2></div></div><div className={styles.grid}>
    <article className={styles.card}><h3>Tópicos sem categoria</h3><p>{data.topics?.without_category||0}</p></article>
    <article className={styles.card}><h3>Tópicos sem página</h3><p>{data.topics?.without_page||0}</p></article>
    <article className={styles.card}><h3>Tópicos sem palavras-chave</h3><p>{data.topics?.without_keywords||0}</p></article>
    <article className={styles.card}><h3>Fontes sem ano</h3><p>{data.sources?.without_year||0}</p></article>
    <article className={styles.card}><h3>Perguntas sem categoria/subcategoria</h3><p>{data.questionBank?.uncategorized||0}</p></article>
    <article className={styles.card}><h3>Perguntas sem resposta aprovada</h3><p>{data.questionBank?.without_approved_answer||0}</p></article>
    <article className={styles.card}><h3>Perguntas sem fonte</h3><p>{data.questionBank?.without_sources||0}</p></article>
    <article className={styles.card}><h3>Títulos duplicados</h3><p>{data.duplicateTitles?.length||0} grupo(s)</p></article>
   </div></section>
   <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>Força documental</span><h2>Banco de Perguntas</h2></div></div><div className={styles.notice}>Critério quantitativo: 0 fonte = sem sustentação cadastrada; 1 fonte = limitada; 2 fontes = moderada; 3 ou mais = forte. O selo não faz juízo doutrinário.</div><p><b>Versões de respostas:</b> {data.answerVersions?.total_versions||0} versões em {data.answerVersions?.questions_with_versions||0} pergunta(s).</p></section>
   <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>Uso do sistema</span><h2>Pesquisas mais recorrentes</h2></div><small>{data.usage?.enabled?"Analytics ativo":"Migração V8 pendente"}</small></div>{data.usage?.enabled?<div className={styles.grid}>{(data.usage.topSearches||[]).map((x:any)=><article className={styles.card} key={x.query}><h3>{x.query}</h3><p>{x.total} pesquisa(s)</p></article>)}</div>:<div className={styles.notice}>Aplique a migração V8 para registrar pesquisas, buscas sem resultado e perguntas mais abertas.</div>}</section>
   {data.usage?.enabled&&<section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>Lacunas de conteúdo</span><h2>Pesquisas sem resultado</h2></div></div><div className={styles.grid}>{(data.usage.noResults||[]).map((x:any)=><article className={styles.card} key={x.query}><h3>{x.query}</h3><p>{x.total} ocorrência(s)</p></article>)}</div></section>}
   <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>Busca documental</span><h2>Gerenciar sinônimos</h2></div><small>{data.synonyms?.length||0} exibidos</small></div><form className={styles.controls} onSubmit={save}><input value={term} onChange={e=>setTerm(e.target.value)} placeholder="Termo principal"/><input value={related} onChange={e=>setRelated(e.target.value)} placeholder="Termo relacionado"/><input type="number" min=".1" max="5" step=".1" value={weight} onChange={e=>setWeight(e.target.value)}/><button className={styles.primary}>Salvar relação</button></form><div className={styles.list}>{(data.synonyms||[]).slice(0,80).map((x:any)=><article className={styles.card} key={x.id}><b>{x.term}</b> → {x.related_term} <small>peso {Number(x.weight||1).toFixed(1)} · {x.enabled===false?"desativado":"ativo"}</small></article>)}</div></section>
   <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>Auditoria</span><h2>Alterações recentes</h2></div></div><div className={styles.list}>{(data.recentAudit||[]).map((x:any)=><article className={styles.card} key={x.id}><h3>{x.action}</h3><p>{x.summary}</p><small>{new Date(x.created_at).toLocaleString("pt-BR")} · {x.entity_type||"s/entidade"} {x.entity_id||""}</small></article>)}</div></section>
  </>}
 </main>
}
