"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./evolucao.module.css";
type Item={id:number;title:string;excerpt:string;year?:number;source_type?:string;page_start?:number;category?:string;source_title_full?:string};
export default function EvolucaoPage(){
 const [q,setQ]=useState("");const [items,setItems]=useState<Item[]>([]);const [total,setTotal]=useState(0);const [loading,setLoading]=useState(false);const [error,setError]=useState("");
 async function load(term=q){const x=term.trim();if(!x)return;setLoading(true);setError("");try{const r=await fetch(`/api/search/smart?q=${encodeURIComponent(x)}&sort=oldest&limit=250`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Falha.");setItems(d.items||[]);setTotal(d.total||0);void fetch("/api/usage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({eventType:"history_view",query:x,resultCount:d.total,sourcePage:"/evolucao"})}).catch(()=>{});}catch(e){setError(e instanceof Error?e.message:"Falha.");}finally{setLoading(false)}}
 function submit(e:FormEvent){e.preventDefault();void load()}
 useEffect(()=>{const x=new URLSearchParams(window.location.search).get("q")||"";if(x){setQ(x);void load(x)}},[]);
 const groups=useMemo(()=>{const m=new Map<string,Item[]>();for(const i of items){const y=String(i.year||"Sem ano");if(!m.has(y))m.set(y,[]);m.get(y)!.push(i)}return [...m.entries()]},[items]);
 const years=items.map(i=>i.year).filter((x):x is number=>!!x);const first=years.length?Math.min(...years):null,last=years.length?Math.max(...years):null;
 return <main className={styles.shell}>
  <header className={styles.hero}><a className={styles.back} href="/">← Voltar</a><div className={styles.kicker}>V8 · História documental</div><h1>Evolução histórica de um assunto</h1><p>Organiza os registros do acervo em ordem cronológica para comparar o que foi documentado em cada período, sem gerar interpretação doutrinária.</p>
   <form className={styles.search} onSubmit={submit}><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Ex.: véu, casamento, música, ministério..."/><button disabled={loading||!q.trim()}>{loading?"Organizando…":"Montar linha histórica"}</button></form>
   <div className={`${styles.actions} ${styles.noPrint}`}><a href={`/dossie?q=${encodeURIComponent(q)}`}>Gerar dossiê deste assunto</a><a href={`/pesquisa-total?q=${encodeURIComponent(q)}`}>Abrir Pesquisa Total</a></div>
  </header>
  {error&&<div className={styles.error}>{error}</div>}
  {!!items.length&&<><section className={styles.stats}><div className={styles.stat}><strong>{total}</strong><span>registros relacionados</span></div><div className={styles.stat}><strong>{groups.length}</strong><span>anos/períodos</span></div><div className={styles.stat}><strong>{first||"—"}</strong><span>primeiro registro</span></div><div className={styles.stat}><strong>{last||"—"}</strong><span>último registro</span></div></section>
   <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>Linha documental</span><h2>{q}</h2></div><small>Antigos → recentes</small></div>
    <div className={styles.timeline}>{groups.map(([year,records])=><section className={styles.yearBlock} key={year}><div className={styles.yearBadge}>{year}</div><div className={styles.list}>{records.map(r=><a className={styles.card} href={`/topico/${r.id}`} key={r.id}><div className={styles.badges}><span className={styles.badge}>{r.source_type||"Documento"}</span>{r.category&&<span className={styles.badge}>{r.category}</span>}</div><h3>{r.title}</h3><p>{r.excerpt}</p><small>{r.source_title_full}{r.page_start?` · pág. ${r.page_start}`:""}</small></a>)}</div></section>)}</div>
   </section>
  </>}
  {!items.length&&!loading&&!error&&<div className={styles.empty}>Digite um assunto para organizar os registros históricos.</div>}
 </main>
}
