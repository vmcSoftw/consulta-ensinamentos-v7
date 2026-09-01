'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type AuditItem = {
  id: number;
  created_at: string;
  session_id: number | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  summary: string;
  details: Record<string, unknown> | null;
};

type AuditStats = {
  total?: number;
  topics_created?: number;
  sources_created?: number;
  pdf_imports?: number;
  successful_logins?: number;
};

const ACTION_LABELS: Record<string, string> = {
  'admin.login.success': 'Login',
  'admin.login.failed': 'Tentativa inválida',
  'admin.logout': 'Saída',
  'admin.logout_all': 'Sessões encerradas',
  'topic.created': 'Tópico cadastrado',
  'topic.created_duplicate_override': 'Duplicação confirmada',
  'source.created': 'Fonte cadastrada',
  'topic.duplicates_deleted': 'Duplicados excluídos',
  'system.audit.enabled': 'Auditoria ativada'
};

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

function detailText(details: Record<string, unknown> | null) {
  if (!details) return '';
  const parts: string[] = [];
  if (details.origin === 'pdf') parts.push('Origem: PDF');
  else if (details.origin === 'manual') parts.push('Origem: manual');
  if (typeof details.fileName === 'string' && details.fileName) parts.push(`Arquivo: ${details.fileName}`);
  if (typeof details.year === 'number') parts.push(`Ano: ${details.year}`);
  if (typeof details.pageStart === 'number') parts.push(`Pág. ${details.pageStart}`);
  if (typeof details.sourceTitle === 'string' && details.sourceTitle) parts.push(`Fonte: ${details.sourceTitle}`);
  return parts.join(' · ');
}

export default function AdminHistoryPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [stats, setStats] = useState<AuditStats>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch('/api/admin/session', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!d.authenticated) router.replace('/admin');
        else setAuthChecked(true);
      })
      .catch(() => router.replace('/admin'));
  }, [router]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/admin/audit?limit=150', { cache: 'no-store' });
      const d = await r.json();
      if (r.status === 401) {
        router.replace('/admin');
        return;
      }
      if (!r.ok) throw new Error(d.error || 'Falha ao consultar histórico.');
      setItems(Array.isArray(d.items) ? d.items : []);
      setStats(d.stats || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao consultar histórico.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authChecked) load();
  }, [authChecked]);

  const visible = useMemo(() => {
    if (filter === 'cadastros') return items.filter(x => x.action.startsWith('topic.') || x.action.startsWith('source.'));
    if (filter === 'seguranca') return items.filter(x => x.action.startsWith('admin.'));
    if (filter === 'pdf') return items.filter(x => x.details?.origin === 'pdf');
    return items;
  }, [items, filter]);

  if (!authChecked) {
    return <main className="shell adminLoginShell"><section className="adminLoginCard"><div className="loginLock">⌛</div><h1>Verificando acesso</h1><p>Aguarde um instante.</p></section></main>;
  }

  return (
    <main className="shell adminHistoryShell">
      <div className="adminTop">
        <div>
          <div className="modeBadge">Administração autenticada</div>
          <h1>Histórico e auditoria</h1>
          <p>Acompanhe cadastros, importações por PDF e eventos de segurança registrados a partir da ativação desta função.</p>
        </div>
        <div className="adminTopActions">
          <button className="outlineButton" type="button" onClick={load} disabled={loading}>{loading ? 'Atualizando…' : '↻ Atualizar'}</button>
          <Link className="adminLink" href="/admin">← Voltar ao cadastro</Link>
          <Link className="adminLink" href="/">Consulta pública</Link>
        </div>
      </div>

      <section className="auditStatsGrid">
        <article><span>30 dias</span><strong>{Number(stats.total || 0).toLocaleString('pt-BR')}</strong><small>eventos registrados</small></article>
        <article><span>Cadastros</span><strong>{Number(stats.topics_created || 0).toLocaleString('pt-BR')}</strong><small>tópicos adicionados</small></article>
        <article><span>PDF</span><strong>{Number(stats.pdf_imports || 0).toLocaleString('pt-BR')}</strong><small>cadastros originados de PDF</small></article>
        <article><span>Acessos</span><strong>{Number(stats.successful_logins || 0).toLocaleString('pt-BR')}</strong><small>logins administrativos</small></article>
      </section>

      <section className="auditPanel">
        <div className="auditToolbar">
          <div>
            <span className="sectionEyebrow">Rastreabilidade</span>
            <h2>Eventos recentes</h2>
          </div>
          <div className="auditFilters" role="group" aria-label="Filtrar histórico">
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos</button>
            <button className={filter === 'cadastros' ? 'active' : ''} onClick={() => setFilter('cadastros')}>Cadastros</button>
            <button className={filter === 'pdf' ? 'active' : ''} onClick={() => setFilter('pdf')}>PDF</button>
            <button className={filter === 'seguranca' ? 'active' : ''} onClick={() => setFilter('seguranca')}>Segurança</button>
          </div>
        </div>

        {error && <div className="errorBox">{error}</div>}
        {!error && loading && <div className="auditEmpty">Carregando histórico…</div>}
        {!error && !loading && visible.length === 0 && <div className="auditEmpty">Nenhum evento encontrado neste filtro.</div>}

        {!error && !loading && visible.length > 0 && (
          <div className="auditTimeline">
            {visible.map(item => (
              <article key={item.id} className={`auditEvent audit-${item.action.replaceAll('.', '-')}`}>
                <div className="auditEventMarker" aria-hidden="true" />
                <div className="auditEventBody">
                  <div className="auditEventMeta">
                    <span className="auditActionBadge">{ACTION_LABELS[item.action] || item.action}</span>
                    <time>{formatDate(item.created_at)}</time>
                    <small>#{item.id}</small>
                  </div>
                  <h3>{item.summary}</h3>
                  {detailText(item.details) && <p>{detailText(item.details)}</p>}
                  {item.entity_id && <small className="auditEntity">{item.entity_type || 'registro'} ID {item.entity_id}</small>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="auditNote">
        <span>ℹ</span>
        <p>O histórico começa a ser preenchido após a preparação da auditoria. Registros antigos do acervo não recebem datas retroativas para evitar atribuir informações que não existiam originalmente.</p>
      </section>
    </main>
  );
}
