'use client';

import Link from 'next/link';
import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import integrationStyles from './BibleIntegration.module.css';

type Item = {
  id: number;
  year: number | null;
  source_type: string;
  topic_number: string | null;
  title: string;
  page_start: number;
  page_end: number;
  category: string;
  excerpt: string;
  score?: number;
  source_title_full?: string;
  match_hint?: string;
};

type Topic = Item & {
  content: string;
  source_title_full: string;
  keywords: string[];
};

type CountItem<T extends string | number> = { value: T; total: number };
type Filters = {
  years: number[];
  categories: string[];
  types: string[];
  yearCounts?: CountItem<number>[];
  typeCounts?: CountItem<string>[];
  stats?: { topics: number; sources: number; documents: number };
};

type Evidence = {
  topicId: number;
  title: string;
  year: number | null;
  sourceType: string;
  sourceTitle: string;
  page: number;
  text: string;
  coverage?: number;
  matchedTerms?: string[];
  strictMatch?: boolean;
};

type AskResult = {
  question: string;
  total: number;
  strictTotal?: number;
  answer: string;
  coreTerms?: string[];
  expandedTerms: string[];
  evidence: Evidence[];
  strategy?: 'todos-os-termos' | 'maior-cobertura';
};

type BibleBook = { order:number; name:string; abbreviation:string; testament:'AT'|'NT'; chapters:number };
type BibleVerse = { id:number; book_order:number; book:string; abbreviation:string; chapter:number; verse:number; text:string; pdf_page:number; score?:number };
type ParsedBibleReference = { book?: BibleBook; chapter?: number; verseStart?: number; verseEnd?: number };
type BibleSearchResult = { mode:'reference'|'text'; query:string; total:number; items:BibleVerse[]; parsed?:ParsedBibleReference|null };
type RelatedTeaching = { id:number; year:number|null; source_type:string; title:string; page_start:number; category:string; source_title:string };
type DictionaryEntry = { id:number; headword:string; definition:string; letter:string; score?:number };
type DictionaryResult = { query:string; letter:string; total:number; items:DictionaryEntry[]; source?:{title:string;edition:string;authors:string[];publisher:string} };
type BibleMeta = { version:{code:string;name:string;edition:string}; books:BibleBook[]; stats:{books:number;chapters:number;verses:number}; dictionary?:{title:string;edition:string;authors:string[];publisher:string;stats:{entries:number;letters:number}} };
type BiblePane = 'scripture' | 'dictionary';

type BibleReferenceCatalog = {
  pattern: RegExp | null;
  booksByAlias: Map<string, BibleBook>;
};

type DetectedBibleReference = {
  display: string;
  query: string;
  start: number;
  end: number;
  book: BibleBook;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
};

function normalizeBibleAlias(value: string) {
  return value
    .normalize('NFC')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function removeBibleAccents(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function escapeBibleRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildBibleReferenceCatalog(books: BibleBook[]): BibleReferenceCatalog {
  if (!books.length) return { pattern: null, booksByAlias: new Map() };

  const booksByAlias = new Map<string, BibleBook>();
  const aliases: string[] = [];

  for (const book of books) {
    const variants = new Set<string>([
      book.name,
      book.abbreviation,
      book.name.replace(/^([123])(?=\p{L})/u, '$1 '),
      book.abbreviation.replace(/^([123])(?=\p{L})/u, '$1 ')
    ]);
    // Aceita também grafias sem acento (ex.: Joao, Genesis), preservando "Jó" para não conflitar com "Jo" = João.
    if (book.name !== 'Jó') {
      variants.add(removeBibleAccents(book.name));
      variants.add(removeBibleAccents(book.abbreviation));
      variants.add(removeBibleAccents(book.name.replace(/^([123])(?=\p{L})/u, '$1 ')));
    }

    for (const alias of variants) {
      const clean = alias.trim();
      if (!clean) continue;
      aliases.push(clean);
      booksByAlias.set(normalizeBibleAlias(clean), book);
    }
  }

  const aliasPattern = [...new Set(aliases)]
    .sort((a, b) => b.length - a.length)
    .map(alias => escapeBibleRegex(alias).replace(/\\ /g, '\\s*'))
    .join('|');

  // Aceita: Mateus 19:9, Mt. 19.9, 1 Co 13:4-7, João 3, Rm 8,28.
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${aliasPattern})\\.?\\s*(?:cap(?:[íi]tulo)?\\.?\\s*)?(\\d{1,3})(?:\\s*(?::|\\.|,|(?:[,;]?\\s*(?:v(?:s)?|ver(?:s(?:[íi]culo)?s?)?)\\.?))\\s*(\\d{1,3})(?:\\s*[-–—/]\\s*(\\d{1,3}))?)?`,
    'giu'
  );

  return { pattern, booksByAlias };
}

function extractBibleReferences(text: string, catalog: BibleReferenceCatalog): DetectedBibleReference[] {
  if (!text || !catalog.pattern) return [];
  const regex = new RegExp(catalog.pattern.source, catalog.pattern.flags);
  const found: DetectedBibleReference[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const prefix = match[1] || '';
    const alias = match[2] || '';
    const book = catalog.booksByAlias.get(normalizeBibleAlias(alias));
    const chapter = Number(match[3]);
    if (!book || !chapter || chapter > book.chapters) continue;

    const verseStart = match[4] ? Number(match[4]) : undefined;
    const verseEnd = match[5] ? Number(match[5]) : verseStart;
    const display = match[0].slice(prefix.length).trim();
    const start = (match.index || 0) + prefix.length;
    const end = start + match[0].slice(prefix.length).length;
    const query = `${book.name} ${chapter}${verseStart ? `:${verseStart}${verseEnd && verseEnd !== verseStart ? `-${verseEnd}` : ''}` : ''}`;

    found.push({ display, query, start, end, book, chapter, verseStart, verseEnd });
  }

  return found;
}

type Mode = 'search' | 'ask' | 'bible' | 'documents';
type Sort = 'relevance' | 'oldest' | 'recent';

const QUICK = ['casamento', 'batismo', 'véu', 'oração', 'mocidade', 'música', 'ministério', 'Santa Ceia', 'Convenção'];
const PAGE_SIZE = 30;

function sortLabel(sort: Sort) {
  if (sort === 'oldest') return 'Cronológica: mais antigos primeiro';
  if (sort === 'recent') return 'Cronológica: mais recentes primeiro';
  return 'Mais relevantes';
}

type TopicBlock = {
  kind: 'heading' | 'meta' | 'greeting' | 'paragraph' | 'list';
  text: string;
};

function isUpperHeading(text: string) {
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '');
  return letters.length >= 5 && text.length <= 120 && text === text.toLocaleUpperCase('pt-BR');
}

function formatTopicBlocks(content: string): TopicBlock[] {
  const lines = content
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const blocks: TopicBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };

  for (const line of lines) {
    const isMeta =
      /^(?:RGE\s+\d{4}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|Circular\b|Página\b|Administração\b|Reunião\b.*\d{4})/i.test(line);
    const isGreeting = /^(?:caros? irmãos?|prezados? irmãos?|a paz de deus[.!]?|deus seja louvado[.!]?)/i.test(line);
    const isList = /^(?:[-•▪◦]|\d{1,3}[.)])\s+/.test(line);

    if (isUpperHeading(line)) {
      flushParagraph();
      blocks.push({ kind: 'heading', text: line });
      continue;
    }

    if (isMeta) {
      flushParagraph();
      blocks.push({ kind: 'meta', text: line });
      continue;
    }

    if (isGreeting) {
      flushParagraph();
      blocks.push({ kind: 'greeting', text: line });
      continue;
    }

    if (isList) {
      flushParagraph();
      blocks.push({ kind: 'list', text: line });
      continue;
    }

    paragraph.push(line);
    if (/[.!?][\"”’')\]]?$/.test(line)) flushParagraph();
  }

  flushParagraph();
  return blocks;
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('search');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [terms, setTerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Topic | null>(null);
  const [filters, setFilters] = useState<Filters>({ years: [], categories: [], types: [] });
  const [year, setYear] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState<Sort>('relevance');
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  const [question, setQuestion] = useState('');
  const [askSort, setAskSort] = useState<Sort>('relevance');
  const [askResult, setAskResult] = useState<AskResult | null>(null);

  const [bibleMeta, setBibleMeta] = useState<BibleMeta | null>(null);
  const [bibleQ, setBibleQ] = useState('');
  const [bibleResult, setBibleResult] = useState<BibleSearchResult | null>(null);
  const [bibleBook, setBibleBook] = useState('43');
  const [bibleChapter, setBibleChapter] = useState('3');
  const [bibleRelated, setBibleRelated] = useState<Record<string, RelatedTeaching[] | null>>({});
  const [biblePane, setBiblePane] = useState<BiblePane>('scripture');
  const bibleReferenceCatalog = useMemo(() => buildBibleReferenceCatalog(bibleMeta?.books || []), [bibleMeta?.books]);
  const [dictionaryQ, setDictionaryQ] = useState('');
  const [dictionaryLetter, setDictionaryLetter] = useState('');
  const [dictionaryResult, setDictionaryResult] = useState<DictionaryResult | null>(null);

  const [downloadMode, setDownloadMode] = useState<'type' | 'year'>('type');
  const [downloadType, setDownloadType] = useState('');
  const [downloadYear, setDownloadYear] = useState('');
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState('');
  const [documentPreviewKey, setDocumentPreviewKey] = useState('');

  useEffect(() => {
    fetch('/api/filters')
      .then(r => r.json())
      .then((data: Filters) => {
        setFilters(data);
        if (!downloadType && data.types?.length) {
          const convention = data.types.find(x => x.toLocaleLowerCase('pt-BR').includes('conven'));
          setDownloadType(convention || data.types[0]);
        }
        if (!downloadYear && data.years?.length) setDownloadYear(String(data.years[0]));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/bible/books')
      .then(r => r.json())
      .then((data: BibleMeta) => setBibleMeta(data))
      .catch(() => {});
  }, []);

  function makeSearchParams(query = q, sortValue: Sort = sort) {
    const sp = new URLSearchParams({ q: query.trim(), sort: sortValue });
    if (year) sp.set('year', year);
    if (category) sp.set('category', category);
    if (type) sp.set('type', type);
    return sp;
  }

  const printHref = useMemo(() => {
    if (!q.trim()) return '#';
    return `/print?${makeSearchParams().toString()}`;
  }, [q, sort, year, category, type]);

  async function runSearch(query = q, append = false, sortOverride?: Sort, ignoreFilters = false) {
    const clean = query.trim();
    if (!clean) return;
    setLoading(true);
    setError('');
    if (!append) setSelected(null);

    const offset = append ? items.length : 0;
    const sp = ignoreFilters
      ? new URLSearchParams({ q: clean, sort: sortOverride ?? sort })
      : makeSearchParams(clean, sortOverride ?? sort);
    sp.set('limit', String(PAGE_SIZE));
    sp.set('offset', String(offset));

    try {
      const r = await fetch(`/api/search?${sp.toString()}`);
      if (!r.ok) throw new Error('Falha na pesquisa');
      const d = await r.json();
      setItems(prev => append ? [...prev, ...d.items] : d.items);
      setTotal(d.total);
      setTerms(d.expandedTerms || []);
      setHasMore(Boolean(d.hasMore));
    } catch {
      setError('Não foi possível consultar o banco Neon.');
      if (!append) setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function askArchive(e: FormEvent) {
    e.preventDefault();
    const clean = question.trim();
    if (!clean) return;
    setLoading(true);
    setError('');
    setAskResult(null);
    try {
      const r = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: clean, sort: askSort })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha na pergunta');
      setAskResult(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível consultar o acervo.');
    } finally {
      setLoading(false);
    }
  }

  async function searchBible(query = bibleQ) {
    const clean = query.trim();
    if (!clean) return;
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/bible/search?q=${encodeURIComponent(clean)}&limit=100`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha na pesquisa bíblica');
      setBibleResult(d);
      if (d.mode === 'reference' && d.parsed?.verseStart && d.parsed?.verseStart === d.parsed?.verseEnd && d.items?.length === 1) {
        void ensureBibleRelated(d.items[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível consultar a Bíblia.');
      setBibleResult(null);
    } finally {
      setLoading(false);
    }
  }

  function submitBible(e: FormEvent) {
    e.preventDefault();
    void searchBible(bibleQ);
  }

  function openBibleChapter() {
    const book = bibleMeta?.books.find(b => String(b.order) === bibleBook);
    if (!book || !bibleChapter) return;
    const q = `${book.name} ${bibleChapter}`;
    setBibleQ(q);
    void searchBible(q);
  }

  async function ensureBibleRelated(v: BibleVerse) {
    const key = `${v.book_order}-${v.chapter}-${v.verse}`;
    if (key in bibleRelated) return;
    setBibleRelated(prev => ({...prev,[key]:null}));
    try {
      const r = await fetch(`/api/bible/related?book=${v.book_order}&chapter=${v.chapter}&verse=${v.verse}`);
      const d = await r.json();
      setBibleRelated(prev => ({...prev,[key]:d.items || []}));
    } catch {
      setBibleRelated(prev => ({...prev,[key]:[]}));
    }
  }

  async function loadBibleRelated(v: BibleVerse) {
    const key = `${v.book_order}-${v.chapter}-${v.verse}`;
    if (key in bibleRelated) {
      setBibleRelated(prev => { const next={...prev}; delete next[key]; return next; });
      return;
    }
    await ensureBibleRelated(v);
  }

  async function copyBibleVerse(v: BibleVerse) {
    const value = `${v.book} ${v.chapter}:${v.verse} — ${v.text} (ARC)`;
    try { await navigator.clipboard.writeText(value); } catch {}
  }

  async function copyBibleChapter(items: BibleVerse[]) {
    if (!items.length) return;
    const first = items[0];
    const value = `${first.book} ${first.chapter} — ARC 2009\n\n${items.map(v => `${v.verse} ${v.text}`).join(' ')}`;
    try { await navigator.clipboard.writeText(value); } catch {}
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void runSearch(q, false);
  }

  function quickSearch(value: string) {
    setMode('search');
    setQ(value);
    void runSearch(value, false);
  }

  async function openTopic(id: number) {
    const r = await fetch(`/api/topic/${id}`);
    if (!r.ok) return;
    setSelected(await r.json());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearFilters() {
    setYear('');
    setCategory('');
    setType('');
    setSort('relevance');
  }

  async function searchDictionary(query = dictionaryQ, letter = dictionaryLetter) {
    setLoading(true);
    setError('');
    try {
      const sp = new URLSearchParams();
      if (query.trim()) sp.set('q', query.trim());
      if (letter) sp.set('letter', letter);
      sp.set('limit', '80');
      const r = await fetch(`/api/bible/dictionary?${sp.toString()}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha na consulta do dicionário');
      setDictionaryResult(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível consultar o dicionário bíblico.');
      setDictionaryResult(null);
    } finally {
      setLoading(false);
    }
  }

  function submitDictionary(e: FormEvent) {
    e.preventDefault();
    void searchDictionary(dictionaryQ, dictionaryLetter);
  }

  function browseDictionaryLetter(letter: string) {
    setDictionaryLetter(letter);
    setDictionaryQ('');
    void searchDictionary('', letter);
  }

  function searchHeadwordInBible(headword: string) {
    setBiblePane('scripture');
    setBibleQ(headword);
    void searchBible(headword);
  }

  function searchHeadwordInTeachings(headword: string) {
    setSelected(null);
    setMode('search');
    setYear('');
    setCategory('');
    setType('');
    setSort('relevance');
    setQ(headword);
    void runSearch(headword, false, 'relevance', true);
    setTimeout(() => document.querySelector('.workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function searchBibleQueryInDictionary() {
    const term = bibleResult?.mode === 'text' ? bibleResult.query.trim() : '';
    if (!term) return;
    setBiblePane('dictionary');
    setDictionaryLetter('');
    setDictionaryQ(term);
    void searchDictionary(term, '');
  }

  function openBibleReference(reference: string) {
    setSelected(null);
    setMode('bible');
    setBiblePane('scripture');
    setBibleQ(reference);
    setError('');
    void searchBible(reference);
    setTimeout(() => document.getElementById('bible-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }

  function renderBibleLinkedText(text: string): ReactNode {
    const refs = extractBibleReferences(text, bibleReferenceCatalog);
    if (!refs.length) return text;

    const parts: ReactNode[] = [];
    let cursor = 0;
    refs.forEach((ref, index) => {
      if (ref.start > cursor) parts.push(text.slice(cursor, ref.start));
      parts.push(
        <button
          type="button"
          className={integrationStyles.inlineBibleReference}
          key={`${ref.query}-${ref.start}-${index}`}
          onClick={() => openBibleReference(ref.query)}
          title={`Abrir ${ref.query} na Bíblia ARC`}
        >
          <span>{ref.display}</span><i aria-hidden="true">📖</i>
        </button>
      );
      cursor = ref.end;
    });
    if (cursor < text.length) parts.push(text.slice(cursor));
    return parts;
  }

  const documentSelectionKey = `${downloadMode}:${downloadMode === 'type' ? downloadType : downloadYear}`;
  const previewIsCurrent = Boolean(documentPreviewUrl) && documentPreviewKey === documentSelectionKey;

  function makeDocumentParams() {
    const sp = new URLSearchParams();
    if (downloadMode === 'type' && downloadType) sp.set('type', downloadType);
    if (downloadMode === 'year' && downloadYear) sp.set('year', downloadYear);
    return sp;
  }

  function previewDocument() {
    const sp = makeDocumentParams();
    if (!sp.toString()) return;
    sp.set('preview', '1');
    sp.set('_', String(Date.now()));
    setDocumentPreviewUrl(`/api/export/pdf?${sp.toString()}`);
    setDocumentPreviewKey(documentSelectionKey);
  }

  function downloadDocument() {
    if (!previewIsCurrent) return;
    const sp = makeDocumentParams();
    if (!sp.toString()) return;
    window.location.href = `/api/export/pdf?${sp.toString()}`;
  }

  if (selected) {
    const topicBlocks = formatTopicBlocks(selected.content);
    const topicReferences = extractBibleReferences(`${selected.title}\n${selected.content}`, bibleReferenceCatalog)
      .filter((ref, index, all) => all.findIndex(item => item.query === ref.query) === index)
      .slice(0, 30);
    return (
      <main className="appShell detailShell">
        <div className="detailTopbar">
          <button className="ghostButton" onClick={() => setSelected(null)}>← Voltar aos resultados</button>
          <div className="detailTopActions">
            <a className="ghostButton" href={`/documento.pdf#page=${selected.page_start}`} target="_blank" rel="noreferrer">Abrir no PDF original ↗</a>
            <button className="primaryButton" onClick={() => window.print()}>Imprimir tópico</button>
          </div>
        </div>
        <article className="detailCard printableTopic">
          <div className="detailAccent" />

          <header className="topicHero">
            <div className="topicHeroText">
              <div className="sectionEyebrow">Tópico localizado no acervo</div>
              <h1>{selected.topic_number ? `Tópico ${selected.topic_number} — ` : ''}{selected.title}</h1>
              <p>Leitura organizada do conteúdo catalogado, preservando a referência do documento original.</p>
            </div>
            <div className="topicYearBadge">
              <small>Ano</small>
              <strong>{selected.year || '—'}</strong>
            </div>
          </header>

          <section className="topicFacts" aria-label="Informações do tópico">
            <div><span>Tipo de documento</span><strong>{selected.source_type || 'Documento'}</strong></div>
            <div><span>Página original</span><strong>{selected.page_end && selected.page_end !== selected.page_start ? `${selected.page_start}–${selected.page_end}` : selected.page_start}</strong></div>
            <div><span>Categoria</span><strong>{selected.category || 'Não informada'}</strong></div>
            <div><span>Identificação</span><strong>{selected.topic_number ? `Tópico ${selected.topic_number}` : 'Registro documental'}</strong></div>
          </section>

          <section className="sourcePanel">
            <div className="sourceIcon">F</div>
            <div><span>Fonte documental</span><strong>{selected.source_title_full}</strong></div>
          </section>

          <section className="readingPanel">
            <div className="readingHeader">
              <div>
                <span className="sectionEyebrow">Conteúdo do tópico</span>
                <h2>Texto organizado para leitura</h2>
              </div>
              <span className="readingHint">Referência: pág. {selected.page_start}</span>
            </div>
            <div className="topicContentStructured">
              {topicBlocks.map((block, index) => {
                if (block.kind === 'heading') return <h3 className="topicBlockHeading" key={index}>{renderBibleLinkedText(block.text)}</h3>;
                if (block.kind === 'meta') return <div className="topicBlockMeta" key={index}>{renderBibleLinkedText(block.text)}</div>;
                if (block.kind === 'greeting') return <p className="topicBlockGreeting" key={index}>{renderBibleLinkedText(block.text)}</p>;
                if (block.kind === 'list') return <div className="topicBlockList" key={index}><span>•</span><p>{renderBibleLinkedText(block.text.replace(/^(?:[-•▪◦]|\d{1,3}[.)])\s+/, ''))}</p></div>;
                return <p className="topicBlockParagraph" key={index}>{renderBibleLinkedText(block.text)}</p>;
              })}
            </div>
          </section>

          {!!topicReferences.length && (
            <section className={integrationStyles.topicReferencesPanel}>
              <div className={integrationStyles.topicReferencesIntro}>
                <div className={integrationStyles.referenceIcon}>📖</div>
                <div>
                  <span>Referências bíblicas identificadas</span>
                  <strong>Clique em uma referência para abrir o texto na Bíblia ARC.</strong>
                </div>
              </div>
              <div className={integrationStyles.referenceChips}>
                {topicReferences.map(ref => (
                  <button type="button" key={ref.query} onClick={() => openBibleReference(ref.query)}>
                    {ref.query}<span>→</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {!!selected.keywords?.length && (
            <section className="keywordSection">
              <span>Palavras relacionadas</span>
              <div className="keywordRow">{selected.keywords.map(k => <span key={k}>{k}</span>)}</div>
            </section>
          )}
        </article>
      </main>
    );
  }

  return (
    <main className="appShell">
      <header className="appHeader">
        <div className="headerGlow headerGlowOne" />
        <div className="headerGlow headerGlowTwo" />
        <div className="headerTop">
          <div className="brandBlock">
            <div className="brandMark">CE</div>
            <div>
              <div className="brandKicker">Pesquisa bíblica, histórica e documental</div>
              <h1>Consulta de Ensinamentos</h1>
            </div>
          </div>
          <Link className="adminButton" href="/admin"><span aria-hidden="true">◆</span> Administração</Link>
        </div>
        <div className="headerContent">
          <div>
            <span className="techBadge"><i /> Acervo documental</span>
            <h2>Pesquise ensinamentos, referências bíblicas e documentos em um só lugar.</h2>
            <p>Uma consulta organizada para localizar assuntos, comparar registros históricos, estudar a Bíblia e acessar documentos com suas referências.</p>
          </div>
          <div className="statsGrid">
            <div><strong>{filters.stats?.topics?.toLocaleString('pt-BR') || '3.016'}</strong><span>tópicos</span></div>
            <div><strong>{filters.stats?.sources?.toLocaleString('pt-BR') || '142'}</strong><span>fontes</span></div>
            <div><strong>{filters.years.length || '—'}</strong><span>anos catalogados</span></div>
          </div>
        </div>
      </header>

      <nav className="mainTabs" aria-label="Recursos da aplicação">
        <button className={mode === 'search' ? 'active' : ''} onClick={() => setMode('search')}>
          <span className="tabIcon">⌕</span><span><b>Pesquisar</b><small>Assuntos e tópicos</small></span>
        </button>
        <button className={mode === 'ask' ? 'active' : ''} onClick={() => setMode('ask')}>
          <span className="tabIcon">?</span><span><b>Perguntar</b><small>Resposta documental</small></span>
        </button>
        <button className={mode === 'bible' ? 'active' : ''} onClick={() => setMode('bible')}>
          <span className="tabIcon">B</span><span><b>Bíblia</b><small>Referências e dicionário</small></span>
        </button>
        <button className={mode === 'documents' ? 'active' : ''} onClick={() => setMode('documents')}>
          <span className="tabIcon">D</span><span><b>Documentos</b><small>Compilações e PDF</small></span>
        </button>
      </nav>

      {mode === 'search' && (
        <section className="workspace">
          <div className="searchHero">
            <div className="sectionEyebrow">Consulta rápida</div>
            <h2>O que você deseja consultar?</h2>
            <form className="modernSearch" onSubmit={submit}>
              <span className="searchGlyph">⌕</span>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Digite um assunto, ensinamento ou referência..." />
              <button disabled={loading}>{loading ? 'Pesquisando…' : 'Pesquisar'}</button>
            </form>
            <div className="quickRow"><span>Mais pesquisados:</span>{QUICK.map(x => <button key={x} onClick={() => quickSearch(x)}>{x}</button>)}</div>
          </div>

          <section className="filterCard">
            <div className="filterHead">
              <div><b>Refinar resultados</b><span>Combine filtros ou organize cronologicamente</span></div>
              <button type="button" className="textButton" onClick={clearFilters}>Limpar filtros</button>
            </div>
            <div className="filterGrid">
              <label><span>Ano</span><select value={year} onChange={e => setYear(e.target.value)}><option value="">Todos os anos</option>{filters.years.map(y => <option value={y} key={y}>{y}</option>)}</select></label>
              <label><span>Tipo de documento</span><select value={type} onChange={e => setType(e.target.value)}><option value="">Todos os documentos</option>{filters.types.map(x => <option value={x} key={x}>{x}</option>)}</select></label>
              <label><span>Categoria</span><select value={category} onChange={e => setCategory(e.target.value)}><option value="">Todas as categorias</option>{filters.categories.map(x => <option value={x} key={x}>{x}</option>)}</select></label>
              <label><span>Ordenar por</span><select value={sort} onChange={e => { const nextSort = e.target.value as Sort; setSort(nextSort); if (q.trim()) void runSearch(q, false, nextSort); }}><option value="relevance">Mais relevantes</option><option value="oldest">Cronológica · antigos → recentes</option><option value="recent">Cronológica · recentes → antigos</option></select></label>
              <button type="button" className="applyButton" onClick={() => runSearch(q, false)} disabled={!q.trim() || loading}>Aplicar filtros</button>
            </div>
          </section>

          {terms.length > 1 && (
            <div className="relatedBar">
              <b>Termos relacionados</b>
              <div className="relatedChips">
                {terms.slice(0, 16).map(term => (
                  <button key={term} type="button" onClick={() => quickSearch(term)}>{term}</button>
                ))}
              </div>
            </div>
          )}
          {error && <div className="errorBox">{error}</div>}

          {items.length > 0 && (
            <section className="resultsSection">
              <div className="resultsToolbar">
                <div>
                  <span className="sectionEyebrow">Resultados</span>
                  <h2>{total.toLocaleString('pt-BR')} resultados encontrados</h2>
                  <p>{sortLabel(sort)} · mostrando {items.length}{hasMore ? ` de ${total}` : ''}</p>
                </div>
                <div className="toolbarActions">
                  <a className="outlineButton" href={printHref} target="_blank" rel="noreferrer">Imprimir pesquisa</a>
                  <button className="outlineButton" onClick={() => setMode('documents')}>Baixar documentos</button>
                </div>
              </div>
              <div className="resultList">
                {items.map((i, index) => (
                  <button className="resultCard" key={i.id} onClick={() => openTopic(i.id)}>
                    <div className="resultCardTop">
                      <div className="resultYearBadge">
                        <strong>{i.year || '—'}</strong>
                        <span>{i.source_type}</span>
                      </div>
                      <div className="resultMeta">
                        <span>Pág. {i.page_start}</span>
                        {i.category && <span>{i.category}</span>}
                      </div>
                    </div>
                    <div className="resultBody">
                      <div className="resultBodyHeader">
                        <small className="resultIndex">Resultado {index + 1}</small>
                        {i.match_hint && <span className="resultMatchBadge">Correspondência: {i.match_hint}</span>}
                      </div>
                      <h3>{i.topic_number ? `${i.topic_number}. ` : ''}{i.title}</h3>
                      {i.source_title_full && (
                        <div className="resultSource" title={i.source_title_full}>
                          <span>Fonte</span><strong>{i.source_title_full}</strong>
                        </div>
                      )}
                      <p>{i.excerpt}{i.excerpt?.length >= 460 ? '…' : ''}</p>
                    </div>
                    <div className="resultCardFooter">
                      <span>Abrir tópico completo →</span>
                    </div>
                  </button>
                ))}
              </div>
              {hasMore && <button className="loadMore" onClick={() => runSearch(q, true)} disabled={loading}>{loading ? 'Carregando…' : 'Carregar mais resultados'}</button>}
            </section>
          )}

          {!loading && q && items.length === 0 && !error && (
            <div className="emptyState"><div className="emptyIcon">⌕</div><h3>Nenhum registro encontrado</h3><p>Tente uma palavra mais curta, um termo relacionado ou remova algum filtro.</p></div>
          )}
        </section>
      )}

      {mode === 'ask' && (
        <section className="workspace askWorkspace">
          <div className="askHeader">
            <div>
              <div className="sectionEyebrow">Pergunte ao acervo</div>
              <h2>Faça uma pergunta em linguagem natural</h2>
              <p>O sistema localiza trechos diretamente relacionados e sempre mostra ano, fonte e página. Não cria conteúdo fora dos documentos.</p>
            </div>
            <div className="shieldBadge">Somente conteúdo do acervo</div>
          </div>
          <form className="questionCard" onSubmit={askArchive}>
            <textarea value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ex.: Qual é o ensinamento sobre casamento e separação?" rows={5} />
            <div className="questionFooter">
              <label><span>Organizar resposta</span><select value={askSort} onChange={e => setAskSort(e.target.value as Sort)}><option value="relevance">Por relevância</option><option value="oldest">Em ordem cronológica</option><option value="recent">Mais recentes primeiro</option></select></label>
              <button disabled={loading}>{loading ? 'Consultando…' : 'Buscar resposta no documento'}</button>
            </div>
          </form>
          {error && <div className="errorBox">{error}</div>}
          {askResult && (
            <div className="answerBox printableAnswer">
              <div className="answerTop">
                <div><span className="techBadge light"><i /> Resposta documental</span><h3>{askResult.question}</h3></div>
                <button className="outlineButton answerPrint" onClick={() => window.print()}>Imprimir resposta</button>
              </div>
              <p className="answerLead">{askResult.answer}</p>
              <div className="answerStatsGrid">
                <div className="answerStats"><b>{askResult.strictTotal ?? 0}</b><span>com todos os conceitos principais</span></div>
                <div className="answerStats"><b>{askResult.total}</b><span>relacionados no acervo ampliado</span></div>
              </div>
              {!!askResult.coreTerms?.length && (
                <div className="intentBar">
                  <div><b>Termos principais da pergunta</b><small>Estes conceitos recebem prioridade conjunta na resposta.</small></div>
                  <div className="intentChips">{askResult.coreTerms.map(term => <span key={term}>{term}</span>)}</div>
                </div>
              )}
              {askResult.expandedTerms?.length > 1 && <div className="relatedBar compact"><b>Termos relacionados usados como apoio</b><span>{askResult.expandedTerms.slice(0, 14).join(' · ')}</span></div>}
              <div className="evidenceList">
                {askResult.evidence.map((ev, idx) => (
                  <button className="evidenceCard" key={`${ev.topicId}-${idx}`} onClick={() => openTopic(ev.topicId)}>
                    <div className="evidenceIndex">{String(idx + 1).padStart(2, '0')}</div>
                    <div>
                      <div className="evidenceHead">
                        <div className="resultMeta"><span>{ev.year || 'Sem ano'}</span><span>{ev.sourceType}</span><span>Pág. {ev.page}</span></div>
                        <span className={`coverageBadge ${ev.strictMatch ? 'high' : ''}`}>{ev.strictMatch ? 'Todos os termos' : `${Math.round((ev.coverage || 0) * 100)}% de aderência`}</span>
                      </div>
                      <h4>{ev.title}</h4><p>{ev.text}</p><small>{ev.sourceTitle}</small>
                      {!!ev.matchedTerms?.length && <div className="matchedTerms"><b>Conceitos encontrados:</b> {ev.matchedTerms.join(' · ')}</div>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {mode === 'bible' && (
        <section id="bible-workspace" className="workspace bibleWorkspace">
          <div className="bibleHero">
            <div>
              <div className="sectionEyebrow">Biblioteca Bíblica</div>
              <h2>Bíblia Sagrada e Dicionário Bíblico em uma única área</h2>
              <p>Consulte referências e palavras na ARC 2009 ou pesquise verbetes do Dicionário da Bíblia de Almeida.</p>
            </div>
            <div className="bibleStats">
              <div><strong>{bibleMeta?.stats?.verses?.toLocaleString('pt-BR') || '31.105'}</strong><span>versículos</span></div>
              <div><strong>{bibleMeta?.stats?.books || 66}</strong><span>livros</span></div>
              <div><strong>{bibleMeta?.dictionary?.stats?.entries?.toLocaleString('pt-BR') || '5.614'}</strong><span>verbetes</span></div>
            </div>
          </div>

          <div className="bibleSubtabs" role="tablist" aria-label="Recursos bíblicos">
            <button className={biblePane === 'scripture' ? 'active' : ''} onClick={() => {setBiblePane('scripture');setError('')}}>
              <span>📖</span><div><b>Bíblia Sagrada</b><small>Referências, capítulos e palavras</small></div>
            </button>
            <button className={biblePane === 'dictionary' ? 'active' : ''} onClick={() => {setBiblePane('dictionary');setError('')}}>
              <span>ABC</span><div><b>Dicionário Bíblico</b><small>Termos, nomes e conceitos bíblicos</small></div>
            </button>
          </div>

          {biblePane === 'scripture' && <>
            <form className="modernSearch bibleSearch" onSubmit={submitBible}>
              <span className="searchGlyph">⌕</span>
              <input value={bibleQ} onChange={e => setBibleQ(e.target.value)} placeholder="Ex.: João 3:16, Salmos 23, graça, sem santificação ninguém verá..." />
              <button disabled={loading}>{loading ? 'Consultando…' : 'Pesquisar na Bíblia'}</button>
            </form>
            <div className="bibleExamples">
              <span>Exemplos:</span>
              {['João 3:16','Salmos 23','1 Coríntios 13','santificação','graça','fé'].map(x => <button key={x} onClick={() => {setBibleQ(x);void searchBible(x)}}>{x}</button>)}
            </div>

            <section className="bibleNavigator">
              <div>
                <span className="sectionEyebrow">Navegar por livro</span>
                <h3>Abra um capítulo completo</h3>
              </div>
              <label><span>Livro</span><select value={bibleBook} onChange={e => { setBibleBook(e.target.value); setBibleChapter('1'); }}>
                {(bibleMeta?.books || []).map(b => <option key={b.order} value={b.order}>{b.name}</option>)}
              </select></label>
              <label><span>Capítulo</span><select value={bibleChapter} onChange={e => setBibleChapter(e.target.value)}>
                {Array.from({length: bibleMeta?.books.find(b => String(b.order)===bibleBook)?.chapters || 1},(_,i)=>i+1).map(c => <option key={c} value={c}>{c}</option>)}
              </select></label>
              <button className="applyButton" onClick={openBibleChapter}>Abrir capítulo</button>
            </section>

            {error && <div className="errorBox">{error}</div>}

            {bibleResult && (
              <section className="bibleResults printableBible">
                <div className="resultsToolbar">
                  <div>
                    <span className="sectionEyebrow">Resultado bíblico</span>
                    <h2>{bibleResult.mode === 'reference' ? bibleResult.query : `${bibleResult.total} versículo(s) localizado(s)`}</h2>
                    <p>Almeida Revista e Corrigida · ARC 2009</p>
                  </div>
                  <div className={integrationStyles.toolbarActions}>
                    {bibleResult.mode === 'text' && bibleResult.query.trim() && (
                      <button className="outlineButton" onClick={searchBibleQueryInDictionary}>Consultar no Dicionário</button>
                    )}
                    <button className="outlineButton" onClick={() => window.print()}>Imprimir</button>
                  </div>
                </div>
                {bibleResult.mode === 'reference' && bibleResult.parsed?.chapter && !bibleResult.parsed?.verseStart && bibleResult.items.length ? (
                  <article className="chapterCard">
                    <div className="chapterCardHeader">
                      <div>
                        <span className="sectionEyebrow">Capítulo completo</span>
                        <h3>{bibleResult.items[0].book} {bibleResult.items[0].chapter}</h3>
                        <p>{bibleResult.items.length} versículos · Almeida Revista e Corrigida · ARC 2009</p>
                      </div>
                      <span className="chapterBadge">📖 ARC</span>
                    </div>
                    <div className="chapterText">
                      {bibleResult.items.map(v => (
                        <span className="chapterVerse" key={v.id}>
                          <sup>{v.verse}</sup>{v.text}
                        </span>
                      ))}
                    </div>
                    <div className="chapterActions">
                      <button onClick={() => copyBibleChapter(bibleResult.items)}>Copiar capítulo</button>
                      <button onClick={() => window.print()}>Imprimir capítulo</button>
                      <a href={`/biblia-arc.pdf#page=${bibleResult.items[0].pdf_page}`} target="_blank" rel="noreferrer">Abrir na Bíblia em PDF ↗</a>
                    </div>
                  </article>
                ) : (
                  <div className="verseList">
                    {bibleResult.items.map(v => {
                      const key=`${v.book_order}-${v.chapter}-${v.verse}`;
                      const related=bibleRelated[key];
                      return <article className="verseCard" key={v.id}>
                        <div className="verseReference"><span>📖</span><strong>{v.book} {v.chapter}:{v.verse}</strong><small>ARC</small></div>
                        <p>{v.text}</p>
                        <div className="verseActions">
                          <button onClick={() => copyBibleVerse(v)}>Copiar referência</button>
                          <button onClick={() => loadBibleRelated(v)}>Ver ensinamentos que citam</button>
                          <a href={`/biblia-arc.pdf#page=${v.pdf_page}`} target="_blank" rel="noreferrer">Página da Bíblia ↗</a>
                        </div>
                        {key in bibleRelated && (
                          <div className="relatedTeachingsBox">
                            <b>Ensinamentos que citam {v.book} {v.chapter}:{v.verse}</b>
                            {related === null ? <p>Buscando…</p> : related.length ? related.map(t => (
                              <button key={t.id} onClick={() => openTopic(t.id)}>
                                <span>{t.year || '—'} · {t.source_type} · pág. {t.page_start}</span>
                                <strong>{t.title}</strong>
                                <small>{t.source_title}</small>
                              </button>
                            )) : <p>Nenhum tópico com esta referência explícita foi localizado no acervo.</p>}
                          </div>
                        )}
                      </article>
                    })}
                  </div>
                )}
                {!bibleResult.items.length && <div className="emptyState"><div className="emptyIcon">📖</div><h3>Nenhum versículo localizado</h3><p>Tente outra referência, palavra ou frase.</p></div>}
              </section>
            )}
          </>}

          {biblePane === 'dictionary' && <>
            <section className="dictionaryIntro">
              <div>
                <span className="sectionEyebrow">Dicionário Bíblico</span>
                <h3>Dicionário da Bíblia de Almeida · 2ª edição</h3>
                <p>Pesquise nomes, lugares, objetos, expressões e conceitos bíblicos. A busca prioriza o verbete exato e também considera o conteúdo das definições.</p>
              </div>
              <a className="outlineButton" href="/dicionario-biblico.pdf" target="_blank" rel="noreferrer">Abrir dicionário completo em PDF ↗</a>
            </section>

            <form className="modernSearch dictionarySearch" onSubmit={submitDictionary}>
              <span className="searchGlyph">⌕</span>
              <input value={dictionaryQ} onChange={e => {setDictionaryQ(e.target.value);setDictionaryLetter('')}} placeholder="Ex.: adoração, Abraão, graça, adultério, templo..." />
              <button disabled={loading}>{loading ? 'Consultando…' : 'Pesquisar no dicionário'}</button>
            </form>

            <div className="dictionaryAlphabet">
              <span>Índice alfabético:</span>
              {'ABCDEFGHIJKLMNOPQRSTUVXZ'.split('').map(letter => (
                <button key={letter} className={dictionaryLetter===letter ? 'active' : ''} onClick={() => browseDictionaryLetter(letter)}>{letter}</button>
              ))}
              {(dictionaryLetter || dictionaryQ) && <button className="clearLetter" onClick={() => {setDictionaryLetter('');setDictionaryQ('');setDictionaryResult(null)}}>Limpar</button>}
            </div>

            <div className="dictionarySourceNote">
              <b>Fonte:</b> Dicionário da Bíblia de Almeida, 2ª edição · Werner Kaschel e Rudi Zimmer · Sociedade Bíblica do Brasil
            </div>
            {error && <div className="errorBox">{error}</div>}

            {dictionaryResult && <section className="dictionaryResults">
              <div className="resultsToolbar">
                <div>
                  <span className="sectionEyebrow">Verbetes</span>
                  <h2>{dictionaryResult.total.toLocaleString('pt-BR')} resultado(s)</h2>
                  <p>{dictionaryResult.query ? `Pesquisa: ${dictionaryResult.query}` : dictionaryResult.letter ? `Letra ${dictionaryResult.letter}` : 'Dicionário completo'}</p>
                </div>
              </div>
              <div className="dictionaryGrid">
                {dictionaryResult.items.map(entry => <article className="dictionaryCard" key={entry.id}>
                  <div className="dictionaryHead"><span>{entry.letter}</span><h3>{entry.headword}</h3></div>
                  <p>{entry.definition}</p>
                  <div className="dictionaryActions">
                    <button onClick={() => searchHeadwordInBible(entry.headword)}>Pesquisar este termo na Bíblia</button>
                    <button onClick={() => searchHeadwordInTeachings(entry.headword)}>Pesquisar nos Ensinamentos</button>
                  </div>
                </article>)}
              </div>
              {!dictionaryResult.items.length && <div className="emptyState"><div className="emptyIcon">ABC</div><h3>Nenhum verbete localizado</h3><p>Tente outra palavra ou escolha uma letra do índice.</p></div>}
            </section>}

            {!dictionaryResult && <div className="dictionaryWelcome">
              <div className="emptyIcon">ABC</div>
              <h3>Pesquise um termo ou escolha uma letra</h3>
              <p>O dicionário possui {bibleMeta?.dictionary?.stats?.entries?.toLocaleString('pt-BR') || '5.614'} verbetes pesquisáveis, além do PDF completo com os auxílios editoriais.</p>
            </div>}
          </>}
        </section>
      )}

      {mode === 'documents' && (
        <section className="workspace documentsWorkspace">
          <div className="documentsHero">
            <div>
              <div className="sectionEyebrow">Central de documentos</div>
              <h2>Baixe compilações organizadas do acervo</h2>
              <p>Gere um PDF textual por tipo de documento ou por ano. Cada tópico mantém sua referência de fonte e página original.</p>
            </div>
            <a className="outlineButton" href="/documento.pdf" target="_blank" rel="noreferrer">Abrir PDF original completo ↗</a>
          </div>

          <div className="downloadGrid">
            <section className={`downloadCard ${downloadMode === 'type' ? 'selected' : ''}`} onClick={() => setDownloadMode('type')}>
              <div className="downloadIcon">T</div>
              <div><h3>Por tipo de documento</h3><p>Convenção, Estatuto, Circular, RGE e demais tipos catalogados.</p></div>
              <span className="radioDot" />
            </section>
            <section className={`downloadCard ${downloadMode === 'year' ? 'selected' : ''}`} onClick={() => setDownloadMode('year')}>
              <div className="downloadIcon">A</div>
              <div><h3>Tópicos por ano</h3><p>Crie uma compilação com todos os tópicos associados ao ano escolhido.</p></div>
              <span className="radioDot" />
            </section>
          </div>

          <section className="downloadBuilder">
            <div className="builderInfo">
              <span className="techBadge light"><i /> Prévia obrigatória antes do download</span>
              <h3>{downloadMode === 'type' ? 'Selecione o tipo de documento' : 'Selecione o ano dos tópicos'}</h3>
              <p>Primeiro visualize na tela exatamente o documento ou a compilação que será gerada. Depois, se estiver tudo certo, faça o download em PDF.</p>
            </div>
            <div className="builderControls previewControls">
              {downloadMode === 'type' ? (
                <label><span>Tipo</span><select value={downloadType} onChange={e => setDownloadType(e.target.value)}>{filters.types.map(x => <option key={x} value={x}>{x}{filters.typeCounts?.find(c => c.value === x) ? ` · ${filters.typeCounts.find(c => c.value === x)?.total} tópicos` : ''}</option>)}</select></label>
              ) : (
                <label><span>Ano</span><select value={downloadYear} onChange={e => setDownloadYear(e.target.value)}>{filters.years.map(y => <option key={y} value={y}>{y}{filters.yearCounts?.find(c => c.value === y) ? ` · ${filters.yearCounts.find(c => c.value === y)?.total} tópicos` : ''}</option>)}</select></label>
              )}
              <button className="outlineButton lightOutline bigButton" onClick={previewDocument} disabled={downloadMode === 'type' ? !downloadType : !downloadYear}>Visualizar documentos</button>
              <button className="primaryButton bigButton" onClick={downloadDocument} disabled={!previewIsCurrent} title={!previewIsCurrent ? 'Visualize a seleção antes de baixar.' : 'Baixar o PDF visualizado'}>Baixar PDF</button>
            </div>
          </section>

          {previewIsCurrent && (
            <section className="documentPreviewPanel">
              <div className="documentPreviewHeader">
                <div>
                  <div className="sectionEyebrow">Prévia do documento</div>
                  <h3>{downloadMode === 'type' ? downloadType : `Tópicos de ${downloadYear}`}</h3>
                  <p>Confira o conteúdo abaixo. Esta é a mesma compilação que será baixada em PDF.</p>
                </div>
                <div className="documentPreviewActions">
                  <a className="outlineButton" href={documentPreviewUrl} target="_blank" rel="noreferrer">Abrir prévia em nova guia ↗</a>
                  <button className="primaryButton" onClick={downloadDocument}>Baixar este PDF</button>
                </div>
              </div>
              <div className="documentPreviewFrameWrap">
                <iframe className="documentPreviewFrame" src={documentPreviewUrl} title={`Prévia de ${downloadMode === 'type' ? downloadType : `Tópicos de ${downloadYear}`}`} />
              </div>
              <div className="documentPreviewNote">
                <span>✓</span>
                <p>Se você alterar o tipo de documento ou o ano, será necessário gerar uma nova prévia antes de baixar.</p>
              </div>
            </section>
          )}

          {!previewIsCurrent && (downloadMode === 'type' ? downloadType : downloadYear) && (
            <div className="previewRequiredHint">
              <span>1</span><b>Selecione</b><i>→</i><span>2</span><b>Visualize</b><i>→</i><span>3</span><b>Baixe</b>
            </div>
          )}

          <div className="downloadHints">
            <button onClick={() => { const v = filters.types.find(x => x.toLocaleLowerCase('pt-BR').includes('conven')); if (v) { setDownloadMode('type'); setDownloadType(v); } }}>Convenção</button>
            <button onClick={() => { const v = filters.types.find(x => x.toLocaleLowerCase('pt-BR').includes('estat')); if (v) { setDownloadMode('type'); setDownloadType(v); } }}>Estatuto</button>
            <button onClick={() => { setDownloadMode('year'); if (filters.years[0]) setDownloadYear(String(filters.years[0])); }}>Tópicos do ano mais recente</button>
          </div>
        </section>
      )}

      <section className="trustBar">
        <div className="trustIcon">✓</div>
        <div><b>Consulta documental rastreável</b><span>Os resultados preservam a indicação de fonte, página, ano e referência para facilitar a conferência no documento original.</span></div>
      </section>

      <footer className="appFooter"><div><strong>Consulta de Ensinamentos</strong><span>Pesquisa bíblica, histórica e documental</span></div><div className="footerRight"><span>Bíblia ARC 2009 · Dicionário Bíblico · Documentos</span><small>Ferramenta independente de consulta documental. Não representa canal oficial da Congregação Cristã no Brasil.</small></div></footer>
    </main>
  );
}
