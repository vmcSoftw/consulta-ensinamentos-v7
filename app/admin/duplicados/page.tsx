'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type DuplicateItem = {
  id: number;
  sourceSectionId: number;
  topicNumber: string | null;
  title: string;
  pageStart: number | null;
  pageEnd: number | null;
  category: string | null;
  year: number | null;
  sourceType: string;
  sourceTitle: string;
  contentPreview?: string;
  recommendedKeep: boolean;
};

type DuplicateGroup = {
  key: string;
  copies: number;
  keepId: number;
  removable: number;
  items: DuplicateItem[];
};

type ReviewGroup = {
  key: string;
  copies: number;
  reasons: string[];
  items: DuplicateItem[];
};

type DuplicateStats = {
  groups: number;
  duplicateRecords: number;
  removable: number;
  reviewGroups: number;
  reviewRecords: number;
};

const emptyStats: DuplicateStats = { groups: 0, duplicateRecords: 0, removable: 0, reviewGroups: 0, reviewRecords: 0 };

export default function AdminDuplicatesPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [reviewGroups, setReviewGroups] = useState<ReviewGroup[]>([]);
  const [stats, setStats] = useState<DuplicateStats>(emptyStats);
  const [rule, setRule] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/admin/session', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!d.authenticated) router.replace('/admin');
        else setAuthChecked(true);
      })
      .catch(() => router.replace('/admin'));
  }, [router]);

  async function load(selectDuplicates = false) {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/admin/duplicates', { cache: 'no-store' });
      const d = await r.json();
      if (r.status === 401) {
        router.replace('/admin');
        return;
      }
      if (!r.ok) throw new Error(d.error || 'Falha ao analisar duplicados.');
      const nextGroups: DuplicateGroup[] = Array.isArray(d.exactGroups) ? d.exactGroups : (Array.isArray(d.groups) ? d.groups : []);
      const nextReview: ReviewGroup[] = Array.isArray(d.reviewGroups) ? d.reviewGroups : [];
      setGroups(nextGroups);
      setReviewGroups(nextReview);
      setStats({ ...emptyStats, ...(d.stats || {}) });
      setRule(String(d.rule || ''));
      setSelected(selectDuplicates ? new Set(nextGroups.flatMap(group => group.items.filter(item => !item.recommendedKeep).map(item => item.id))) : new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao analisar duplicados.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authChecked) load(false);
  }, [authChecked]);

  const selectedCount = selected.size;
  const selectedGroups = useMemo(() => groups.filter(group => group.items.some(item => selected.has(item.id))).length, [groups, selected]);

  function toggle(id: number) {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setMessage('');
  }

  function selectAllRemovable() {
    setSelected(new Set(groups.flatMap(group => group.items.filter(item => !item.recommendedKeep).map(item => item.id))));
    setMessage('');
  }

  async function deleteSelected() {
    if (!selectedCount || deleting) return;
    const ok = window.confirm(`Excluir definitivamente ${selectedCount} registro(s) classificado(s) como duplicado exato?\n\nO registro principal de cada grupo será preservado. Possíveis duplicados com metadados divergentes não entram nesta exclusão.`);
    if (!ok) return;

    setDeleting(true);
    setError('');
    setMessage('');
    try {
      const r = await fetch('/api/admin/duplicates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic_ids: Array.from(selected) })
      });
      const d = await r.json();
      if (r.status === 401) {
        router.replace('/admin');
        return;
      }
      if (!r.ok) throw new Error(d.error || 'Falha ao excluir duplicados.');
      setMessage(`${Number(d.deleted || 0).toLocaleString('pt-BR')} registro(s) duplicado(s) exato(s) excluído(s) com sucesso.`);
      await load(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir duplicados.');
    } finally {
      setDeleting(false);
    }
  }

  if (!authChecked) {
    return <main className="shell adminLoginShell"><section className="adminLoginCard"><div className="loginLock">⌛</div><h1>Verificando acesso</h1><p>Aguarde um instante.</p></section></main>;
  }

  return (
    <main className="shell duplicateAdminShell">
      <div className="adminTop">
        <div>
          <div className="modeBadge">Administração autenticada</div>
          <h1>Limpeza de dados duplicados</h1>
          <p>O sistema separa exclusões seguras de casos que precisam de revisão humana.</p>
        </div>
        <div className="adminTopActions">
          <button className="outlineButton" type="button" onClick={() => load(false)} disabled={loading}>{loading ? 'Analisando…' : '↻ Analisar novamente'}</button>
          <Link className="adminLink" href="/admin/historico">◷ Histórico</Link>
          <Link className="adminLink" href="/admin">← Voltar à administração</Link>
        </div>
      </div>

      <section className="duplicateSafetyNotice">
        <span>🛡</span>
        <div><b>Critério reforçado de segurança</b><p>{rule || 'Somente duplicações realmente exatas podem ser selecionadas para exclusão.'}</p></div>
      </section>

      <section className="duplicateStatsGrid duplicateStatsGridFive">
        <article><span>Exatos</span><strong>{stats.groups.toLocaleString('pt-BR')}</strong><small>grupos seguros</small></article>
        <article><span>Removíveis</span><strong>{stats.removable.toLocaleString('pt-BR')}</strong><small>cópias extras</small></article>
        <article><span>Para revisão</span><strong>{stats.reviewGroups.toLocaleString('pt-BR')}</strong><small>grupos possíveis</small></article>
        <article><span>Registros em revisão</span><strong>{stats.reviewRecords.toLocaleString('pt-BR')}</strong><small>não são excluídos</small></article>
        <article><span>Selecionados</span><strong>{selectedCount.toLocaleString('pt-BR')}</strong><small>em {selectedGroups} grupo(s)</small></article>
      </section>

      <section className="duplicatePanel">
        <div className="duplicateToolbar">
          <div><span className="sectionEyebrow">Exclusão permitida</span><h2>Duplicados exatos</h2><p className="duplicateToolbarText">Todos os metadados relevantes e o conteúdo coincidem.</p></div>
          <div className="duplicateToolbarActions">
            <button type="button" onClick={selectAllRemovable} disabled={loading || !stats.removable}>Selecionar todas as cópias extras</button>
            <button type="button" onClick={() => setSelected(new Set())} disabled={!selectedCount}>Limpar seleção</button>
            <button className="dangerDeleteButton" type="button" onClick={deleteSelected} disabled={!selectedCount || deleting}>{deleting ? 'Excluindo…' : `Excluir ${selectedCount || ''} duplicado(s)`}</button>
          </div>
        </div>

        {error && <div className="errorBox">{error}</div>}
        {message && <div className="successBox duplicateSuccess">✓ {message}</div>}
        {!error && loading && <div className="duplicateEmpty">Analisando o acervo…</div>}
        {!error && !loading && groups.length === 0 && <div className="duplicateEmpty"><b>✓ Nenhum duplicado exato encontrado.</b><span>Não há registros liberados para exclusão automática.</span></div>}

        {!error && !loading && groups.length > 0 && (
          <div className="duplicateGroupList">
            {groups.map((group, groupIndex) => (
              <article className="duplicateGroup" key={group.key}>
                <div className="duplicateGroupHead">
                  <div><span>Grupo exato {groupIndex + 1}</span><strong>{group.copies} cópias idênticas</strong></div>
                  <small>{group.removable} removível(is)</small>
                </div>
                <div className="duplicateItems">
                  {group.items.map(item => (
                    <label key={item.id} className={`duplicateItem ${item.recommendedKeep ? 'keep' : ''} ${selected.has(item.id) ? 'selected' : ''}`}>
                      <div className="duplicateChoice">
                        {item.recommendedKeep ? <span className="keepBadge">✓ Preservar</span> : <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />}
                        <span className="recordId">ID {item.id}</span>
                      </div>
                      <div className="duplicateItemBody">
                        <h3>{item.title || 'Tópico sem título'}</h3>
                        <p>{item.sourceTitle}</p>
                        <div className="duplicateMeta">
                          {item.year && <span>{item.year}</span>}
                          {item.sourceType && <span>{item.sourceType}</span>}
                          {item.topicNumber && <span>Tópico {item.topicNumber}</span>}
                          {item.pageStart && <span>Pág. {item.pageStart}{item.pageEnd && item.pageEnd !== item.pageStart ? `–${item.pageEnd}` : ''}</span>}
                          {item.category && <span>{item.category}</span>}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="duplicatePanel duplicateReviewPanel">
        <div className="duplicateToolbar duplicateReviewToolbar">
          <div><span className="sectionEyebrow">Sem exclusão automática</span><h2>Possíveis duplicados para revisão</h2><p className="duplicateToolbarText">O texto parece equivalente, mas existe diferença de metadados. Confira antes de qualquer decisão manual.</p></div>
          <span className="reviewOnlyBadge">Revisão humana obrigatória</span>
        </div>

        {!error && loading && <div className="duplicateEmpty">Comparando metadados…</div>}
        {!error && !loading && reviewGroups.length === 0 && <div className="duplicateEmpty"><b>✓ Nenhum caso ambíguo encontrado.</b><span>Não há possíveis duplicados pendentes de revisão.</span></div>}

        {!error && !loading && reviewGroups.length > 0 && (
          <div className="duplicateGroupList">
            {reviewGroups.map((group, groupIndex) => (
              <article className="duplicateGroup possibleDuplicateGroup" key={group.key}>
                <div className="duplicateGroupHead possibleDuplicateHead">
                  <div><span>Revisão {groupIndex + 1}</span><strong>{group.copies} registros com texto equivalente</strong></div>
                  <small>Não excluir automaticamente</small>
                </div>
                <div className="reviewReasons">
                  {group.reasons.map(reason => <span key={reason}>⚠ {reason}</span>)}
                </div>
                <div className="duplicateItems">
                  {group.items.map(item => (
                    <div key={item.id} className="duplicateItem reviewDuplicateItem">
                      <div className="duplicateChoice"><span className="reviewBadge">Revisar</span><span className="recordId">ID {item.id}</span></div>
                      <div className="duplicateItemBody">
                        <h3>{item.title || 'Tópico sem título'}</h3>
                        <p>{item.sourceTitle}</p>
                        <div className="duplicateMeta">
                          {item.year && <span>{item.year}</span>}
                          {item.sourceType && <span>{item.sourceType}</span>}
                          <span className="reviewMetaStrong">Tópico {item.topicNumber || 'não informado'}</span>
                          {item.pageStart && <span>Pág. {item.pageStart}{item.pageEnd && item.pageEnd !== item.pageStart ? `–${item.pageEnd}` : ''}</span>}
                          {item.category && <span>{item.category}</span>}
                        </div>
                        {item.contentPreview && <div className="duplicateContentPreview">{item.contentPreview}{item.contentPreview.length >= 360 ? '…' : ''}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="duplicateFootNote">
        <span>ℹ</span><p>A exclusão desta tela é definitiva no Neon, mas só fica disponível para duplicados exatos. Casos com número do tópico, página, categoria ou vínculo de fonte divergentes permanecem apenas para revisão.</p>
      </section>
    </main>
  );
}
