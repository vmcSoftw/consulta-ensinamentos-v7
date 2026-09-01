'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

type Source = {
  id: number;
  year: number | null;
  source_type: string;
  title: string;
  page_start: number | null;
  page_end: number | null;
};

type DuplicateCandidate = {
  id: number;
  title: string;
  topic_number: string | null;
  page_start: number | null;
  page_end: number | null;
  category: string | null;
  year: number | null;
  source_type: string | null;
  source_title: string;
  match_reason: string;
};

type DuplicateWarning = {
  message: string;
  items: DuplicateCandidate[];
};

type PdfJsLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: { data: Uint8Array }) => { promise: Promise<any> };
};

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
    __pdfJsLoading?: Promise<PdfJsLib>;
  }
}

const CATEGORIES = [
  'Administração e patrimônio','Batismo e sacramentos','Conduta cristã','Cultos e vida espiritual','Doutrina',
  'Família e casamento','Ministério','Mocidade e menores','Música','Outros'
];

const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

function loadPdfJs(): Promise<PdfJsLib> {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (window.__pdfJsLoading) return window.__pdfJsLoading;

  window.__pdfJsLoading = new Promise<PdfJsLib>((resolve, reject) => {
    const ready = () => {
      window.removeEventListener('pdfjs-ready', ready);
      if (!window.pdfjsLib) {
        reject(new Error('Não foi possível carregar o leitor de PDF.'));
        return;
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      resolve(window.pdfjsLib);
    };

    window.addEventListener('pdfjs-ready', ready, { once: true });
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
      import * as pdfjsLib from "${PDFJS_URL}";
      window.pdfjsLib = pdfjsLib;
      window.dispatchEvent(new Event('pdfjs-ready'));
    `;
    script.onerror = () => reject(new Error('Não foi possível carregar o leitor de PDF. Verifique a conexão com a internet.'));
    document.head.appendChild(script);
  }).finally(() => {
    window.__pdfJsLoading = undefined;
  });

  return window.__pdfJsLoading;
}

function cleanPageText(items: any[]) {
  let output = '';
  for (const item of items) {
    if (!item || typeof item.str !== 'string') continue;
    output += item.str;
    output += item.hasEOL ? '\n' : ' ';
  }
  return output
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function bytesToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

type PdfPage = { page: number; text: string; lines: string[] };
type DetectionConfidence = 'alta' | 'média' | 'baixa';
type DetectedTopic = {
  uid: string;
  topicNumber: string;
  title: string;
  content: string;
  pageStart: number;
  pageEnd: number;
  category: string;
  keywords: string;
  selected: boolean;
  confidence: DetectionConfidence;
  reason: string;
};

type BatchImportResult = {
  created: number;
  skippedDuplicates: number;
  skipped: Array<{
    input_index: number;
    title: string;
    page_start: number;
    matches: Array<{ id: number; title: string; match_reason: string; year: number | null; source_type: string; source_title: string }>;
  }>;
};

const DOCUMENT_HEADER_PATTERNS = [
  /^CONGREGAÇÃO CRISTÃ NO BRASIL$/i,
  /^TÓPICOS? DE ENSINAMENTOS?/i,
  /^REUNIÕES? GERAIS? DE ENSINAMENTOS?/i,
  /^RESUMO DE ENSINAMENTOS/i,
  /^ADMINISTRAÇÃO(?: |$)/i,
  /^PÁGINA\s+\d+/i,
  /^CIRCULAR\s+(?:N[º°.]?\s*)?\d+/i,
  /^\d{1,3}ª?\s+ASSEMBLEIA/i,
  /^SÃO PAULO(?:\s*[-–—]|$)/i
];

function normalizeForDetection(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isDocumentHeader(line: string) {
  const clean = line.trim();
  return DOCUMENT_HEADER_PATTERNS.some(pattern => pattern.test(clean));
}

function upperRatio(line: string) {
  const letters = line.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || [];
  if (!letters.length) return 0;
  const uppercase = letters.filter(ch => ch === ch.toUpperCase()).length;
  return uppercase / letters.length;
}

function detectHeading(line: string) {
  const clean = line.replace(/\s+/g, ' ').trim();
  if (!clean || clean.length < 5 || clean.length > 220 || isDocumentHeader(clean)) return null;

  const coded = clean.match(/^([A-Za-zÀ-ÖØ-öø-ÿ]{2,10})\.?\s*(\d{1,3})\s*[-–—:]\s*(.{4,180})$/);
  if (coded) return { topicNumber: `${coded[1]}. ${coded[2]}`, title: coded[3].trim(), confidence: 'alta' as const, reason: 'Código e número de tópico identificados' };

  const explicit = clean.match(/^(?:T[ÓO]PICO\s*)?(\d{1,3})(?:\s*[.)]\s*|\s*[-–—:]\s+)(.{4,180})$/i);
  if (explicit) return { topicNumber: explicit[1], title: explicit[2].trim(), confidence: 'alta' as const, reason: 'Número de tópico identificado' };

  const numberedWords = clean.match(/^(\d{1,3})\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 /()'’.,-]{7,180})$/);
  if (numberedWords && upperRatio(numberedWords[2]) > 0.82) {
    return { topicNumber: numberedWords[1], title: numberedWords[2].trim(), confidence: 'alta' as const, reason: 'Número seguido de título em destaque' };
  }

  if (
    clean.length >= 9 && clean.length <= 170 &&
    upperRatio(clean) >= 0.88 &&
    /\s/.test(clean) &&
    !/[.!?;:]$/.test(clean) &&
    !/^EM NOME DO SENHOR JESUS$/i.test(clean)
  ) {
    return { topicNumber: '', title: clean, confidence: 'média' as const, reason: 'Título em caixa alta identificado' };
  }

  return null;
}

function inferCategory(title: string, content: string) {
  const text = normalizeForDetection(`${title} ${content.slice(0, 1800)}`);
  const groups: Array<[string, string[]]> = [
    ['Música', ['musico','musica','orquestra','hino','organista','instrumento','encarregado de orquestra']],
    ['Família e casamento', ['casamento','matrimonio','divorcio','conjuge','esposo','esposa','adultério','adulterio','infidelidade matrimonial']],
    ['Batismo e sacramentos', ['batismo','santa ceia','ceia do senhor','sacramento']],
    ['Mocidade e menores', ['mocidade','jovens e menores','reuniao de jovens','crianca','menores']],
    ['Administração e patrimônio', ['administracao','patrimonio','imovel','casa de oracao','construcao','oferta de imovel','tesouraria']],
    ['Ministério', ['anciao','cooperador','diacono','ministerio','servo de deus','oficio ministerial']],
    ['Cultos e vida espiritual', ['culto','oracao','jejum','uncao','funeral','velorio','visita','testemunho','profecia']],
    ['Conduta cristã', ['vestuario','conduta','costume','modestia','comportamento','diversoes']],
    ['Doutrina', ['doutrina','salvacao','graca','fe','espirito santo','trindade','justificacao']]
  ];
  let best = 'Outros';
  let bestScore = 0;
  for (const [category, words] of groups) {
    const score = words.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
    if (score > bestScore) { best = category; bestScore = score; }
  }
  return best;
}

function inferKeywords(title: string, category: string) {
  const words = normalizeForDetection(title)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 4 && !['para','com','sem','sobre','entre','pela','pelos','pelas','deve','devem','quando','onde','uma','uns','das','dos'].includes(word));
  return Array.from(new Set([category, ...words.slice(0, 8)])).filter(Boolean).join(', ');
}

function inferSourceMetadata(fileName: string, pages: PdfPage[]) {
  const baseName = fileName.replace(/\.pdf$/i, '').trim();
  const sample = `${baseName}\n${pages.slice(0, 3).map(p => p.text).join('\n')}`;
  const normalized = normalizeForDetection(sample);
  const yearMatches = sample.match(/\b(19\d{2}|20\d{2})\b/g) || [];
  const year = yearMatches.length ? yearMatches.map(Number).filter(n => n >= 1900 && n <= 2100).sort((a,b) => b-a)[0] : null;
  let sourceType = 'Documento';
  if (normalized.includes('convencao')) sourceType = 'Convenção';
  else if (normalized.includes('estatuto')) sourceType = 'Estatuto';
  else if (/\brge\b/i.test(sample) || normalized.includes('reunioes gerais de ensinamentos')) sourceType = 'RGE';
  else if (normalized.includes('circular')) sourceType = 'Circular';
  else if (normalized.includes('reuniao')) sourceType = 'Reunião';
  else if (normalized.includes('carta')) sourceType = 'Carta';
  else if (normalized.includes('doutrina')) sourceType = 'Doutrina';
  return { title: baseName, year, sourceType };
}

function detectTopicsFromPages(pages: PdfPage[], fileName: string): DetectedTopic[] {
  type Working = Omit<DetectedTopic, 'uid' | 'selected' | 'category' | 'keywords'> & { chunks: string[] };
  const detected: Working[] = [];
  let current: Working | null = null;

  const finishCurrent = () => {
    if (!current) return;
    const content = current.chunks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (content.length >= 35) detected.push({ ...current, content });
    current = null;
  };

  for (const page of pages) {
    const lines = page.lines.filter(line => line && !/^\d{1,4}$/.test(line.trim()));
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].replace(/\s+/g, ' ').trim();
      if (!line) continue;
      const heading = detectHeading(line);
      if (heading) {
        finishCurrent();
        current = {
          topicNumber: heading.topicNumber,
          title: heading.title,
          content: '',
          pageStart: page.page,
          pageEnd: page.page,
          confidence: heading.confidence,
          reason: heading.reason,
          chunks: []
        };
        continue;
      }

      if (current) {
        current.pageEnd = page.page;
        if (current.chunks.length === 0 && upperRatio(line) >= 0.88 && line.length < 130 && !isDocumentHeader(line)) {
          current.title = `${current.title} ${line}`.replace(/\s+/g, ' ').trim();
          continue;
        }
        current.chunks.push(line);
      }
    }
  }
  finishCurrent();

  const usable = detected.filter(item => {
    const normalizedTitle = normalizeForDetection(item.title);
    return item.content.length >= 45 && !['prefacio','sumario','indice'].includes(normalizedTitle);
  });

  if (!usable.length) {
    const combined = pages.map(p => p.text).join('\n\n').trim();
    if (!combined) return [];
    const title = fileName.replace(/\.pdf$/i, '').trim() || 'Documento importado';
    return [{
      uid: `pdf-fallback-1`,
      topicNumber: '',
      title,
      content: combined,
      pageStart: pages[0]?.page || 1,
      pageEnd: pages.at(-1)?.page || 1,
      category: inferCategory(title, combined),
      keywords: inferKeywords(title, inferCategory(title, combined)),
      selected: true,
      confidence: 'baixa',
      reason: 'Nenhuma divisão segura foi encontrada; conteúdo mantido como tópico único'
    }];
  }

  return usable.slice(0, 200).map((item, index) => {
    const category = inferCategory(item.title, item.content);
    return {
      uid: `pdf-topic-${index + 1}-${item.pageStart}`,
      topicNumber: item.topicNumber,
      title: item.title,
      content: item.content,
      pageStart: item.pageStart,
      pageEnd: item.pageEnd,
      category,
      keywords: inferKeywords(item.title, category),
      selected: true,
      confidence: item.confidence,
      reason: item.reason
    };
  });
}

export default function AdminPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [configurationError, setConfigurationError] = useState('');
  const [blockedUntil, setBlockedUntil] = useState<string | null>(null);

  const [sources, setSources] = useState<Source[]>([]);
  const [sourceMode, setSourceMode] = useState<'existing' | 'new'>('existing');
  const [sourceId, setSourceId] = useState('');
  const [topicNumber, setTopicNumber] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pageStart, setPageStart] = useState('');
  const [pageEnd, setPageEnd] = useState('');
  const [category, setCategory] = useState('');
  const [keywords, setKeywords] = useState('');
  const [newSourceTitle, setNewSourceTitle] = useState('');
  const [newSourceType, setNewSourceType] = useState('Documento');
  const [newSourceYear, setNewSourceYear] = useState('');
  const [newSourcePageStart, setNewSourcePageStart] = useState('');
  const [newSourcePageEnd, setNewSourcePageEnd] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarning | null>(null);

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfReading, setPdfReading] = useState(false);
  const [pdfProgress, setPdfProgress] = useState('');
  const [pdfMessage, setPdfMessage] = useState('');
  const [pdfSha256, setPdfSha256] = useState('');
  const [pdfMode, setPdfMode] = useState<'single' | 'intelligent'>('single');
  const [pdfPages, setPdfPages] = useState<PdfPage[]>([]);
  const [detectedTopics, setDetectedTopics] = useState<DetectedTopic[]>([]);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchImportResult | null>(null);

  useEffect(() => {
    fetch('/api/admin/session', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        setAuthenticated(Boolean(d.authenticated));
        setSessionExpiresAt(d.expiresAt || null);
        setConfigurationError(d.configurationError || '');
      })
      .catch(() => { setAuthenticated(false); setSessionExpiresAt(null); })
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!blockedUntil) return;
    const wait = new Date(blockedUntil).getTime() - Date.now();
    if (wait <= 0) { setBlockedUntil(null); return; }
    const timer = window.setTimeout(() => { setBlockedUntil(null); setLoginError(''); }, wait + 250);
    return () => window.clearTimeout(timer);
  }, [blockedUntil]);

  useEffect(() => {
    if (!authenticated || !sessionExpiresAt) return;
    const wait = new Date(sessionExpiresAt).getTime() - Date.now();
    if (wait <= 0) { setAuthenticated(false); setSessionExpiresAt(null); return; }
    const timer = window.setTimeout(() => {
      setAuthenticated(false);
      setSessionExpiresAt(null);
      setSources([]);
    }, wait + 250);
    return () => window.clearTimeout(timer);
  }, [authenticated, sessionExpiresAt]);

  useEffect(() => {
    if (!authenticated) return;
    fetch('/api/sources')
      .then(r => r.json())
      .then(d => setSources(d.items || []))
      .catch(() => {});
  }, [authenticated]);

  async function login(e: FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    try {
      const r = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPassword })
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.blockedUntil) setBlockedUntil(d.blockedUntil);
        const remaining = Number.isInteger(d.remainingAttempts) ? ` Restam ${d.remainingAttempts} tentativa(s).` : '';
        throw new Error((d.error || 'Não foi possível autenticar.') + remaining);
      }
      setAuthenticated(true);
      setSessionExpiresAt(d.expiresAt || null);
      setBlockedUntil(null);
      setLoginPassword('');
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Não foi possível autenticar.');
    } finally {
      setLoggingIn(false);
    }
  }

  async function logout() {
    await fetch('/api/admin/session', { method: 'DELETE' }).catch(() => {});
    setAuthenticated(false);
    setSessionExpiresAt(null);
    setSources([]);
    setMessage('');
    setError('');
  }

  async function logoutAll() {
    const ok = window.confirm('Encerrar todas as sessões administrativas ativas? Será necessário entrar novamente em todos os dispositivos.');
    if (!ok) return;
    const r = await fetch('/api/admin/session?all=1', { method: 'DELETE' }).catch(() => null);
    if (!r || !r.ok) {
      setError('Não foi possível encerrar todas as sessões.');
      return;
    }
    setAuthenticated(false);
    setSessionExpiresAt(null);
    setSources([]);
  }

  function sessionExpiryLabel() {
    if (!sessionExpiresAt) return 'Sessão protegida';
    const d = new Date(sessionExpiresAt);
    if (Number.isNaN(d.getTime())) return 'Sessão protegida';
    return `Acesso até ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function blockLabel() {
    if (!blockedUntil) return '';
    const d = new Date(blockedUntil);
    if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return '';
    return `Novas tentativas liberadas após ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
  }

  async function readPdf() {
    if (!pdfFile) return;
    if (pdfFile.size > 25 * 1024 * 1024) {
      setError('O PDF ultrapassa 25 MB. Use um arquivo menor.');
      return;
    }

    setPdfReading(true);
    setPdfProgress('Carregando leitor de PDF…');
    setPdfMessage('');
    setError('');
    setBatchResult(null);

    try {
      const pdfjs = await loadPdfJs();
      const data = new Uint8Array(await pdfFile.arrayBuffer());
      const hashInput = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', hashInput);
      setPdfSha256(bytesToHex(hashBuffer));
      const pdf = await pdfjs.getDocument({ data }).promise;
      const pages: PdfPage[] = [];

      for (let i = 1; i <= pdf.numPages; i += 1) {
        setPdfProgress(`Lendo página ${i} de ${pdf.numPages}…`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = cleanPageText(textContent.items || []);
        if (pageText) {
          pages.push({
            page: i,
            text: pageText,
            lines: pageText.split('\n').map(line => line.trim()).filter(Boolean)
          });
        }
      }

      if (!pages.length) {
        throw new Error('O PDF não possui texto selecionável. Se ele for digitalizado como imagem, será necessário OCR antes da importação.');
      }

      setPdfPages(pages);
      const baseName = pdfFile.name.replace(/\.pdf$/i, '').trim();
      const meta = inferSourceMetadata(pdfFile.name, pages);

      if (pdfMode === 'intelligent') {
        const candidates = detectTopicsFromPages(pages, pdfFile.name);
        setDetectedTopics(candidates);
        if (!sourceId) setSourceMode('new');
        if (!newSourceTitle.trim()) setNewSourceTitle(meta.title || baseName);
        if (newSourceType === 'Documento' || !newSourceType.trim()) setNewSourceType(meta.sourceType);
        if (!newSourceYear && meta.year) setNewSourceYear(String(meta.year));
        if (!newSourcePageStart) setNewSourcePageStart('1');
        setNewSourcePageEnd(String(pdf.numPages));
        setPdfMessage(`${candidates.length} possível(is) tópico(s) detectado(s) em ${pdf.numPages} página(s). Revise a seleção, os títulos e a fonte antes de gravar.`);
      } else {
        const extracted = pages.map(page => page.text).join('\n\n').trim();
        setContent(extracted);
        if (!title.trim()) setTitle(baseName);
        if (!pageStart) setPageStart('1');
        setPageEnd(String(pdf.numPages));
        if (sourceMode === 'new') {
          if (!newSourceTitle.trim()) setNewSourceTitle(meta.title || baseName);
          if (newSourceType === 'Documento' || !newSourceType.trim()) setNewSourceType(meta.sourceType);
          if (!newSourceYear && meta.year) setNewSourceYear(String(meta.year));
          if (!newSourcePageStart) setNewSourcePageStart('1');
          setNewSourcePageEnd(String(pdf.numPages));
        }
        setDetectedTopics([]);
        setPdfMessage(`PDF importado: ${pdf.numPages} página(s). Revise o título, a fonte, a categoria e o conteúdo antes de salvar.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ler o PDF.');
    } finally {
      setPdfReading(false);
      setPdfProgress('');
    }
  }

  function updateDetectedTopic(uid: string, patch: Partial<DetectedTopic>) {
    setDetectedTopics(items => items.map(item => item.uid === uid ? { ...item, ...patch } : item));
  }

  function selectDetected(mode: 'all' | 'none' | 'high') {
    setDetectedTopics(items => items.map(item => ({
      ...item,
      selected: mode === 'all' ? true : mode === 'none' ? false : item.confidence === 'alta'
    })));
  }

  async function importDetectedTopics() {
    const selected = detectedTopics.filter(item => item.selected);
    if (!selected.length) {
      setError('Selecione pelo menos um tópico detectado.');
      return;
    }
    if (sourceMode === 'existing' && !sourceId) {
      setError('Selecione a fonte onde os tópicos serão gravados.');
      return;
    }
    if (sourceMode === 'new' && !newSourceTitle.trim()) {
      setError('Informe o título da nova fonte antes da importação.');
      return;
    }

    setBatchSaving(true);
    setError('');
    setMessage('');
    setBatchResult(null);

    const body: any = {
      source_section_id: sourceMode === 'existing' ? Number(sourceId) || null : null,
      topics: selected.map(item => ({
        topic_number: item.topicNumber,
        title: item.title,
        content: item.content,
        page_start: item.pageStart,
        page_end: item.pageEnd,
        category: item.category,
        keywords: item.keywords
      })),
      source_file_name: pdfFile?.name || null,
      source_file_sha256: pdfSha256 || null,
      source_file_size: pdfFile?.size || null
    };

    if (sourceMode === 'new') {
      body.new_source = {
        title: newSourceTitle,
        source_type: newSourceType,
        year: Number(newSourceYear) || null,
        page_start: Number(newSourcePageStart) || Math.min(...selected.map(item => item.pageStart)),
        page_end: Number(newSourcePageEnd) || Math.max(...selected.map(item => item.pageEnd))
      };
    }

    try {
      const r = await fetch('/api/admin/topics/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const d = await r.json();
      if (r.status === 401) {
        setAuthenticated(false);
        throw new Error('Sua sessão administrativa expirou. Entre novamente com a senha.');
      }
      if (!r.ok) throw new Error(d.error || 'Falha na importação inteligente.');
      const result: BatchImportResult = {
        created: Number(d.created || 0),
        skippedDuplicates: Number(d.skippedDuplicates || 0),
        skipped: Array.isArray(d.skipped) ? d.skipped : []
      };
      setBatchResult(result);
      setMessage(`${result.created} tópico(s) novo(s) gravado(s). ${result.skippedDuplicates} possível(is) duplicado(s) foi(ram) ignorado(s).`);
      setDetectedTopics(items => items.map(item => item.selected ? { ...item, selected: false } : item));
      if (d.sourceId && sourceMode === 'new') {
        setSourceMode('existing');
        setSourceId(String(d.sourceId));
        fetch('/api/sources').then(r2 => r2.json()).then(data => setSources(data.items || [])).catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na importação inteligente.');
    } finally {
      setBatchSaving(false);
    }
  }

  async function submit(e?: FormEvent, forceDuplicate = false) {
    e?.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    setDuplicateWarning(null);
    const body: any = {
      source_section_id: sourceMode === 'existing' ? Number(sourceId) || null : null,
      topic_number: topicNumber,
      title,
      content,
      page_start: Number(pageStart) || null,
      page_end: Number(pageEnd) || null,
      category,
      keywords,
      force_duplicate: forceDuplicate,
      entry_origin: pdfFile ? 'pdf' : 'manual',
      source_file_name: pdfFile?.name || null,
      source_file_sha256: pdfSha256 || null,
      source_file_size: pdfFile?.size || null
    };
    if (sourceMode === 'new') {
      body.new_source = {
        title: newSourceTitle,
        source_type: newSourceType,
        year: Number(newSourceYear) || null,
        page_start: Number(newSourcePageStart) || Number(pageStart) || null,
        page_end: Number(newSourcePageEnd) || Number(newSourcePageStart) || Number(pageEnd) || Number(pageStart) || null
      };
    }

    try {
      const r = await fetch('/api/admin/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const d = await r.json();
      if (r.status === 401) {
        setAuthenticated(false);
        throw new Error('Sua sessão administrativa expirou. Entre novamente com a senha.');
      }
      if (r.status === 409 && d.code === 'POSSIBLE_DUPLICATE') {
        setDuplicateWarning({
          message: d.error || 'Foi encontrado um tópico possivelmente duplicado.',
          items: Array.isArray(d.duplicates) ? d.duplicates : []
        });
        return;
      }
      if (!r.ok) throw new Error(d.error || 'Falha ao salvar');
      setMessage(`Tópico inserido com sucesso. ID ${d.id}.`);
      setTopicNumber(''); setTitle(''); setContent(''); setPageStart(''); setPageEnd(''); setCategory(''); setKeywords('');
      setPdfFile(null); setPdfMessage(''); setPdfSha256('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao inserir tópico.');
    } finally {
      setSaving(false);
    }
  }

  if (!authChecked) {
    return (
      <main className="shell adminLoginShell">
        <section className="adminLoginCard"><div className="loginLock">⌛</div><h1>Verificando acesso</h1><p>Aguarde um instante.</p></section>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="shell adminLoginShell">
        <section className="adminLoginCard">
          <div className="loginLock">🔐</div>
          <div className="modeBadge">Área restrita</div>
          <h1>Acesso administrativo</h1>
          <p>Somente administradores autorizados podem inserir novos tópicos, novas fontes ou importar conteúdo em PDF. O acesso usa sessão temporária e proteção contra tentativas repetidas.</p>
          <form onSubmit={login} className="adminLoginForm">
            <label>Senha de administrador
              <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} autoFocus required autoComplete="current-password" />
            </label>
            <button disabled={loggingIn || Boolean(blockLabel())}>{loggingIn ? 'Entrando…' : 'Entrar na administração'}</button>
          </form>
          {configurationError && <div className="errorBox">{configurationError}</div>}
          {loginError && <div className="errorBox">{loginError}</div>}
          {blockLabel() && <div className="securityLockNotice">🔒 {blockLabel()}</div>}
          <Link className="loginBack" href="/">← Voltar à consulta</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="adminTop">
        <div>
          <div className="modeBadge">Administração autenticada</div>
          <h1>Inserir novo tópico</h1>
          <p>Cadastre tópicos diretamente no acervo Neon ou importe o conteúdo de um PDF para revisar e salvar.</p>
        </div>
        <div className="adminTopActions">
          <span className="adminSessionBadge">✓ {sessionExpiryLabel()}</span>
          <Link className="adminLink duplicateAdminLink" href="/admin/duplicados">🧹 Duplicados</Link>
          <Link className="adminLink auditAdminLink" href="/admin/historico">◷ Histórico</Link>
          <button className="logoutButton" type="button" onClick={logout}>Sair</button>
          <button className="logoutAllButton" type="button" onClick={logoutAll}>Encerrar todas</button>
          <Link className="adminLink" href="/">← Voltar à consulta</Link>
        </div>
      </div>

      <form className="adminForm" onSubmit={submit}>
        <section className="formSection pdfImportSection">
          <div className="pdfImportHead">
            <div><span className="sectionEyebrow">Importação</span><h2>Carregar conteúdo a partir de PDF</h2></div>
            <span className="pdfBadge">PDF</span>
          </div>
          <p className="formHelp">Escolha entre importar o PDF como um único tópico ou usar a detecção inteligente para separar vários tópicos antes da gravação.</p>

          <div className="pdfModeSelector" role="tablist" aria-label="Modo de importação do PDF">
            <button type="button" className={pdfMode === 'single' ? 'active' : ''} onClick={() => { setPdfMode('single'); setDetectedTopics([]); setBatchResult(null); }}>
              <b>Um tópico</b><small>Extrai todo o PDF para o formulário atual.</small>
            </button>
            <button type="button" className={pdfMode === 'intelligent' ? 'active' : ''} onClick={() => { setPdfMode('intelligent'); setBatchResult(null); }}>
              <b>Importação inteligente</b><small>Detecta títulos, páginas e vários tópicos para revisão.</small>
            </button>
          </div>

          <div className="pdfImportControls">
            <label className="pdfFileLabel">Arquivo PDF
              <input type="file" accept="application/pdf,.pdf" onChange={e => {
                setPdfFile(e.target.files?.[0] || null);
                setPdfMessage('');
                setPdfSha256('');
                setPdfPages([]);
                setDetectedTopics([]);
                setBatchResult(null);
              }} />
            </label>
            <button type="button" className="pdfReadButton" onClick={readPdf} disabled={!pdfFile || pdfReading}>
              {pdfReading ? (pdfProgress || 'Lendo PDF…') : pdfMode === 'intelligent' ? 'Analisar e detectar tópicos' : 'Importar conteúdo do PDF'}
            </button>
          </div>
          {pdfFile && <div className="selectedPdf"><b>Selecionado:</b> {pdfFile.name} · {(pdfFile.size / 1024 / 1024).toFixed(2)} MB{pdfSha256 ? ` · SHA-256 ${pdfSha256.slice(0, 12)}…` : ''}</div>}
          {pdfMessage && <div className="successBox">{pdfMessage}</div>}

          {pdfMode === 'intelligent' && detectedTopics.length > 0 && (
            <div className="smartImportPanel">
              <div className="smartImportSummary">
                <div>
                  <span className="sectionEyebrow">Prévia antes de gravar</span>
                  <h3>{detectedTopics.length} tópico(s) detectado(s)</h3>
                  <p>{detectedTopics.filter(item => item.selected).length} selecionado(s) · {detectedTopics.filter(item => item.confidence === 'alta').length} com alta confiança</p>
                </div>
                <div className="smartImportActions">
                  <button type="button" onClick={() => selectDetected('all')}>Selecionar todos</button>
                  <button type="button" onClick={() => selectDetected('high')}>Somente alta confiança</button>
                  <button type="button" onClick={() => selectDetected('none')}>Limpar seleção</button>
                </div>
              </div>

              <div className="smartTopicList">
                {detectedTopics.map((item, index) => (
                  <article key={item.uid} className={`smartTopicCard ${item.selected ? 'selected' : ''}`}>
                    <div className="smartTopicTop">
                      <label className="smartTopicCheck">
                        <input type="checkbox" checked={item.selected} onChange={e => updateDetectedTopic(item.uid, { selected: e.target.checked })} />
                        <span>{String(index + 1).padStart(2, '0')}</span>
                      </label>
                      <div className="smartTopicMeta">
                        <span className={`confidenceBadge confidence-${item.confidence}`}>{item.confidence}</span>
                        <span>pág. {item.pageStart}{item.pageEnd !== item.pageStart ? `–${item.pageEnd}` : ''}</span>
                        <span>{item.reason}</span>
                      </div>
                    </div>
                    <div className="smartTopicFields">
                      <label>Nº
                        <input value={item.topicNumber} onChange={e => updateDetectedTopic(item.uid, { topicNumber: e.target.value })} placeholder="Opcional" />
                      </label>
                      <label className="smartTitleField">Título
                        <input value={item.title} onChange={e => updateDetectedTopic(item.uid, { title: e.target.value })} />
                      </label>
                      <label>Categoria
                        <select value={item.category} onChange={e => updateDetectedTopic(item.uid, { category: e.target.value })}>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                    </div>
                    <details className="smartTopicDetails">
                      <summary>Revisar conteúdo detectado</summary>
                      <textarea rows={8} value={item.content} onChange={e => updateDetectedTopic(item.uid, { content: e.target.value })} />
                      <label>Palavras-chave
                        <input value={item.keywords} onChange={e => updateDetectedTopic(item.uid, { keywords: e.target.value })} />
                      </label>
                    </details>
                  </article>
                ))}
              </div>
              <div className="smartImportNote">
                <span>✓</span>
                <p><b>Nada é gravado automaticamente.</b> A detecção é uma sugestão. Revise os títulos, desmarque itens incorretos e configure a fonte na seção abaixo. Possíveis duplicações serão ignoradas durante a importação em lote.</p>
              </div>
            </div>
          )}
        </section>

        <section className="formSection">
          <h2>1. Fonte do tópico</h2>
          <div className="modeTabs compactTabs">
            <button type="button" className={sourceMode === 'existing' ? 'active' : ''} onClick={() => setSourceMode('existing')}>Fonte existente</button>
            <button type="button" className={sourceMode === 'new' ? 'active' : ''} onClick={() => setSourceMode('new')}>Nova fonte</button>
          </div>
          {sourceMode === 'existing' ? (
            <label>Selecione a fonte
              <select value={sourceId} onChange={e => setSourceId(e.target.value)} required>
                <option value="">Selecione...</option>
                {sources.map(s => <option key={s.id} value={s.id}>{s.year || 's/ano'} · {s.source_type} · {s.title}</option>)}
              </select>
            </label>
          ) : (
            <div className="formGrid">
              <label className="wide">Título da nova fonte<input value={newSourceTitle} onChange={e => setNewSourceTitle(e.target.value)} required /></label>
              <label>Tipo<input value={newSourceType} onChange={e => setNewSourceType(e.target.value)} placeholder="Ex.: Circular, RGE, Convenção" /></label>
              <label>Ano<input type="number" value={newSourceYear} onChange={e => setNewSourceYear(e.target.value)} /></label>
              <label>Página inicial<input type="number" value={newSourcePageStart} onChange={e => setNewSourcePageStart(e.target.value)} /></label>
              <label>Página final<input type="number" value={newSourcePageEnd} onChange={e => setNewSourcePageEnd(e.target.value)} /></label>
            </div>
          )}
        </section>

        {pdfMode === 'intelligent' && detectedTopics.length > 0 && (
          <section className="formSection smartSaveSection">
            <div className="smartSaveHeader">
              <div><span className="sectionEyebrow">Importação em lote</span><h2>2. Gravar tópicos selecionados</h2></div>
              <span className="smartCountBadge">{detectedTopics.filter(item => item.selected).length} selecionado(s)</span>
            </div>
            <p className="formHelp">O sistema grava todos os tópicos selecionados na mesma fonte e ignora automaticamente possíveis duplicações já existentes no acervo.</p>
            <button type="button" className="smartSaveButton" disabled={batchSaving || !detectedTopics.some(item => item.selected)} onClick={importDetectedTopics}>
              {batchSaving ? 'Verificando e gravando…' : 'Importar selecionados no Neon'}
            </button>
            {batchResult && (
              <div className="batchResultBox">
                <strong>Importação concluída</strong>
                <span>{batchResult.created} novo(s) · {batchResult.skippedDuplicates} duplicado(s) ignorado(s)</span>
                {batchResult.skipped.length > 0 && (
                  <details>
                    <summary>Ver duplicações ignoradas</summary>
                    <div className="batchSkippedList">
                      {batchResult.skipped.map((item, index) => (
                        <article key={`${item.input_index}-${index}`}>
                          <b>{item.title}</b>
                          <small>pág. {item.page_start} · {item.matches[0]?.match_reason || 'Possível duplicação'}</small>
                        </article>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </section>
        )}

        <section className="formSection">
          <h2>{pdfMode === 'intelligent' && detectedTopics.length > 0 ? '3. Cadastro individual (opcional)' : '2. Dados do tópico'}</h2>
          <div className="formGrid">
            <label>Número do tópico<input value={topicNumber} onChange={e => setTopicNumber(e.target.value)} placeholder="Opcional" /></label>
            <label className="wide">Título<input value={title} onChange={e => setTitle(e.target.value)} required /></label>
            <label>Página inicial<input type="number" value={pageStart} onChange={e => setPageStart(e.target.value)} required /></label>
            <label>Página final<input type="number" value={pageEnd} onChange={e => setPageEnd(e.target.value)} /></label>
            <label>Categoria
              <select value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">Sem categoria</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="wide">Palavras-chave<input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="Separe por vírgulas" /></label>
            <label className="wide">Conteúdo<textarea rows={14} value={content} onChange={e => setContent(e.target.value)} required /></label>
          </div>
        </section>

        {duplicateWarning && (
          <section className="duplicateWarningBox" aria-live="polite">
            <div className="duplicateWarningHead">
              <span>⚠</span>
              <div>
                <strong>Possível duplicação encontrada</strong>
                <p>{duplicateWarning.message} Revise antes de gravar novamente.</p>
              </div>
            </div>
            <div className="duplicateList">
              {duplicateWarning.items.map(item => (
                <article key={item.id} className="duplicateItem">
                  <div>
                    <b>{item.title}</b>
                    <span>{item.year || 's/ano'} · {item.source_type || 'Documento'} · {item.source_title || 'Fonte sem título'} · pág. {item.page_start || '—'}{item.page_end && item.page_end !== item.page_start ? `–${item.page_end}` : ''}</span>
                    <small>{item.match_reason} · ID {item.id}</small>
                  </div>
                </article>
              ))}
            </div>
            <div className="duplicateActions">
              <button type="button" className="outlineButton" onClick={() => setDuplicateWarning(null)}>Revisar cadastro</button>
              <button type="button" className="dangerConfirmButton" disabled={saving} onClick={() => submit(undefined, true)}>Salvar mesmo assim</button>
            </div>
          </section>
        )}

        <section className="formSection securitySection">
          <h2>{pdfMode === 'intelligent' && detectedTopics.length > 0 ? '4. Confirmar cadastro individual' : '3. Confirmar gravação'}</h2>
          <div className="adminAuthorizedNote"><span>✓</span><div><b>Sessão administrativa autenticada e revogável</b><small>{sessionExpiryLabel()}. Antes de gravar, o sistema verifica possíveis duplicações e registra a operação no histórico administrativo.</small></div></div>
          <button className="saveButton" disabled={saving}>{saving ? 'Salvando...' : 'Salvar tópico no Neon'}</button>
          {message && <div className="successBox">{message}</div>}
          {error && <div className="errorBox">{error}</div>}
        </section>
      </form>
    </main>
  );
}
