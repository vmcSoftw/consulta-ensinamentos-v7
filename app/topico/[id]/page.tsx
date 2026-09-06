"use client";
import { useEffect, useMemo, useState } from "react";
import styles from "./topico.module.css";
type Topic={id:number;topic_number?:string;title:string;content:string;page_start?:number;page_end?:number;category?:string;keywords?:string[];year?:number;source_type?:string;source_title_full?:string};
function refs(text:string){const re=/\b(?:[1-3]\s*)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿçÇ.]+(?:\s+[A-Za-zÀ-ÿçÇ.]+)?\s+\d{1,3}(?::\d{1,3}(?:-\d{1,3})?)?/g;return [...new Set(text.match(re)||[])].slice(0,30)}
export default function TopicoPage(){
 const [topic,setTopic]=useState<Topic|null>(null);const [error,setError]=useState("");
 useEffect(()=>{const id=window.location.pathname.split("/").filter(Boolean).pop();if(!id)return;fetch(`/api/topic/${id}`,{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Falha.");setTopic(d)}).catch(e=>setError(e instanceof Error?e.message:"Falha."))},[]);
 const references=useMemo(()=>topic?refs(`${topic.title}\n${topic.content}`):[],[topic]);
 if(error)return <main className={styles.shell}><div className={styles.error}>{error}</div></main>;
 if(!topic)return <main className={styles.shell}><div className={styles.empty}>Carregando tópico…</div></main>;
 return <main className={styles.shell}>
  <header className={styles.hero}><a className={styles.back} href="/">← Voltar à consulta</a><div className={styles.kicker}>Tópico documental</div><h1>{topic.topic_number?`${topic.topic_number}. `:""}{topic.title}</h1><div className={styles.badges}><span className={styles.badge}>{topic.year||"s/ano"}</span><span className={styles.badge}>{topic.source_type||"Documento"}</span>{topic.category&&<span className={styles.badge}>{topic.category}</span>}</div></header>
  <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>Texto do acervo</span><h2>Conteúdo integral</h2></div><small>{topic.source_title_full}{topic.page_start?` · pág. ${topic.page_start}`:""}</small></div><div style={{whiteSpace:"pre-wrap",lineHeight:1.75,color:"#33445b"}}>{topic.content}</div></section>
  {!!references.length&&<section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>Referências identificadas</span><h2>Referências bíblicas no tópico</h2></div></div><div className={styles.actions}>{references.map(r=><a href={`/biblia/referencias?ref=${encodeURIComponent(r)}`} key={r}>{r} →</a>)}</div></section>}
  {!!topic.keywords?.length&&<section className={styles.notice}><b>Palavras relacionadas:</b> {topic.keywords.join(" · ")}</section>}
 </main>
}
