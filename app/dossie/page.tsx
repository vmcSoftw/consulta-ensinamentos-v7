"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./dossie.module.css";
type Item={id:number;title:string;excerpt:string;year?:number;source_type?:string;page_start?:number;category?:string;source_title_full?:string};
type BankItem={id:number;question:string;shortAnswer:string;sourceCount:number};
type BibleItem={id:number;book:string;chapter:number;verse:number;text:string};
export default function DossiePage(){
 const [q,setQ]=useState("");const [docs,setDocs]=useState<Item[]>([]);const [total,setTotal]=useState(0);const [bank,setBank]=useState<BankItem[]>([]);const [bible,setBible]=useState<BibleItem[]>([]);const [loading,setLoading]=useState(false);const [error,setError]=useState("");
 async function load(term=q){const x=term.trim();if(!x)return;setLoading(true);setError("");try{const [a,b,c]=await Promise.all([
  fetch(`/api/search/smart?q=${encodeURIComponent(x)}&sort=oldest&limit=250`,{cache:"no-store"}),
  fetch(`/api/question-bank/categories?q=${encodeURIComponent(x)}`,{cache:"no-store"}),
  fetch(`/api/bible/search?q=${encodeURIComponent(x)}&limit=40`,{cache:"no-store"})
 ]);const [ad,bd,cd]=await Promise.all([a.json(),b.json(),c.json()]);if(!a.ok)throw new Error(ad.error||"Falha.");setDocs(ad.items||[]);setTotal(ad.total||0);setBank(b.ok?(bd.items||[]):[]);setBible(c.ok?(cd.items||[]):[]);void fetch("/api/usage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({eventType:"dossier",query:x,resultCount:ad.total,sourcePage:"/dossie"})}).catch(()=>{});}catch(e){setError(e instanceof Error?e.message:"Falha.");}finally{setLoading(false)}}
 function submit(e:FormEvent){e.preventDefault();void load()}
 useEffect(()=>{const x=new URLSearchParams(window.location.search).get("q")||"";if(x){setQ(x);void load(x)}},[]);
 const years=docs.map(x=>x.year).filter((x):x is number=>!!x);const first=years.length?Math.min(...years):null,last=years.length?Math.max(...years):null;
 const types=useMemo(()=>[...new Set(docs.map(x=>x.source_type).filter(Boolean))],[docs]);const cats=useMemo(()=>[...new Set(docs.map(x=>x.category).filter(Boolean))],[docs]);
 return <main className={styles.shell}>
  <header className={styles.hero}><div className={styles.noPrint}><a className={styles.back} href="/">← Voltar</a></div><div className={styles.kicker}>Consulta de Ensinamentos · Dossiê documental</div><h1>{q?`Dossiê: ${q}`:"Gerar dossiê de pesquisa"}</h1><p>Compilação organizada a partir do acervo cadastrado. O resumo abaixo é estatístico e documental; não cria conclusões doutrinárias.</p>
   <form className={`${styles.search} ${styles.noPrint}`} onSubmit={submit}><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Assunto do dossiê..."/><button disabled={loading||!q.trim()}>{loading?"Montando…":"Gerar dossiê"}</button></form>
   <div className={`${styles.actions} ${styles.noPrint}`}><button onClick={()=>window.print()}>Imprimir / Salvar em PDF</button><a href={`/evolucao?q=${encodeURIComponent(q)}`}>Ver evolução histórica</a></div>
  </header>
  {error&&<div className={styles.error}>{error}</div>}
  {!!docs.length&&<>
   <section className={styles.stats}><div className={styles.stat}><strong>{total}</strong><span>registros</span></div><div className={styles.stat}><strong>{first&&last?`${first}–${last}`:"—"}</strong><span>período</span></div><div className={styles.stat}><strong>{types.length}</strong><span>tipos de fonte</span></div><div className={styles.stat}><strong>{bank.length}</strong><span>perguntas aprovadas</span></div></section>
   <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>Resumo documental</span><h2>Escopo localizado</h2></div></div><p><b>Assunto pesquisado:</b> {q}</p><p><b>Tipos de documento:</b> {types.join(" · ")||"Não informado"}</p><p><b>Categorias:</b> {cats.join(" · ")||"Não informadas"}</p><p><b>Período:</b> {first&&last?`${first} a ${last}`:"sem período definido"}</p></section>
   <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>Compilação cronológica</span><h2>Registros do acervo</h2></div><small>{docs.length} exibidos</small></div><div className={styles.list}>{docs.map(x=><article className={styles.card} key={x.id}><div className={styles.badges}><span className={styles.badge}>{x.year||"s/ano"}</span><span className={styles.badge}>{x.source_type||"Documento"}</span>{x.category&&<span className={styles.badge}>{x.category}</span>}</div><h3>{x.title}</h3><p>{x.excerpt}</p><small>{x.source_title_full}{x.page_start?` · pág. ${x.page_start}`:""}</small></article>)}</div></section>
   {!!bank.length&&<section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>Banco de Perguntas</span><h2>Respostas aprovadas relacionadas</h2></div></div><div className={styles.list}>{bank.slice(0,30).map(x=><article className={styles.card} key={x.id}><h3>{x.question}</h3><p>{x.shortAnswer}</p><small>{x.sourceCount} fonte(s) cadastrada(s)</small></article>)}</div></section>}
   {!!bible.length&&<section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>Bíblia ARC 2009</span><h2>Ocorrências bíblicas localizadas</h2></div></div><div className={styles.list}>{bible.slice(0,40).map(x=><article className={styles.card} key={x.id}><h3>{x.book} {x.chapter}:{x.verse}</h3><p>{x.text}</p></article>)}</div></section>}
   <section className={styles.notice}>Documento gerado pelo Consulta de Ensinamentos a partir dos registros cadastrados, mantendo referências de ano, fonte e página quando disponíveis.</section>
  </>}
  {!docs.length&&!loading&&!error&&<div className={styles.empty}>Informe um assunto para gerar a compilação.</div>}
 </main>
}
