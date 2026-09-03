"use client";

import { FormEvent, useMemo, useState } from "react";
import styles from "./comparar.module.css";

type SearchItem = {
  id: string | number;
  year?: number | null;
  source_type?: string | null;
  topic_number?: string | null;
  title?: string | null;
  page_start?: number | null;
  page_end?: number | null;
  category?: string | null;
  source_title_full?: string | null;
  excerpt?: string | null;
  match_hint?: string | null;
};

type SearchResponse = {
  items?: SearchItem[];
  total?: number;
};

type TopicDetail = SearchItem & {
  content?: string | null;
  keywords?: string[];
};

const MAX_COMPARE = 3;

export default function CompararPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [selected, setSelected] = useState<TopicDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | number | null>(null);
  const [error, setError] = useState("");

  const selectedIds = useMemo(
    () => new Set(selected.map((item) => String(item.id))),
    [selected]
  );

  async function search(event?: FormEvent) {
    event?.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        q,
        sort: "relevance",
        limit: "40",
        offset: "0",
      });

      const response = await fetch(`/api/search?${params.toString()}`);
      const data = (await response.json()) as SearchResponse;

      if (!response.ok) throw new Error("Não foi possível pesquisar o acervo.");

      setResults(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na consulta.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function addTopic(item: SearchItem) {
    if (selectedIds.has(String(item.id))) return;
    if (selected.length >= MAX_COMPARE) {
      setError(`Compare no máximo ${MAX_COMPARE} tópicos por vez.`);
      return;
    }

    setOpeningId(item.id);
    setError("");

    try {
      const response = await fetch(`/api/topic/${item.id}`);
      const detail = (await response.json()) as TopicDetail;

      if (!response.ok) throw new Error("Não foi possível abrir o tópico.");

      setSelected((current) => [...current, detail]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao abrir o tópico.");
    } finally {
      setOpeningId(null);
    }
  }

  function removeTopic(id: string | number) {
    setSelected((current) => current.filter((item) => String(item.id) !== String(id)));
  }

  function clearComparison() {
    setSelected([]);
    setError("");
  }

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.topbar}>
          <a href="/" className={styles.backLink}>← Voltar à consulta</a>
          <span className={styles.badge}>Comparação documental</span>
        </div>

        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Comparar Ensinamentos</span>
          <h1>Veja registros lado a lado.</h1>
          <p>
            Selecione até três tópicos do acervo para comparar ano, fonte, página,
            categoria e conteúdo, sem alterar ou interpretar o texto documental.
          </p>
        </div>

        <form className={styles.search} onSubmit={search}>
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquise um assunto para comparar..."
            aria-label="Assunto para comparação"
          />
          <button disabled={loading || query.trim().length < 2}>
            {loading ? "Pesquisando…" : "Pesquisar tópicos"}
          </button>
        </form>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.workspace}>
        <aside className={styles.resultsPane}>
          <div className={styles.paneHead}>
            <div>
              <span className={styles.eyebrow}>Resultados</span>
              <h2>Escolha os tópicos</h2>
            </div>
            <span>{selected.length}/{MAX_COMPARE} selecionados</span>
          </div>

          {!results.length && !loading ? (
            <div className={styles.empty}>
              <h3>Pesquise um assunto</h3>
              <p>Ex.: batismo, casamento, ministério, oração ou mocidade.</p>
            </div>
          ) : (
            <div className={styles.resultList}>
              {results.map((item) => {
                const isSelected = selectedIds.has(String(item.id));

                return (
                  <button
                    type="button"
                    key={String(item.id)}
                    className={`${styles.resultCard} ${isSelected ? styles.selected : ""}`}
                    onClick={() => addTopic(item)}
                    disabled={isSelected || openingId === item.id}
                  >
                    <div className={styles.resultTop}>
                      <span>{item.year || "—"}</span>
                      <span>{item.source_type || "Documento"}</span>
                      {item.page_start && <span>Pág. {item.page_start}</span>}
                    </div>

                    <h3>
                      {item.topic_number ? `${item.topic_number}. ` : ""}
                      {item.title || "Tópico"}
                    </h3>

                    {item.source_title_full && (
                      <strong className={styles.source}>{item.source_title_full}</strong>
                    )}

                    {item.excerpt && <p>{item.excerpt}</p>}

                    <div className={styles.resultFooter}>
                      <span>{item.match_hint || item.category || "Registro documental"}</span>
                      <b>
                        {isSelected
                          ? "Selecionado"
                          : openingId === item.id
                            ? "Abrindo…"
                            : "Adicionar à comparação →"}
                      </b>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className={styles.comparePane}>
          <div className={styles.paneHead}>
            <div>
              <span className={styles.eyebrow}>Comparação</span>
              <h2>Tópicos selecionados</h2>
            </div>
            {selected.length > 0 && (
              <button type="button" className={styles.clearButton} onClick={clearComparison}>
                Limpar
              </button>
            )}
          </div>

          {!selected.length ? (
            <div className={styles.compareEmpty}>
              <div className={styles.compareIcon}>≡</div>
              <h3>Nenhum tópico selecionado</h3>
              <p>Escolha dois ou três registros para iniciar a comparação documental.</p>
            </div>
          ) : (
            <>
              <div
                className={styles.comparisonGrid}
                style={{ gridTemplateColumns: `repeat(${selected.length}, minmax(260px, 1fr))` }}
              >
                {selected.map((item) => (
                  <article className={styles.compareCard} key={String(item.id)}>
                    <div className={styles.compareCardTop}>
                      <span className={styles.yearBadge}>{item.year || "—"}</span>
                      <button
                        type="button"
                        onClick={() => removeTopic(item.id)}
                        aria-label="Remover tópico da comparação"
                      >
                        ×
                      </button>
                    </div>

                    <span className={styles.topicType}>{item.source_type || "Documento"}</span>

                    <h3>
                      {item.topic_number ? `${item.topic_number}. ` : ""}
                      {item.title || "Tópico"}
                    </h3>

                    <div className={styles.metaGrid}>
                      <div>
                        <span>Ano</span>
                        <strong>{item.year || "—"}</strong>
                      </div>
                      <div>
                        <span>Página</span>
                        <strong>{item.page_start || "—"}</strong>
                      </div>
                      <div>
                        <span>Categoria</span>
                        <strong>{item.category || "—"}</strong>
                      </div>
                      <div>
                        <span>Tipo</span>
                        <strong>{item.source_type || "—"}</strong>
                      </div>
                    </div>

                    {item.source_title_full && (
                      <div className={styles.sourceBox}>
                        <span>Fonte documental</span>
                        <strong>{item.source_title_full}</strong>
                      </div>
                    )}

                    <div className={styles.contentBox}>
                      <span className={styles.contentLabel}>Conteúdo</span>
                      <div className={styles.content}>
                        {(item.content || item.excerpt || "Conteúdo não disponível.")
                          .split(/\n{2,}/)
                          .map((paragraph, index) => (
                            <p key={index}>{paragraph.trim()}</p>
                          ))}
                      </div>
                    </div>

                    {item.page_start && (
                      <a
                        className={styles.pdfLink}
                        href={`/documento.pdf#page=${item.page_start}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir no PDF original ↗
                      </a>
                    )}
                  </article>
                ))}
              </div>

              {selected.length === 1 && (
                <div className={styles.hint}>
                  Selecione pelo menos mais um tópico para comparar lado a lado.
                </div>
              )}

              {selected.length >= 2 && (
                <div className={styles.note}>
                  <strong>Leitura comparativa</strong>
                  <p>
                    Esta tela apenas organiza registros documentais lado a lado. Diferenças
                    de redação, época ou contexto devem ser avaliadas consultando as fontes originais.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </section>

      <footer className={styles.footer}>
        Ferramenta independente de consulta documental. O documento original prevalece
        como fonte de referência.
      </footer>
    </main>
  );
}
