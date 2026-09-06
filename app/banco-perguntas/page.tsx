"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./banco-perguntas.module.css";

type CatalogSubcategory = {
  id: number;
  slug: string;
  name: string;
  count: number;
};

type CatalogCategory = {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  count: number;
  subcategories: CatalogSubcategory[];
};

type CatalogItem = {
  id: number;
  question: string;
  shortAnswer: string;
  sourceCount: number;
  categoryId?: number | null;
  categorySlug?: string | null;
  categoryName?: string | null;
  subcategoryId?: number | null;
  subcategorySlug?: string | null;
  subcategoryName?: string | null;
};

type QuestionSource = {
  id: number;
  topicId?: number | null;
  sourceTitle?: string | null;
  sourceType?: string | null;
  sourceYear?: number | null;
  pageStart?: number | null;
  citationText?: string | null;
};

type QuestionDetail = {
  id: number;
  question: string;
  shortAnswer: string;
  fullAnswer: string;
  defaultAnswerMode?: "short" | "full";
  sources?: QuestionSource[];
  aliases?: string[];
};

type CatalogResponse = {
  query: string;
  total: number;
  publishedTotal: number;
  items: CatalogItem[];
  categories: CatalogCategory[];
};

export default function BancoPerguntasPage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [publishedTotal, setPublishedTotal] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSubcategory, setSelectedSubcategory] = useState("all");
  const [detail, setDetail] = useState<QuestionDetail | null>(null);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [answerMode, setAnswerMode] = useState<"short" | "full">("short");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeCategory = useMemo(
    () => categories.find((category) => category.slug === selectedCategory) ?? null,
    [categories, selectedCategory],
  );

  const totalPublished = publishedTotal;

  async function loadCatalog(
    nextQuery = query,
    category = selectedCategory,
    subcategory = selectedSubcategory,
  ) {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      const cleaned = nextQuery.trim();
      if (cleaned) params.set("q", cleaned);
      if (category !== "all") params.set("category", category);
      if (subcategory !== "all") params.set("subcategory", subcategory);

      const response = await fetch(`/api/question-bank/categories?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as CatalogResponse & { error?: string };

      if (!response.ok) throw new Error(data.error || "Falha na consulta.");

      setItems(data.items || []);
      setCategories(data.categories || []);
      setPublishedTotal(Number(data.publishedTotal || 0));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha na consulta.");
    } finally {
      setLoading(false);
    }
  }

  async function openQuestion(item: CatalogItem) {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/question-bank?id=${item.id}`, { cache: "no-store" });
      const data = (await response.json()) as QuestionDetail & { error?: string };

      if (!response.ok) throw new Error(data.error || "Falha ao abrir.");

      setSelectedItem(item);
      setDetail(data);
      setAnswerMode(data.defaultAnswerMode === "full" ? "full" : "short");
      void fetch("/api/usage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "question_open", entityType: "question", entityId: item.id, query: item.question, sourcePage: "/banco-perguntas" }) }).catch(() => {});
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao abrir.");
    } finally {
      setLoading(false);
    }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    void loadCatalog();
  }

  function chooseCategory(slug: string) {
    setSelectedCategory(slug);
    setSelectedSubcategory("all");
    setDetail(null);
    setSelectedItem(null);
    void loadCatalog(query, slug, "all");
  }

  function chooseSubcategory(slug: string) {
    setSelectedSubcategory(slug);
    setDetail(null);
    setSelectedItem(null);
    void loadCatalog(query, selectedCategory, slug);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("q") || "";
    const initialCategory = params.get("category") || "all";
    const initialSubcategory = params.get("subcategory") || "all";

    setQuery(initialQuery);
    setSelectedCategory(initialCategory);
    setSelectedSubcategory(initialSubcategory);
    void loadCatalog(initialQuery, initialCategory, initialSubcategory);
    // Executa apenas na montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (detail) {
    const categoryName = selectedItem?.categoryName;
    const subcategoryName = selectedItem?.subcategoryName;

    return (
      <main className={styles.shell}>
        <header className={styles.hero}>
          <button
            type="button"
            className={styles.back}
            onClick={() => {
              setDetail(null);
              setSelectedItem(null);
            }}
          >
            ← Voltar ao Banco
          </button>

          <span className={styles.eyebrow}>Banco de Perguntas</span>

          {(categoryName || subcategoryName) && (
            <div className={styles.detailBadges}>
              {categoryName && <span>{categoryName}</span>}
              {subcategoryName && <span>{subcategoryName}</span>}
            </div>
          )}

          <h1>{detail.question}</h1>
          <p>Resposta revisada e aprovada para reutilização pelo sistema.</p>
        </header>

        <section className={styles.panel}>
          <div className={styles.tabs}>
            <button
              type="button"
              className={answerMode === "short" ? styles.active : ""}
              onClick={() => setAnswerMode("short")}
            >
              Resposta simplificada
            </button>
            <button
              type="button"
              className={answerMode === "full" ? styles.active : ""}
              onClick={() => setAnswerMode("full")}
            >
              Resposta ampla
            </button>
          </div>

          <article className={styles.answer}>
            {(answerMode === "short" ? detail.shortAnswer : detail.fullAnswer)
              .split(/\n{2,}/)
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
          </article>

          {!!detail.sources?.length && (
            <section className={styles.sources}>
              <span className={styles.eyebrow}>Fontes cadastradas</span>
              <h2>Referências da resposta</h2>
              {detail.sources.map((source) => (
                <article key={source.id}>
                  <strong>{source.sourceTitle || source.sourceType || "Fonte documental"}</strong>
                  <span>
                    {source.sourceYear || "s/ano"}
                    {source.sourceType ? ` · ${source.sourceType}` : ""}
                    {source.pageStart ? ` · pág. ${source.pageStart}` : ""}
                  </span>
                  {source.citationText && <p>{source.citationText}</p>}
                  {source.topicId && (
                    <a href={`/?topic=${source.topicId}`}>Visualizar tópico relacionado →</a>
                  )}
                </article>
              ))}
            </section>
          )}

          {!!detail.aliases?.length && (
            <div className={styles.aliases}>
              <b>Perguntas semelhantes reconhecidas:</b>
              <div>
                {detail.aliases.map((alias) => (
                  <span key={alias}>{alias}</span>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.top}>
          <a href="/">← Voltar à consulta</a>
          <span>Base de conhecimento</span>
        </div>

        <span className={styles.eyebrow}>Banco de Perguntas</span>
        <h1>Perguntas estudadas, respostas reutilizáveis.</h1>
        <p>
          Navegue pelos principais assuntos, pesquise perguntas já revisadas e consulte a
          resposta simplificada ou a resposta ampla.
        </p>

        <form className={styles.search} onSubmit={submitSearch}>
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Digite uma pergunta ou assunto..."
          />
          <button disabled={loading}>{loading ? "Consultando…" : "Pesquisar"}</button>
        </form>
      </header>

      <section className={styles.categoryPanel}>
        <div className={styles.categoryTitle}>
          <div>
            <span className={styles.eyebrow}>Assuntos principais</span>
            <h2>Explore por categoria</h2>
          </div>
          <span>{totalPublished} pergunta(s) publicada(s)</span>
        </div>

        <div className={styles.categoryScroller}>
          <button
            type="button"
            className={`${styles.categoryChip} ${
              selectedCategory === "all" ? styles.categoryActive : ""
            }`}
            onClick={() => chooseCategory("all")}
          >
            <span>Todas</span>
            <b>{totalPublished}</b>
          </button>

          {categories.map((category) => (
            <button
              type="button"
              key={category.id}
              className={`${styles.categoryChip} ${
                selectedCategory === category.slug ? styles.categoryActive : ""
              }`}
              onClick={() => chooseCategory(category.slug)}
            >
              <span>{category.name}</span>
              <b>{category.count}</b>
            </button>
          ))}
        </div>

        {activeCategory && activeCategory.subcategories.length > 0 && (
          <div className={styles.subcategoryArea}>
            <span>Subcategorias de {activeCategory.name}</span>
            <div className={styles.subcategoryScroller}>
              <button
                type="button"
                className={`${styles.subcategoryChip} ${
                  selectedSubcategory === "all" ? styles.subcategoryActive : ""
                }`}
                onClick={() => chooseSubcategory("all")}
              >
                Todas
              </button>

              {activeCategory.subcategories.map((subcategory) => (
                <button
                  type="button"
                  key={subcategory.id}
                  className={`${styles.subcategoryChip} ${
                    selectedSubcategory === subcategory.slug ? styles.subcategoryActive : ""
                  }`}
                  onClick={() => chooseSubcategory(subcategory.slug)}
                >
                  {subcategory.name} <b>{subcategory.count}</b>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.panel}>
        <div className={styles.head}>
          <div>
            <span className={styles.eyebrow}>Resultados</span>
            <h2>
              {query.trim()
                ? `Perguntas relacionadas a “${query.trim()}”`
                : activeCategory
                  ? activeCategory.name
                  : "Perguntas publicadas"}
            </h2>
          </div>
          <span>{items.length} encontrada(s)</span>
        </div>

        {loading || items.length ? (
          <div className={styles.list}>
            {items.map((item) => (
              <button
                type="button"
                className={styles.card}
                onClick={() => void openQuestion(item)}
                key={item.id}
              >
                <div>
                  <span>Resposta aprovada</span>
                  <span>{item.sourceCount} fonte(s)</span><span>Força documental: {item.sourceCount >= 3 ? "forte" : item.sourceCount === 2 ? "moderada" : item.sourceCount === 1 ? "limitada" : "sem fonte cadastrada"}</span>
                </div>

                <div className={styles.cardBadges}>
                  {item.categoryName && <span>{item.categoryName}</span>}
                  {item.subcategoryName && <span>{item.subcategoryName}</span>}
                </div>

                <h3>{item.question}</h3>
                <p>{item.shortAnswer}</p>
                <b>Abrir resposta simplificada/ampla →</b>
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <h3>Nenhuma pergunta encontrada</h3>
            <p>Tente outra forma de escrever, outra categoria ou faça a pergunta na área Perguntar.</p>
          </div>
        )}
      </section>
    </main>
  );
}
