"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./banco-perguntas-admin.module.css";

type AdminItem = {
  id: number;
  question: string;
  shortAnswer: string;
  fullAnswer: string;
  status: string;
  origin: string;
  version: number;
  sourceCount: number;
};

type ReviewItem = {
  id: number;
  question: string;
  shortAnswer: string;
  fullAnswer: string;
  createdAt: string;
};

type ImportItem = {
  id: number;
  question: string;
  shortAnswer: string;
  fullAnswer: string;
  status: string;
  selected: boolean;
  force?: boolean;
  duplicateQuestion?: string | null;
  duplicateScore?: number | null;
};

type Counts = {
  total?: number;
  approved?: number;
  review?: number;
};

type CategorySub = {
  id: number;
  slug: string;
  name: string;
  count: number;
};

type Category = {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  count: number;
  subcategories: CategorySub[];
};

type Assignment = {
  categoryId: number | null;
  subcategoryId: number | null;
  categorySlug: string | null;
  categoryName: string | null;
  subcategorySlug: string | null;
  subcategoryName: string | null;
};

type CategoryPayload = {
  categories: Category[];
  assignments: Record<string, Assignment>;
  error?: string;
};

type ClassificationEditorProps = {
  questionId: number;
  categories: Category[];
  assignment?: Assignment;
  disabled: boolean;
  onSave: (questionId: number, categoryId: number, subcategoryId: number) => Promise<void>;
};

function ClassificationEditor({
  questionId,
  categories,
  assignment,
  disabled,
  onSave,
}: ClassificationEditorProps) {
  const [categoryId, setCategoryId] = useState(
    assignment?.categoryId ? String(assignment.categoryId) : "",
  );
  const [subcategoryId, setSubcategoryId] = useState(
    assignment?.subcategoryId ? String(assignment.subcategoryId) : "",
  );

  useEffect(() => {
    setCategoryId(assignment?.categoryId ? String(assignment.categoryId) : "");
    setSubcategoryId(assignment?.subcategoryId ? String(assignment.subcategoryId) : "");
  }, [assignment?.categoryId, assignment?.subcategoryId]);

  const selectedCategory = categories.find((category) => category.id === Number(categoryId));

  return (
    <div className={styles.classification}>
      <div className={styles.classificationHead}>
        <b>Classificação</b>
        {assignment?.categoryName ? (
          <span>
            {assignment.categoryName}
            {assignment.subcategoryName ? ` · ${assignment.subcategoryName}` : ""}
          </span>
        ) : (
          <span className={styles.uncategorized}>Sem categoria</span>
        )}
      </div>

      <div className={styles.classificationRow}>
        <select
          aria-label="Categoria"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setSubcategoryId("");
          }}
        >
          <option value="">Selecione a categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Subcategoria"
          value={subcategoryId}
          disabled={!categoryId}
          onChange={(event) => setSubcategoryId(event.target.value)}
        >
          <option value="">Selecione a subcategoria</option>
          {(selectedCategory?.subcategories || []).map((subcategory) => (
            <option key={subcategory.id} value={subcategory.id}>
              {subcategory.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={disabled || !categoryId || !subcategoryId}
          onClick={() => void onSave(questionId, Number(categoryId), Number(subcategoryId))}
        >
          Salvar categoria
        </button>
      </div>
    </div>
  );
}

export default function BancoPerguntasAdminPage() {
  const [checkedSession, setCheckedSession] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [tab, setTab] = useState("bank");

  const [bankItems, setBankItems] = useState<AdminItem[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [counts, setCounts] = useState<Counts>({});

  const [categories, setCategories] = useState<Category[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  const [bankCategoryFilter, setBankCategoryFilter] = useState("all");
  const [bankSearch, setBankSearch] = useState("");

  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const [newQuestion, setNewQuestion] = useState("");
  const [newShortAnswer, setNewShortAnswer] = useState("");
  const [newFullAnswer, setNewFullAnswer] = useState("");
  const [newAliases, setNewAliases] = useState("");
  const [newStatus, setNewStatus] = useState("approved");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newSubcategoryId, setNewSubcategoryId] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [importId, setImportId] = useState<number | null>(null);
  const [importItems, setImportItems] = useState<ImportItem[]>([]);
  const [importSummary, setImportSummary] = useState("");
  const [publishImmediately, setPublishImmediately] = useState(true);

  const newSelectedCategory = categories.find(
    (category) => category.id === Number(newCategoryId),
  );

  const visibleBankItems = useMemo(() => {
    const search = bankSearch.trim().toLocaleLowerCase("pt-BR");

    return bankItems.filter((item) => {
      const assignment = assignments[String(item.id)];

      if (bankCategoryFilter === "uncategorized" && assignment?.categoryId) return false;
      if (
        bankCategoryFilter !== "all" &&
        bankCategoryFilter !== "uncategorized" &&
        assignment?.categorySlug !== bankCategoryFilter
      ) {
        return false;
      }

      if (!search) return true;

      return [item.question, item.shortAnswer, item.fullAnswer]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(search);
    });
  }, [assignments, bankCategoryFilter, bankItems, bankSearch]);

  async function api(body: Record<string, unknown>) {
    const response = await fetch("/api/question-bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();

    if (response.status === 401) {
      setAuthenticated(false);
      throw new Error("Sessão administrativa expirada.");
    }

    if (!response.ok) throw new Error(data.error || "Falha na operação.");
    return data;
  }

  async function loadBank() {
    const [bank, reviews] = await Promise.all([
      api({ action: "admin-list" }),
      api({ action: "review-list" }),
    ]);

    setBankItems(bank.items || []);
    setCounts(bank.counts || {});
    setReviewItems(reviews.items || []);
  }

  async function loadCategories() {
    const response = await fetch("/api/question-bank/categories?admin=1", {
      cache: "no-store",
    });
    const data = (await response.json()) as CategoryPayload;

    if (response.status === 401) {
      setAuthenticated(false);
      throw new Error("Sessão administrativa expirada.");
    }

    if (!response.ok) throw new Error(data.error || "Falha ao carregar categorias.");

    setCategories(data.categories || []);
    setAssignments(data.assignments || {});
  }

  async function saveCategoryAssignment(
    questionId: number,
    categoryId: number,
    subcategoryId: number,
  ) {
    const response = await fetch("/api/question-bank/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "assign",
        questionId,
        categoryId,
        subcategoryId,
      }),
    });

    const data = await response.json();

    if (response.status === 401) {
      setAuthenticated(false);
      throw new Error("Sessão administrativa expirada.");
    }

    if (!response.ok) throw new Error(data.error || "Falha ao salvar a categoria.");
    return data;
  }

  async function handleInlineCategorySave(
    questionId: number,
    categoryId: number,
    subcategoryId: number,
  ) {
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      await saveCategoryAssignment(questionId, categoryId, subcategoryId);
      await loadCategories();
      setSuccess("Categoria e subcategoria atualizadas.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha.");
    } finally {
      setBusy(false);
    }
  }

  async function createQuestion(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      if (!newCategoryId || !newSubcategoryId) {
        throw new Error("Selecione a categoria e a subcategoria da nova pergunta.");
      }

      const created = await api({
        action: "create",
        question: newQuestion,
        shortAnswer: newShortAnswer,
        fullAnswer: newFullAnswer,
        aliases: newAliases
          .split(/\n|;/)
          .map((item) => item.trim())
          .filter(Boolean),
        status: newStatus,
      });

      await saveCategoryAssignment(
        Number(created.id),
        Number(newCategoryId),
        Number(newSubcategoryId),
      );

      setSuccess(`Pergunta cadastrada. ID ${created.id}.`);
      setNewQuestion("");
      setNewShortAnswer("");
      setNewFullAnswer("");
      setNewAliases("");
      setNewCategoryId("");
      setNewSubcategoryId("");

      await Promise.all([loadBank(), loadCategories()]);
      setTab("bank");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(id: number, status: string) {
    setBusy(true);
    setError("");

    try {
      await api({ action: "status", id, status });
      await Promise.all([loadBank(), loadCategories()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewSubmission(item: ReviewItem, decision: string) {
    setBusy(true);
    setError("");

    try {
      await api({
        action: "review",
        id: item.id,
        decision,
        shortAnswer: item.shortAnswer,
        fullAnswer: item.fullAnswer,
      });

      setSuccess(
        decision === "approve"
          ? "Sugestão aprovada e publicada. Classifique-a na aba Banco."
          : "Sugestão rejeitada.",
      );
      await Promise.all([loadBank(), loadCategories()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha.");
    } finally {
      setBusy(false);
    }
  }

  async function readUploadedFile(upload: File) {
    const name = upload.name.toLowerCase();

    if (name.endsWith(".pdf")) {
      const win = window as any;
      const pdfjs = win.pdfjsLib
        ? win.pdfjsLib
        : await (win.__qbPdf ||
            (win.__qbPdf = new Promise<any>((resolve, reject) => {
              const onReady = () => {
                window.removeEventListener("qb-pdf", onReady);
                if (!win.pdfjsLib) {
                  reject(new Error("PDF.js não carregou."));
                  return;
                }
                win.pdfjsLib.GlobalWorkerOptions.workerSrc =
                  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
                resolve(win.pdfjsLib);
              };

              window.addEventListener("qb-pdf", onReady, { once: true });

              const script = document.createElement("script");
              script.type = "module";
              script.textContent =
                'import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs"; window.pdfjsLib=pdfjsLib; window.dispatchEvent(new Event("qb-pdf"));';
              script.onerror = () => reject(new Error("Falha ao carregar PDF.js."));
              document.head.appendChild(script);
            }).finally(() => {
              win.__qbPdf = null;
            })));

      const pdf = await pdfjs.getDocument({
        data: new Uint8Array(await upload.arrayBuffer()),
      }).promise;

      const pages: string[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        pages.push(
          (textContent.items || [])
            .map((item: any) => item?.str || "")
            .join(" ")
            .replace(/\s+/g, " ")
            .trim(),
        );
      }

      return pages.join("\n\n");
    }

    if (name.endsWith(".docx")) {
      const win = window as any;
      const mammoth = win.mammoth
        ? win.mammoth
        : await (win.__qbM ||
            (win.__qbM = new Promise<any>((resolve, reject) => {
              const script = document.createElement("script");
              script.src =
                "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js";
              script.onload = () =>
                win.mammoth
                  ? resolve(win.mammoth)
                  : reject(new Error("Mammoth não carregou."));
              script.onerror = () =>
                reject(new Error("Falha ao carregar leitor DOCX."));
              document.head.appendChild(script);
            }).finally(() => {
              win.__qbM = null;
            })));

      const result = await mammoth.extractRawText({
        arrayBuffer: await upload.arrayBuffer(),
      });

      return String(result.value || "").trim();
    }

    return await upload.text();
  }

  async function previewImport() {
    if (!file) return;

    setBusy(true);
    setError("");
    setImportItems([]);
    setImportSummary("");

    try {
      const text = await readUploadedFile(file);
      const hashBuffer = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(hashBuffer))
        .map((item) => item.toString(16).padStart(2, "0"))
        .join("");

      const lower = file.name.toLowerCase();
      const fileType = lower.endsWith(".pdf")
        ? "pdf"
        : lower.endsWith(".docx")
          ? "docx"
          : "txt";

      const result = await api({
        action: "import-preview",
        filename: file.name,
        fileType,
        sha256,
        text,
      });

      setImportId(result.importId);
      setImportItems(result.items || []);
      setImportSummary(
        `${result.total} detectada(s) · ${result.ready} pronta(s) · ${result.review} para revisão · ${result.duplicates} duplicada(s).`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha na análise.");
    } finally {
      setBusy(false);
    }
  }

  function updateImportItem(id: number, patch: Partial<ImportItem>) {
    setImportItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  async function commitImport() {
    if (!importId) return;

    setBusy(true);
    setError("");

    try {
      const result = await api({
        action: "import-commit",
        importId,
        items: importItems.filter((item) => item.selected),
        publishImmediately,
      });

      setSuccess(
        `${result.created} pergunta(s) importada(s). ${result.skipped} duplicada(s) ignorada(s). As novas perguntas sem categoria podem ser classificadas na aba Banco.`,
      );
      setImportItems([]);
      setImportId(null);
      setFile(null);
      setImportSummary("");

      await Promise.all([loadBank(), loadCategories()]);
      setTab("bank");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha na importação.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => response.json())
      .then(async (data) => {
        const ok = Boolean(data.authenticated);
        setAuthenticated(ok);
        if (ok) {
          await Promise.all([loadBank(), loadCategories()]);
        }
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setCheckedSession(true));
    // Executa apenas na montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!checkedSession) {
    return (
      <main className={styles.shell}>
        <div className={styles.login}>Verificando acesso…</div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className={styles.shell}>
        <div className={styles.login}>
          <h1>Banco de Perguntas</h1>
          <p>Entre primeiro na administração principal.</p>
          <a href="/admin">Ir para Administração →</a>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <span>Administração</span>
          <h1>Banco de Perguntas</h1>
          <p>Cadastre, importe, revise, publique e classifique perguntas e respostas.</p>
        </div>
        <div>
          <a href="/banco-perguntas">Ver banco público</a>
          <a href="/admin">← Administração</a>
        </div>
      </header>

      <section className={styles.stats}>
        <div>
          <b>{counts.total || 0}</b>
          <span>Total</span>
        </div>
        <div>
          <b>{counts.approved || 0}</b>
          <span>Aprovadas</span>
        </div>
        <div>
          <b>{categories.length}</b>
          <span>Categorias</span>
        </div>
        <div>
          <b>{reviewItems.length}</b>
          <span>Sugestões</span>
        </div>
      </section>

      <nav className={styles.tabs}>
        {[
          ["bank", "Banco"],
          ["new", "Nova pergunta"],
          ["import", "Importar PDF/DOCX"],
          ["review", `Em revisão (${reviewItems.length})`],
        ].map(([value, label]) => (
          <button
            type="button"
            className={tab === value ? styles.active : ""}
            onClick={() => setTab(value)}
            key={value}
          >
            {label}
          </button>
        ))}
      </nav>

      {success && <div className={styles.success}>{success}</div>}
      {error && <div className={styles.error}>{error}</div>}

      {tab === "bank" && (
        <section className={styles.panel}>
          <div className={styles.panelTitle}>
            <div>
              <h2>Perguntas cadastradas</h2>
              <p>Filtre por assunto e ajuste a classificação de cada pergunta.</p>
            </div>
            <b>{visibleBankItems.length} exibida(s)</b>
          </div>

          <div className={styles.categoryOverview}>
            {categories.map((category) => (
              <button
                type="button"
                key={category.id}
                className={
                  bankCategoryFilter === category.slug ? styles.categoryOverviewActive : ""
                }
                onClick={() =>
                  setBankCategoryFilter(
                    bankCategoryFilter === category.slug ? "all" : category.slug,
                  )
                }
              >
                <b>{category.count}</b>
                <span>{category.name}</span>
              </button>
            ))}
          </div>

          <div className={styles.filters}>
            <input
              value={bankSearch}
              onChange={(event) => setBankSearch(event.target.value)}
              placeholder="Pesquisar no Banco..."
            />
            <select
              value={bankCategoryFilter}
              onChange={(event) => setBankCategoryFilter(event.target.value)}
            >
              <option value="all">Todas as categorias</option>
              <option value="uncategorized">Sem categoria</option>
              {categories.map((category) => (
                <option value={category.slug} key={category.id}>
                  {category.name} ({category.count})
                </option>
              ))}
            </select>
          </div>

          <div className={styles.list}>
            {visibleBankItems.map((item) => {
              const assignment = assignments[String(item.id)];

              return (
                <article key={item.id}>
                  <div className={styles.meta}>
                    <span className={styles[item.status] || ""}>{item.status}</span>
                    <span>{item.origin}</span>
                    <span>v{item.version}</span>
                    <span>{item.sourceCount} fonte(s)</span>
                    {assignment?.categoryName && (
                      <span className={styles.categoryBadge}>
                        {assignment.categoryName}
                      </span>
                    )}
                  </div>

                  <h3>{item.question}</h3>
                  <p>{item.shortAnswer || item.fullAnswer}</p>

                  <ClassificationEditor
                    questionId={item.id}
                    categories={categories}
                    assignment={assignment}
                    disabled={busy}
                    onSave={handleInlineCategorySave}
                  />

                  <div className={styles.actions}>
                    {item.status !== "approved" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void changeStatus(item.id, "approved")}
                      >
                        Aprovar
                      </button>
                    )}
                    {item.status !== "review" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void changeStatus(item.id, "review")}
                      >
                        Revisar
                      </button>
                    )}
                    {item.status !== "archived" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void changeStatus(item.id, "archived")}
                      >
                        Arquivar
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {tab === "new" && (
        <form className={styles.panel} onSubmit={createQuestion}>
          <h2>Nova pergunta e resposta</h2>

          <label>
            Pergunta
            <textarea
              rows={3}
              value={newQuestion}
              onChange={(event) => setNewQuestion(event.target.value)}
              required
            />
          </label>

          <div className={styles.grid}>
            <label>
              Resposta simplificada
              <textarea
                rows={8}
                value={newShortAnswer}
                onChange={(event) => setNewShortAnswer(event.target.value)}
              />
            </label>
            <label>
              Resposta ampla
              <textarea
                rows={12}
                value={newFullAnswer}
                onChange={(event) => setNewFullAnswer(event.target.value)}
              />
            </label>
          </div>

          <div className={styles.grid}>
            <label>
              Categoria
              <select
                value={newCategoryId}
                required
                onChange={(event) => {
                  setNewCategoryId(event.target.value);
                  setNewSubcategoryId("");
                }}
              >
                <option value="">Selecione</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Subcategoria
              <select
                value={newSubcategoryId}
                required
                disabled={!newCategoryId}
                onChange={(event) => setNewSubcategoryId(event.target.value)}
              >
                <option value="">Selecione</option>
                {(newSelectedCategory?.subcategories || []).map((subcategory) => (
                  <option key={subcategory.id} value={subcategory.id}>
                    {subcategory.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Variações da pergunta
            <textarea
              rows={5}
              value={newAliases}
              onChange={(event) => setNewAliases(event.target.value)}
              placeholder="Uma por linha"
            />
          </label>

          <label>
            Status
            <select
              value={newStatus}
              onChange={(event) => setNewStatus(event.target.value)}
            >
              <option value="approved">Aprovada</option>
              <option value="review">Em revisão</option>
              <option value="draft">Rascunho</option>
            </select>
          </label>

          <button className={styles.primary} disabled={busy}>
            {busy ? "Salvando…" : "Cadastrar no Banco"}
          </button>
        </form>
      )}

      {tab === "import" && (
        <section className={styles.panel}>
          <h2>Importar perguntas de PDF ou DOCX</h2>
          <p>O arquivo é lido no navegador e nada é gravado antes da sua confirmação.</p>

          <div className={styles.import}>
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setImportItems([]);
                setImportId(null);
                setImportSummary("");
              }}
            />
            <button type="button" disabled={!file || busy} onClick={() => void previewImport()}>
              {busy ? "Analisando…" : "Analisar arquivo"}
            </button>
          </div>

          {file && (
            <small>
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
            </small>
          )}

          {importSummary && <div className={styles.success}>{importSummary}</div>}

          {!!importItems.length && (
            <>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={publishImmediately}
                  onChange={(event) => setPublishImmediately(event.target.checked)}
                />
                Publicar imediatamente como aprovado
              </label>

              <div className={styles.list}>
                {importItems.map((item, index) => (
                  <article key={item.id}>
                    <div className={styles.meta}>
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(event) =>
                            updateImportItem(item.id, { selected: event.target.checked })
                          }
                        />
                        {String(index + 1).padStart(2, "0")}
                      </label>
                      <span className={styles[item.status] || ""}>{item.status}</span>
                    </div>

                    {item.duplicateQuestion && (
                      <div className={styles.dup}>
                        Possível semelhante: “{item.duplicateQuestion}”{" "}
                        {item.duplicateScore
                          ? `· ${Math.round(100 * item.duplicateScore)}%`
                          : ""}
                      </div>
                    )}

                    <label>
                      Pergunta
                      <textarea
                        rows={3}
                        value={item.question}
                        onChange={(event) =>
                          updateImportItem(item.id, { question: event.target.value })
                        }
                      />
                    </label>

                    <div className={styles.grid}>
                      <label>
                        Resposta simplificada
                        <textarea
                          rows={6}
                          value={item.shortAnswer}
                          onChange={(event) =>
                            updateImportItem(item.id, { shortAnswer: event.target.value })
                          }
                        />
                      </label>

                      <label>
                        Resposta ampla
                        <textarea
                          rows={9}
                          value={item.fullAnswer}
                          onChange={(event) =>
                            updateImportItem(item.id, { fullAnswer: event.target.value })
                          }
                        />
                      </label>
                    </div>

                    {(item.status === "duplicate" || item.status === "review") && (
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={Boolean(item.force)}
                          onChange={(event) =>
                            updateImportItem(item.id, { force: event.target.checked })
                          }
                        />
                        Importar mesmo assim após minha revisão
                      </label>
                    )}
                  </article>
                ))}
              </div>

              <button
                type="button"
                className={styles.primary}
                disabled={busy}
                onClick={() => void commitImport()}
              >
                {busy ? "Importando…" : "Confirmar importação selecionada"}
              </button>
            </>
          )}
        </section>
      )}

      {tab === "review" && (
        <section className={styles.panel}>
          <h2>Sugestões dos usuários</h2>

          {reviewItems.length ? (
            <div className={styles.list}>
              {reviewItems.map((item) => (
                <article key={item.id}>
                  <div className={styles.meta}>
                    <span className={styles.review}>review</span>
                    <span>{new Date(item.createdAt).toLocaleString("pt-BR")}</span>
                  </div>

                  <h3>{item.question}</h3>

                  <details open>
                    <summary>Resposta simplificada</summary>
                    <p>{item.shortAnswer}</p>
                  </details>

                  <details>
                    <summary>Resposta ampla</summary>
                    <p>{item.fullAnswer}</p>
                  </details>

                  <div className={styles.actions}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void reviewSubmission(item, "approve")}
                    >
                      Aprovar e publicar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void reviewSubmission(item, "reject")}
                    >
                      Rejeitar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p>Nenhuma sugestão aguardando revisão.</p>
          )}
        </section>
      )}
    </main>
  );
}
