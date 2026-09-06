"use client";
import { FormEvent, useEffect, useState } from "react";
import styles from "./pesquisa-total.module.css";

type SmartItem={id:number;title:string;excerpt:string;year?:number;source_type?:string;page_start?:number;category?:string;source_title_full?:string;match_hint?:string};
type BankItem={id:number;question:string;shortAnswer:string;sourceCount:number;categoryName?:string;subcategoryName?:string};
type BibleItem={id:number;book_order:number;book:string;chapter:number;verse:number;text:string;pdf_page?:number};
type DictItem={id:number;headword:string;definition:string};

export default function PesquisaTotalPage(){
 const [q,setQ]=useState(""); const [loading,setLoading]=useState(false); const [error,setError]=useState("");
 const [doc,setDoc]=useState<{total:number;items:SmartItem[];expandedTerms?:string[]}|null>(null);
 const [bank,setBank]=useState<{items:BankItem[]}|null>(null);
 const [bible,setBible]=useState<{total:number;items:BibleItem[]}|null>(null);
 const [dict,setDict]=useState<{total:number;items:DictItem[]}|null>(null);

 async function search(term=q){
  const cleaned=term.trim(); if(!cleaned)return;
  setLoading(true); setError("");
  try{
   const [a,b,c,d]=await Promise.all([
    fetch(`/api/search/smart?q=${encodeURIComponent(cleaned)}&limit=20`,{cache:"no-store"}),
    fetch(`/api/question-bank/categories?q=${encodeURIComponent(cleaned)}`,{cache:"no-store"}),
    fetch(`/api/bible/search?q=${encodeURIComponent(cleaned)}&limit=20`,{cache:"no-store"}),
    fetch(`/api/bible/dictionary?q=${encodeURIComponent(cleaned)}&limit=12`,{cache:"no-store"}),
   ]);
   const [ad,bd,cd,dd]=await Promise.all([a.json(),b.json(),c.json(),d.json()]);
   if(!a.ok)throw new Error(ad.error||"Falha na pesquisa documental.");
   setDoc(ad); setBank(b.ok?bd:{items:[]}); setBible(c.ok?cd:{total:0,items:[]}); setDict(d.ok?dd:{total:0,items:[]});
  }catch(e){setError(e instanceof Error?e.message:"Falha na pesquisa.");}
  finally{setLoading(false)}
 }
 function submit(e:FormEvent){e.preventDefault();void search()}
 useEffect(()=>{const p=new URLSearchParams(window.location.search);const x=p.get("q")||"";if(x){setQ(x);void search(x)}},[]);
 const has=!!(doc||bank||bible||dict);

 return <main className={styles.shell}>
  <header className={styles.hero}>
   <a className={styles.back} href="/">← Voltar à consulta</a>
   <div className={styles.kicker}>V8 · Pesquisa integrada</div>
   <h1>Pesquisa Total</h1>
   <p>Uma única consulta em Ensinamentos, Banco de Perguntas, Bíblia ARC e Dicionário Bíblico. O sistema localiza e organiza; não cria conteúdo doutrinário.</p>
   <form className={styles.search} onSubmit={submit}>
    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Digite um assunto, pergunta, palavra ou referência bíblica..."/>
    <button disabled={loading||!q.trim()}>{loading?"Consultando…":"Pesquisar em tudo"}</button>
   </form>
   <div className={`${styles.actions} ${styles.noPrint}`}>
    <a href={`/evolucao?q=${encodeURIComponent(q)}`}>Ver evolução histórica</a>
    <a href={`/dossie?q=${encodeURIComponent(q)}`}>Gerar dossiê</a>
    <a href="/biblia/concordancias">Concordâncias</a>
    <a href={`/biblia/referencias?ref=${encodeURIComponent(q)}`}>Referências bíblicas</a>
   </div>
  </header>
  {error&&<div className={styles.error}>{error}</div>}
  {has&&<section className={styles.stats}>
   <div className={styles.stat}><strong>{doc?.total||0}</strong><span>ensinamentos</span></div>
   <div className={styles.stat}><strong>{bank?.items?.length||0}</strong><span>perguntas aprovadas</span></div>
   <div className={styles.stat}><strong>{bible?.total??bible?.items?.length??0}</strong><span>versículos</span></div>
   <div className={styles.stat}><strong>{dict?.total??dict?.items?.length??0}</strong><span>verbetes</span></div>
  </section>}
  {doc&&<section className={styles.panel}>
   <div className={styles.panelHead}><div><span className={styles.eyebrow}>Acervo documental</span><h2>Ensinamentos</h2></div><small>{doc.total} registro(s)</small></div>
   {doc.expandedTerms?.length?<div className={styles.notice}><b>Termos relacionados usados na busca:</b> {doc.expandedTerms.slice(0,14).join(" · ")}</div>:null}
   <div className={styles.grid}>{doc.items.map(x=><a className={styles.card} href={`/topico/${x.id}`} key={x.id}>
    <div className={styles.badges}><span className={styles.badge}>{x.year||"s/ano"}</span><span className={styles.badge}>{x.source_type||"Documento"}</span>{x.category&&<span className={styles.badge}>{x.category}</span>}</div>
    <h3>{x.title}</h3><p>{x.excerpt}</p><small>{x.source_title_full}{x.page_start?` · pág. ${x.page_start}`:""}</small>
   </a>)}</div>
  </section>}
  {bank&&<section className={styles.panel}>
   <div className={styles.panelHead}><div><span className={styles.eyebrow}>Base revisada</span><h2>Banco de Perguntas</h2></div><small>{bank.items.length} encontrada(s)</small></div>
   <div className={styles.grid}>{bank.items.slice(0,20).map(x=><a className={styles.card} href={`/banco-perguntas?q=${encodeURIComponent(x.question)}`} key={x.id}>
    <div className={styles.badges}>{x.categoryName&&<span className={styles.badge}>{x.categoryName}</span>}<span className={styles.badge}>{x.sourceCount} fonte(s)</span></div>
    <h3>{x.question}</h3><p>{x.shortAnswer}</p>
   </a>)}</div>
  </section>}
  {bible&&<section className={styles.panel}>
   <div className={styles.panelHead}><div><span className={styles.eyebrow}>Bíblia ARC 2009</span><h2>Versículos</h2></div></div>
   <div className={styles.grid}>{(bible.items||[]).slice(0,20).map(x=><a className={styles.card} href={`/biblia/referencias?ref=${encodeURIComponent(`${x.book} ${x.chapter}:${x.verse}`)}`} key={x.id}>
    <h3>{x.book} {x.chapter}:{x.verse}</h3><p>{x.text}</p>
   </a>)}</div>
  </section>}
  {dict&&<section className={styles.panel}>
   <div className={styles.panelHead}><div><span className={styles.eyebrow}>Dicionário da Bíblia de Almeida</span><h2>Verbetes</h2></div></div>
   <div className={styles.grid}>{(dict.items||[]).slice(0,12).map(x=><article className={styles.card} key={x.id}><h3>{x.headword}</h3><p>{x.definition}</p></article>)}</div>
  </section>}
  {!has&&!loading&&<div className={styles.empty}>Pesquise um assunto para consultar todas as bases disponíveis.</div>}
 </main>
}
