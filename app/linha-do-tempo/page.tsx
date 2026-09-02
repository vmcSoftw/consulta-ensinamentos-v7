"use client";

import { FormEvent, useState } from "react";
import styles from "./timeline.module.css";

type TimelineRecord = {
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

type TimelineYear = {
  year: string;
  count: number;
  records: TimelineRecord[];
};

type TimelineResponse = {
  query: string;
  total: number;
  years: TimelineYear[];
  firstYear?: number | null;
  lastYear?: number | null;
  expandedTerms?: string[];
  limited?: boolean;
  error?: string;
};

type TopicDetail = {
  id?: string | number;
  title?: string;
  topic_number?: string | number | null;
  year?: number | null;
  source_type?: string | null;
  page_start?: number | null;
  page_end?: number | null;
  category?: string | null;
  source_title_full?: string | null;
  content?: string | null;
};

const EXAMPLES = ["batismo", "casamento", "ministério", "oração", "mocidade", "Santa Ceia"];

export default function LinhaDoTempoPage() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [topicLoading, setTopicLoading] = useState(false);

  async function search(term = query) {
    const q = term.trim();
    if (q.length < 2) return;

    setLoading(true);
    setError("");
    setTopic(null);

    try {
      const response = await fetch(`/api/timeline?q=${encodeURIComponent(q)}`);
      const json = (await response.json()) as TimelineResponse;

      if (!response.ok) throw new Error(json.error || "Falha na consulta.");

      setQuery(q);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível consultar o acervo.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await search();
  }

  async function openTopic(id: string | number) {
    setTopicLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/topic/${id}`);
      const json = await response.json();

      if (!response.ok) throw new Error(json.error || "Não foi possível abrir o tópico.");

      setTopic(json);
      setTimeout(() => {
        document.getElementById("timeline-topic-detail")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o tópico.");
    } finally {
      setTopicLoading(false);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <a className={styles.backLink} href="/">← Voltar à consulta</a>
          <span className={styles.badge}>Acervo histórico</span>
        </div>

        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Linha do Tempo dos Ensinamentos</span>
          <h1>Acompanhe um assunto ao longo dos anos.</h1>
          <p>
            Localize registros documentais sobre o mesmo tema e compare quando,
            onde e em quais documentos ele aparece.
          </p>
        </div>

        <form className={styles.search} onSubmit={submit}>
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex.: batismo, casamento, ministério..."
            aria-label="Assunto para a linha do tempo"
          />
          <button disabled={loading || query.trim().length < 2}>
            {loading ? "Montando…" : "Montar linha do tempo"}
          </button>
        </form>

        <div className={styles.examples}>
          <span>Exemplos:</span>
          {EXAMPLES.map((item) => (
            <button key={item} type="button" onClick={() => search(item)}>
              {item}
            </button>
          ))}
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      {data && (
        <section className={styles.results}>
          <div className={styles.summary}>
            <div>
              <span className={styles.eyebrow}>Assunto pesquisado</span>
              <h2>{data.query}</h2>
              <p>
                {data.total.toLocaleString("pt-BR")} registro(s) distribuído(s) em{" "}
                {data.years.length} período(s).
              </p>
            </div>

            <div className={styles.summaryStats}>
              <div>
                <strong>{data.firstYear || "—"}</strong>
                <span>primeiro registro</span>
              </div>
              <div>
                <strong>{data.lastYear || "—"}</strong>
                <span>último registro</span>
              </div>
              <div>
                <strong>{data.years.length}</strong>
                <span>anos/períodos</span>
              </div>
            </div>
          </div>

          {data.expandedTerms && data.expandedTerms.length > 1 && (
            <div className={styles.related}>
              <b>Termos relacionados usados na busca</b>
              <div>
                {data.expandedTerms.slice(0, 12).map((term) => (
                  <span key={term}>{term}</span>
                ))}
              </div>
            </div>
          )}

          {data.limited && (
            <div className={styles.notice}>
              A linha do tempo mostra os primeiros 300 registros mais relacionados.
            </div>
          )}

          {data.total === 0 ? (
            <div className={styles.empty}>
              <h3>Nenhum registro encontrado</h3>
              <p>Tente um termo mais curto ou uma expressão usada nos documentos.</p>
            </div>
          ) : (
            <div className={styles.timeline}>
              {data.years.map((group) => (
                <section className={styles.yearGroup} key={group.year}>
                  <div className={styles.yearRail}>
                    <span className={styles.dot} />
                    <div className={styles.yearLabel}>
                      <strong>{group.year}</strong>
                      <span>
                        {group.count} registro{group.count === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <div className={styles.cards}>
                    {group.records.map((record) => (
                      <button
                        type="button"
                        className={styles.card}
                        key={String(record.id)}
                        onClick={() => openTopic(record.id)}
                        disabled={topicLoading}
                      >
                        <div className={styles.cardTop}>
                          <span>{record.source_type || "Documento"}</span>
                          {record.page_start && <span>Pág. {record.page_start}</span>}
                        </div>

                        <h3>
                          {record.topic_number ? `${record.topic_number}. ` : ""}
                          {record.title || "Tópico"}
                        </h3>

                        {record.source_title_full && (
                          <strong className={styles.source}>{record.source_title_full}</strong>
                        )}

                        {record.excerpt && <p>{record.excerpt}</p>}

                        <div className={styles.cardFooter}>
                          <span>{record.category || "Registro documental"}</span>
                          <b>Visualizar tópico completo →</b>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      )}

      {topic && (
        <section id="timeline-topic-detail" className={styles.detail}>
          <div className={styles.detailTop}>
            <div>
              <span className={styles.eyebrow}>Tópico completo</span>
              <h2>
                {topic.topic_number ? `${topic.topic_number}. ` : ""}
                {topic.title || "Tópico"}
              </h2>
            </div>
            <button type="button" onClick={() => setTopic(null)}>Fechar</button>
          </div>

          <div className={styles.facts}>
            <div><span>Ano</span><strong>{topic.year || "—"}</strong></div>
            <div><span>Documento</span><strong>{topic.source_type || "—"}</strong></div>
            <div><span>Página</span><strong>{topic.page_start || "—"}</strong></div>
            <div><span>Categoria</span><strong>{topic.category || "—"}</strong></div>
          </div>

          {topic.source_title_full && (
            <div className={styles.detailSource}>
              <span>Fonte documental</span>
              <strong>{topic.source_title_full}</strong>
            </div>
          )}

          <article className={styles.content}>
            {(topic.content || "Conteúdo não disponível.")
              .split(/\n{2,}/)
              .map((paragraph, index) => (
                <p key={index}>{paragraph.trim()}</p>
              ))}
          </article>

          {topic.page_start && (
            <a
              className={styles.pdfButton}
              href={`/documento.pdf#page=${topic.page_start}`}
              target="_blank"
              rel="noreferrer"
            >
              Abrir no PDF original ↗
            </a>
          )}
        </section>
      )}

      <footer className={styles.footer}>
        Ferramenta independente de consulta documental. O documento original prevalece
        como fonte de referência.
      </footer>
    </main>
  );
}
