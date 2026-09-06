"use client";

import { FormEvent, useMemo, useState } from "react";
import styles from "./concordancias.module.css";

type BookCount = {
  order: number;
  name: string;
  abbreviation: string;
  testament: string;
  total: number;
};

type Verse = {
  id: number;
  bookOrder: number;
  book: string;
  abbreviation: string;
  testament: string;
  chapter: number;
  verse: number;
  text: string;
  pdfPage: number | null;
  reference: string;
};

type ConcordanceResponse = {
  query: string;
  normalized: string;
  mode: "exact" | "all";
  testament: string;
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  books: BookCount[];
  items: Verse[];
  error?: string;
};

export default function ConcordanciasPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"exact" | "all">("exact");
  const [testament, setTestament] = useState("all");
  const [selectedBook, setSelectedBook] = useState(0);
  const [result, setResult] = useState<ConcordanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeBookName = useMemo(
    () => result?.books.find((book) => book.order === selectedBook)?.name || "",
    [result?.books, selectedBook],
  );

  async function search(nextBook = selectedBook, append = false) {
    const cleaned = query.trim();
    if (!cleaned) return;

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        q: cleaned,
        mode,
        testament,
        limit: "120",
        book: String(nextBook || 0),
        offset: append ? String(result?.items.length || 0) : "0",
      });

      const response = await fetch(`/api/bible/concordance?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as ConcordanceResponse;

      if (!response.ok) throw new Error(data.error || "Falha na consulta.");

      if (append && result) {
        setResult({
          ...data,
          items: [...result.items, ...data.items],
        });
      } else {
        setResult(data);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar.");
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSelectedBook(0);
    void search(0, false);
  }

  function quick(term: string) {
    setQuery(term);
    setSelectedBook(0);
    setTimeout(() => {
      const params = new URLSearchParams({
        q: term,
        mode,
        testament,
        limit: "120",
        book: "0",
        offset: "0",
      });
      setLoading(true);
      setError("");
      fetch(`/api/bible/concordance?${params.toString()}`, { cache: "no-store" })
        .then(async (response) => {
          const data = (await response.json()) as ConcordanceResponse;
          if (!response.ok) throw new Error(data.error || "Falha na consulta.");
          setResult(data);
        })
        .catch((cause) =>
          setError(cause instanceof Error ? cause.message : "Não foi possível consultar."),
        )
        .finally(() => setLoading(false));
    }, 0);
  }

  function chooseBook(order: number) {
    setSelectedBook(order);
    void search(order, false);
  }

  async function copyVerse(verse: Verse) {
    try {
      await navigator.clipboard.writeText(
        `${verse.reference} — ${verse.text} (ARC 2009)`,
      );
    } catch {}
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <a href="/" className={styles.back}>← Voltar ao Consulta de Ensinamentos</a>
        <a href="/biblia/referencias" className={styles.back}>Central de Referências Bíblicas →</a>
        <div className={styles.kicker}>Biblioteca Bíblica · ARC 2009</div>
        <h1>Concordâncias e Referências Bíblicas</h1>
        <p>
          Localize onde uma palavra ou expressão aparece na Bíblia, veja a distribuição
          por livro e abra cada referência diretamente no texto bíblico.
        </p>
      </header>

      <nav className={styles.tabs} aria-label="Recursos bíblicos">
        <a href="/"><span>📖</span><b>Bíblia Sagrada</b></a>
        <a href="/"><span>ABC</span><b>Dicionário Bíblico</b></a>
        <span className={styles.activeTab}><span>⇄</span><b>Concordâncias e Referências</b></span>
      </nav>

      <section className={styles.searchCard}>
        <form onSubmit={submit} className={styles.searchForm}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex.: fé, amor, batismo, graça, Espírito Santo..."
            aria-label="Palavra ou expressão"
          />
          <button disabled={loading || !query.trim()}>
            {loading ? "Consultando…" : "Pesquisar"}
          </button>
        </form>

        <div className={styles.options}>
          <label>
            <span>Tipo de concordância</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as "exact" | "all")}
            >
              <option value="exact">Palavra ou expressão exata</option>
              <option value="all">Todos os termos no mesmo versículo</option>
            </select>
          </label>

          <label>
            <span>Testamento</span>
            <select value={testament} onChange={(event) => setTestament(event.target.value)}>
              <option value="all">Toda a Bíblia</option>
              <option value="AT">Antigo Testamento</option>
              <option value="NT">Novo Testamento</option>
            </select>
          </label>
        </div>

        <div className={styles.examples}>
          <span>Exemplos:</span>
          {["fé", "amor", "batismo", "graça", "oração", "Espírito Santo"].map((term) => (
            <button type="button" key={term} onClick={() => quick(term)}>
              {term}
            </button>
          ))}
        </div>
      </section>

      {error && <div className={styles.error}>{error}</div>}

      {result && (
        <>
          <section className={styles.summary}>
            <div>
              <strong>{result.total.toLocaleString("pt-BR")}</strong>
              <span>versículo(s) encontrado(s)</span>
            </div>
            <div>
              <strong>{result.books.length}</strong>
              <span>livro(s) com ocorrência</span>
            </div>
            <div>
              <strong>{result.mode === "exact" ? "Literal" : "Termos"}</strong>
              <span>modo de concordância</span>
            </div>
          </section>

          <section className={styles.bookMap}>
            <div className={styles.sectionTitle}>
              <div>
                <span>Mapa de ocorrências</span>
                <h2>Distribuição por livro</h2>
              </div>
              {selectedBook > 0 && (
                <button type="button" onClick={() => chooseBook(0)}>
                  Limpar filtro de livro
                </button>
              )}
            </div>

            <div className={styles.bookChips}>
              {result.books.map((book) => (
                <button
                  type="button"
                  key={book.order}
                  className={selectedBook === book.order ? styles.selectedBook : ""}
                  onClick={() => chooseBook(book.order)}
                >
                  <b>{book.name}</b>
                  <span>{book.total}</span>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.results}>
            <div className={styles.sectionTitle}>
              <div>
                <span>Referências bíblicas</span>
                <h2>
                  {activeBookName
                    ? `${activeBookName} · ${result.items.length} referência(s) exibida(s)`
                    : `${result.items.length} referência(s) exibida(s)`}
                </h2>
              </div>
              <small>Almeida Revista e Corrigida · ARC 2009</small>
            </div>

            {result.items.length ? (
              <div className={styles.list}>
                {result.items.map((verse) => (
                  <article key={verse.id} className={styles.verseCard}>
                    <div className={styles.reference}>
                      <span>📖</span>
                      <strong>{verse.reference}</strong>
                      <small>{verse.testament}</small>
                    </div>
                    <p>{verse.text}</p>
                    <div className={styles.actions}>
                      <button type="button" onClick={() => copyVerse(verse)}>
                        Copiar referência
                      </button>
                      {verse.pdfPage && (
                        <a
                          href={`/biblia-arc.pdf#page=${verse.pdfPage}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir na Bíblia em PDF ↗
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                <b>Nenhuma ocorrência encontrada.</b>
                <p>Tente outra palavra, expressão ou altere o modo de concordância.</p>
              </div>
            )}

            {result.hasMore && (
              <button
                type="button"
                className={styles.more}
                onClick={() => void search(selectedBook, true)}
                disabled={loading}
              >
                {loading ? "Carregando…" : "Carregar mais referências"}
              </button>
            )}
          </section>
        </>
      )}

      {!result && !loading && (
        <section className={styles.welcome}>
          <div>⇄</div>
          <h2>Encontre todas as ocorrências de um termo</h2>
          <p>
            A concordância é gerada diretamente a partir dos 31.105 versículos da Bíblia
            ARC 2009 cadastrados no sistema. Nenhuma referência é criada artificialmente.
          </p>
        </section>
      )}
    </main>
  );
}
