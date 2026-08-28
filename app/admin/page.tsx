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

    try {
      const pdfjs = await loadPdfJs();
      const data = new Uint8Array(await pdfFile.arrayBuffer());
      const hashInput = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', hashInput);
      setPdfSha256(bytesToHex(hashBuffer));
      const pdf = await pdfjs.getDocument({ data }).promise;
      const pages: string[] = [];

      for (let i = 1; i <= pdf.numPages; i += 1) {
        setPdfProgress(`Lendo página ${i} de ${pdf.numPages}…`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = cleanPageText(textContent.items || []);
        if (pageText) pages.push(pageText);
      }

      const extracted = pages.join('\n\n').trim();
      if (!extracted) {
        throw new Error('O PDF não possui texto selecionável. Se ele for digitalizado como imagem, será necessário OCR antes da importação.');
      }

      const baseName = pdfFile.name.replace(/\.pdf$/i, '').trim();
      setContent(extracted);
      if (!title.trim()) setTitle(baseName);
      if (!pageStart) setPageStart('1');
      setPageEnd(String(pdf.numPages));
      if (sourceMode === 'new') {
        if (!newSourceTitle.trim()) setNewSourceTitle(baseName);
        if (!newSourcePageStart) setNewSourcePageStart('1');
        setNewSourcePageEnd(String(pdf.numPages));
      }
      setPdfMessage(`PDF importado: ${pdf.numPages} página(s). Revise o título, a fonte, a categoria e o conteúdo antes de salvar.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ler o PDF.');
    } finally {
      setPdfReading(false);
      setPdfProgress('');
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
          <Link className="adminLink auditAdminLink" href="/admin/historico">◷ Histórico</Link>
          <button className="logoutButton" type="button" onClick={logout}>Sair</button>
          <button className="logoutAllButton" type="button" onClick={logoutAll}>Encerrar todas</button>
          <Link className="adminLink" href="/">← Voltar à consulta</Link>
        </div>
      </div>

      <form className="adminForm" onSubmit={submit}>
        <section className="formSection pdfImportSection">
          <div className="pdfImportHead">
            <div><span className="sectionEyebrow">Importação</span><h2>Carregar tópico a partir de PDF</h2></div>
            <span className="pdfBadge">PDF</span>
          </div>
          <p className="formHelp">Selecione um PDF com texto. O sistema extrai o conteúdo para o formulário; você revisa os dados antes da gravação no banco.</p>
          <div className="pdfImportControls">
            <label className="pdfFileLabel">Arquivo PDF
              <input type="file" accept="application/pdf,.pdf" onChange={e => { setPdfFile(e.target.files?.[0] || null); setPdfMessage(''); setPdfSha256(''); }} />
            </label>
            <button type="button" className="pdfReadButton" onClick={readPdf} disabled={!pdfFile || pdfReading}>{pdfReading ? (pdfProgress || 'Lendo PDF…') : 'Importar conteúdo do PDF'}</button>
          </div>
          {pdfFile && <div className="selectedPdf"><b>Selecionado:</b> {pdfFile.name} · {(pdfFile.size / 1024 / 1024).toFixed(2)} MB{pdfSha256 ? ` · SHA-256 ${pdfSha256.slice(0, 12)}…` : ''}</div>}
          {pdfMessage && <div className="successBox">{pdfMessage}</div>}
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

        <section className="formSection">
          <h2>2. Dados do tópico</h2>
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
          <h2>3. Confirmar gravação</h2>
          <div className="adminAuthorizedNote"><span>✓</span><div><b>Sessão administrativa autenticada e revogável</b><small>{sessionExpiryLabel()}. Antes de gravar, o sistema verifica possíveis duplicações e registra a operação no histórico administrativo.</small></div></div>
          <button className="saveButton" disabled={saving}>{saving ? 'Salvando...' : 'Salvar tópico no Neon'}</button>
          {message && <div className="successBox">{message}</div>}
          {error && <div className="errorBox">{error}</div>}
        </section>
      </form>
    </main>
  );
}
