"use client";

import { FormEvent, useMemo, useState } from "react";
import styles from "./perguntar.module.css";

type Verse = {
  id: number;
  book: string;
  chapter: number;
  verse: number;
  text: string;
};

type BibleRef = {
  reference: string;
  mentions: number;
  topicIds: number[];
  verses: Verse[];
};

type RepeatRef = {
  id: number;
  year?: number | null;
  sourceType?: string | null;
  sourceTitle?: string | null;
  pageStart?: number | null;
};

type TopicRef = {
  topicId: number;
  topicNumber?: string | null;
  title: string;
  year?: number | null;
  sourceType?: string | null;
  sourceTitle?: string | null;
  page?: number | null;
  pageEnd?: number | null;
  category?: string | null;
  preview?: string;
  contentLength?: number;
  fullTopicAvailable?: boolean;
  fullTopicEndpoint?: string;
  repeatedIn?: RepeatRef[];
};

type SpecificRef = {
  topicId: number;
  topicNumber?: string | null;
  title: string;
  year?: number | null;
  sourceType?: string | null;
  sourceTitle?: string | null;
  page?: number | null;
  pageEnd?: number | null;
  preview?: string;
  fullTopicEndpoint?: string;
};

type AnswerSection = {
  order: number;
  topicId: number;
  topicTitle: string;
  text: string;
  sourceLabel: string;
};

type SourceRef = {
  id?: string | number | null;
  topicId?: number | null;
  title: string;
  sourceType?: string | null;
  year?: number | null;
  page?: number | null;
  pageEnd?: number | null;
  citationText?: string;
};


type BankStatus = {
  id: number;
  question: string;
  confidence: "strong" | "possible";
  matchedQuery: string;
  matchedTerms: string[];
  coverage: number;
  localScore: number;
  sourceCount: number;
  approved: boolean;
};


type StructuredResponse = {
  version: string;
  response: string;
  bible?: Array<{
    reference: string;
    mentions?: number;
    verses?: Verse[];
  }>;
  ccb?: Array<{
    topicId: number;
    topicNumber?: string | null;
    title: string;
    year?: number | null;
    sourceType?: string | null;
    sourceTitle?: string | null;
    page?: number | null;
    pageEnd?: number | null;
    preview?: string;
  }>;
  practicalGuidance?: string[];
  conclusion?: string;
  referencesBible?: string[];
  referencesCcb?: Array<{
    topicId: number;
    topicNumber?: string | null;
    title: string;
    year?: number | null;
    sourceType?: string | null;
    sourceTitle?: string | null;
    page?: number | null;
    pageEnd?: number | null;
  }>;
  origin?: string;
};

type Result = {
  question: string;
  naturalAnswer?: string;
  answer: string;
  detailedAnswer?: string;
  structuredResponse?: StructuredResponse;
  documentaryStrength?: string;
  documentaryNote?: string;
  sourceCount?: number;
  fullTopicCount?: number;
  searchedTotal?: number;
  fromQuestionBank?: boolean;
  bankMatchScore?: number;
  bankChecked?: boolean;
  bankSearchQueries?: string[];
  bankCandidatesChecked?: number;
  bankMatch?: BankStatus | null;
  bankApprovedMatch?: boolean;
  focusQuery?: string;
  focusTerms?: string[];
  subjectFilterApplied?: boolean;
  subjectMatchedTopicCount?: number;
  answerEngine?: string;
  interpretedTerms?: string[];
  bibleSummary?: string[];
  biblicalReferences?: BibleRef[];
  answerSections?: AnswerSection[];
  topicReferences?: TopicRef[];
  specificGuidance?: SpecificRef[];
  documentarySources?: SourceRef[];
  groupedRepeatCount?: number;
  error?: string;
};

function cite(topic: TopicRef | SpecificRef) {
  return [
    topic.year || null,
    topic.sourceType || null,
    topic.sourceTitle || null,
    topic.page
      ? `pág. ${topic.page}${topic.pageEnd && topic.pageEnd !== topic.page ? `–${topic.pageEnd}` : ""}`
      : null,
  ].filter(Boolean).join(" · ");
}

function FullTopicButton({ topic }: { topic: TopicRef | SpecificRef }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (content) return;

    setLoading(true);
    setError("");
    try {
      const response = await fetch(topic.fullTopicEndpoint || `/api/topic/${topic.topicId}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao abrir o tópico.");
      setContent(String(data.content || "").trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao abrir o tópico.");
    } finally {
      setLoading(false);
    }
  }

  async function copyTopic() {
    let value = content;
    if (!value) {
      try {
        const response = await fetch(topic.fullTopicEndpoint || `/api/topic/${topic.topicId}`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (response.ok) value = String(data.content || "").trim();
      } catch {}
    }
    if (value) await navigator.clipboard.writeText(`${topic.title}\n${cite(topic)}\n\n${value}`);
  }

  return (
    <>
      <div className={styles.topicActions}>
        <button type="button" onClick={() => void toggle()}>
          {loading ? "Carregando…" : open ? "Ocultar tópico completo" : "Ler tópico completo"}
        </button>
        <a href={`/topico/${topic.topicId}`}>Abrir em página própria</a>
        <button type="button" onClick={() => void copyTopic()}>Copiar tópico</button>
      </div>

      {open && (
        <div className={styles.fullTopic}>
          <div className={styles.fullTopicHead}>
            <strong>Tópico completo — sem cortes</strong>
            <span>{cite(topic)}</span>
          </div>
          {error ? (
            <p className={styles.inlineError}>{error}</p>
          ) : loading ? (
            <p className={styles.loadingText}>Lendo o texto integral do banco de dados…</p>
          ) : (
            <div className={styles.fullText}>{content}</div>
          )}
        </div>
      )}
    </>
  );
}


function StructuredOverview({
  result,
  copied,
  onCopy,
}: {
  result: Result;
  copied: boolean;
  onCopy: () => void;
}) {
  const structured = result.structuredResponse;
  const mainAnswer = structured?.response || result.naturalAnswer || result.answer;
  const bible = structured?.bible?.length ? structured.bible : (result.biblicalReferences || []);
  const ccb = structured?.ccb?.length ? structured.ccb : (result.topicReferences || []).slice(0, 6);
  const practical = structured?.practicalGuidance || [];
  const conclusion = structured?.conclusion || "";
  const bibleRefs = structured?.referencesBible?.length
    ? structured.referencesBible
    : (result.bibleSummary || []);
  const ccbRefs = structured?.referencesCcb?.length
    ? structured.referencesCcb
    : (result.topicReferences || []);

  return (
    <section className={styles.readerPanel}>
      <div className={styles.readerHead}>
        <span className={styles.eyebrow}>Resposta estruturada</span>
        <h2>{result.question}</h2>
        <p>
          Banco de Perguntas somente quando houver fonte verificável, documentos conferidos e referências bíblicas somente
          quando efetivamente citadas na resposta aprovada ou nas fontes selecionadas.
        </p>
      </div>

      <section className={styles.readerSection}>
        <h3>Resposta</h3>
        <div className={styles.readerText}>
          {mainAnswer
            .split(/\n{2,}/)
            .map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
      </section>

      <section className={styles.readerSection}>
        <h3>O que a Bíblia nos ensina</h3>
        {bible.length ? (
          <>
            <p className={styles.sectionIntro}>
              Abaixo estão as referências bíblicas efetivamente localizadas na resposta aprovada
              e/ou nos documentos que passaram pelo filtro do assunto.
            </p>
            <div className={styles.scriptureList}>
              {bible.map((reference) => (
                <article key={reference.reference}>
                  <div className={styles.scriptureTitle}>
                    <strong>{reference.reference}</strong>
                    <a href={`/biblia/referencias?ref=${encodeURIComponent(reference.reference)}`}>
                      Abrir na Bíblia →
                    </a>
                  </div>
                  {!!reference.verses?.length ? (
                    reference.verses.map((verse) => (
                      <p key={verse.id}>
                        <sup>{verse.verse}</sup> {verse.text}
                      </p>
                    ))
                  ) : (
                    <p className={styles.mutedText}>Referência citada; texto não carregado nesta consulta.</p>
                  )}
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className={styles.empty}>
            Nenhuma referência bíblica explícita foi localizada nas fontes usadas para esta resposta.
          </div>
        )}
      </section>

      <section className={styles.readerSection}>
        <h3>O que os ensinamentos da CCB orientam</h3>
        {ccb.length ? (
          <div className={styles.ccbList}>
            {ccb.map((topic) => (
              <article key={topic.topicId}>
                <div className={styles.ccbMeta}>
                  {topic.topicNumber && <span>Tópico {topic.topicNumber}</span>}
                  {topic.year && <span>{topic.year}</span>}
                  {topic.sourceType && <span>{topic.sourceType}</span>}
                  {topic.page && (
                    <span>
                      pág. {topic.page}
                      {topic.pageEnd && topic.pageEnd !== topic.page ? `–${topic.pageEnd}` : ""}
                    </span>
                  )}
                </div>
                <h4>{topic.title}</h4>
                {topic.sourceTitle && <small>{topic.sourceTitle}</small>}
                {topic.preview && <p>{topic.preview}</p>}
                <a href={`#topic-${topic.topicId}`}>Conferir tópico completo ↓</a>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            Não foram localizados tópicos suficientemente relacionados ao assunto para fundamentação principal.
          </div>
        )}
      </section>

      {!!practical.length && (
        <section className={styles.readerSection}>
          <h3>Como aplicar na prática</h3>
          <p className={styles.sectionIntro}>
            Orientações abaixo foram extraídas da resposta aprovada e/ou de trechos documentais
            com linguagem de orientação. O sistema não acrescenta novas regras.
          </p>
          <div className={styles.practicalList}>
            {practical.map((item, index) => (
              <article key={`${index}-${item.slice(0, 40)}`}>{item}</article>
            ))}
          </div>
        </section>
      )}

      {!!conclusion && (
        <section className={`${styles.readerSection} ${styles.conclusionBox}`}>
          <h3>Conclusão</h3>
          <div className={styles.readerText}>
            {conclusion
              .split(/\n{2,}/)
              .map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
        </section>
      )}

      <section className={styles.readerSection}>
        <h3>Referências bíblicas</h3>
        {bibleRefs.length ? (
          <div className={styles.referenceChips}>
            {bibleRefs.map((reference) => (
              <a
                key={reference}
                href={`/biblia/referencias?ref=${encodeURIComponent(reference)}`}
              >
                {reference}
              </a>
            ))}
          </div>
        ) : (
          <p className={styles.mutedText}>Nenhuma referência bíblica explícita localizada.</p>
        )}
      </section>

      <section className={styles.readerSection}>
        <h3>Referências CCB</h3>
        {ccbRefs.length ? (
          <div className={styles.ccbReferenceList}>
            {ccbRefs.map((topic) => (
              <article key={`ref-${topic.topicId}`}>
                <strong>
                  {topic.topicNumber ? `Tópico ${topic.topicNumber} — ` : ""}
                  {topic.title}
                </strong>
                <span>{cite(topic as TopicRef)}</span>
                <a href={`#topic-${topic.topicId}`}>Ler tópico completo ↓</a>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.mutedText}>Nenhuma referência CCB principal localizada.</p>
        )}
      </section>

      <div className={styles.readerUtility}>
        <button type="button" onClick={onCopy}>
          {copied ? "Resposta copiada" : "Copiar resposta organizada"}
        </button>
        <button type="button" onClick={() => window.print()}>Imprimir / Salvar PDF</button>
      </div>
    </section>
  );
}

export default function PerguntarPage() {
  const [question, setQuestion] = useState("");
  const [sort, setSort] = useState("relevance");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const q = question.trim();
    if (!q) return;

    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/ask/v9", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, sort }),
      });
      const data = (await response.json()) as Result;
      if (!response.ok) throw new Error(data.error || "Falha na consulta.");
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar.");
    } finally {
      setLoading(false);
    }
  }

  const copyValue = useMemo(() => {
    if (!result) return "";
    const structured = result.structuredResponse;
    const parts = [
      `PERGUNTA\n${result.question}`,
      `RESPOSTA\n${structured?.response || result.naturalAnswer || result.answer}`,
    ];

    const bible = structured?.bible?.length ? structured.bible : (result.biblicalReferences || []);
    if (bible.length) {
      parts.push(
        "O QUE A BÍBLIA NOS ENSINA\n" +
        bible.map((reference) => {
          const verses = reference.verses?.map((verse) => `${verse.verse} ${verse.text}`).join("\n") || "";
          return `${reference.reference}${verses ? `\n${verses}` : ""}`;
        }).join("\n\n"),
      );
    }

    const ccb = structured?.ccb?.length ? structured.ccb : (result.topicReferences || []);
    if (ccb.length) {
      parts.push(
        "O QUE OS ENSINAMENTOS DA CCB ORIENTAM\n" +
        ccb.map((topic) => {
          const meta = [
            topic.topicNumber ? `Tópico ${topic.topicNumber}` : null,
            topic.title,
            cite(topic as TopicRef),
          ].filter(Boolean).join(" — ");
          return `${meta}${topic.preview ? `\n${topic.preview}` : ""}`;
        }).join("\n\n"),
      );
    }

    if (structured?.practicalGuidance?.length) {
      parts.push(`COMO APLICAR NA PRÁTICA\n${structured.practicalGuidance.join("\n\n")}`);
    }

    if (structured?.conclusion) {
      parts.push(`CONCLUSÃO\n${structured.conclusion}`);
    }

    if (structured?.referencesBible?.length) {
      parts.push(`REFERÊNCIAS BÍBLICAS\n${structured.referencesBible.join("\n")}`);
    }

    if (structured?.referencesCcb?.length) {
      parts.push(
        "REFERÊNCIAS CCB\n" +
        structured.referencesCcb
          .map((topic) => `${topic.topicNumber ? `Tópico ${topic.topicNumber} — ` : ""}${topic.title}\n${cite(topic as TopicRef)}`)
          .join("\n\n"),
      );
    }

    return parts.join("\n\n");
  }, [result]);

  async function copyAnswer() {
    if (!copyValue) return;
    await navigator.clipboard.writeText(copyValue);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <a className={styles.back} href="/">← Voltar à Consulta de Ensinamentos</a>
        <div className={styles.kicker}>V9.0 Beta · Pesquisa documental rastreável</div>
        <h1>Pergunte ao acervo</h1>
        <p>
          As respostas seguem um padrão claro: resposta, Bíblia, ensinamentos da CCB, aplicação
          prática quando houver fundamento, conclusão e referências. O Banco de Perguntas continua
          sendo consultado primeiro e nenhuma doutrina é criada pelo sistema.
        </p>

        <form className={styles.questionForm} onSubmit={submit}>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ex.: Qual o ensinamento sobre o uso do véu?"
            rows={5}
          />
          <div className={styles.questionFooter}>
            <label>
              <span>Ordem das fontes</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="relevance">Mais relacionadas primeiro</option>
                <option value="oldest">Mais antigas primeiro</option>
                <option value="recent">Mais recentes primeiro</option>
              </select>
            </label>
            <button disabled={loading || !question.trim()}>
              {loading ? "Consultando Banco de Perguntas, Bíblia e acervo…" : "Responder de forma estruturada"}
            </button>
          </div>
        </form>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      {result && (
        <>
          <StructuredOverview result={result} copied={copied} onCopy={() => void copyAnswer()} />

          <details className={styles.analysisDetails}>
            <summary>Ver análise documental completa</summary>
            <div className={styles.analysisBody}>
          <section className={styles.answerPanel}>
            <div className={styles.answerHead}>
              <div>
                <span className={styles.eyebrow}>Resposta documental</span>
                <h2>{result.question}</h2>
              </div>
              <div className={styles.strength}>
                <span>Força documental</span>
                <strong>{result.documentaryStrength || "não calculada"}</strong>
              </div>
            </div>


            {result.bankChecked && (
              <section
                className={`${styles.bankCheck} ${
                  result.bankApprovedMatch ? styles.bankCheckOk : styles.bankCheckEmpty
                }`}
              >
                <div className={styles.bankCheckHead}>
                  <div>
                    <span className={styles.eyebrow}>1ª etapa · Banco de Perguntas</span>
                    <strong>
                      {result.bankApprovedMatch
                        ? "Resposta aprovada equivalente encontrada"
                        : "Nenhuma resposta aprovada equivalente foi encontrada"}
                    </strong>
                  </div>
                  <span className={styles.bankBadge}>
                    {result.bankApprovedMatch ? "prioridade do Banco" : "seguir pelo acervo"}
                  </span>
                </div>

                {result.bankMatch && (
                  <>
                    <p>
                      <b>Pergunta correspondente:</b> {result.bankMatch.question}
                    </p>
                    <div className={styles.bankMeta}>
                      <span>assunto pesquisado: {result.focusQuery || result.bankMatch.matchedQuery}</span>
                      <span>
                        correspondência: {result.bankMatch.confidence === "strong" ? "forte" : "possível"}
                      </span>
                      <span>{result.bankMatch.sourceCount} fonte(s) vinculada(s) no Banco</span>
                    </div>
                  </>
                )}

                {!result.bankApprovedMatch && (
                  <p>
                    A resposta abaixo foi construída somente depois dessa verificação, usando os
                    documentos que passaram pelo filtro obrigatório do assunto.
                  </p>
                )}
              </section>
            )}

            <article className={styles.directAnswer}>
              <span className={styles.answerLabel}>Resposta objetiva</span>
              {(result.naturalAnswer || result.answer)
                .split(/\n{2,}/)
                .map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </article>

            {!!result.bibleSummary?.length && (
              <div className={styles.bibleStrip}>
                <b>Referências bíblicas citadas na resposta aprovada e/ou nos documentos filtrados</b>
                <div>
                  {result.bibleSummary.map((reference) => (
                    <a
                      href={`/biblia/referencias?ref=${encodeURIComponent(reference)}`}
                      key={reference}
                    >
                      {reference}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {result.detailedAnswer && (
              <section className={styles.approvedAnswer}>
                <span className={styles.eyebrow}>Resposta aprovada no Banco de Perguntas</span>
                {result.detailedAnswer
                  .split(/\n{2,}/)
                  .map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              </section>
            )}

            {!!result.answerSections?.length && (
              <section className={styles.support}>
                <div className={styles.sectionTitle}>
                  <div>
                    <span className={styles.eyebrow}>Síntese rastreável</span>
                    <h3>Trechos que sustentam a resposta</h3>
                  </div>
                </div>

                <div className={styles.supportList}>
                  {result.answerSections.map((section) => (
                    <article key={`${section.topicId}-${section.order}`}>
                      <span className={styles.number}>{section.order}</span>
                      <div>
                        <p>“{section.text}”</p>
                        <small>{section.sourceLabel}</small>
                        <a href={`#topic-${section.topicId}`}>Ver documento correspondente ↓</a>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {result.documentaryNote && (
              <div className={styles.note}>
                <b>Verificação documental:</b> {result.documentaryNote}
              </div>
            )}

            <div className={styles.metrics}>
              <span>{result.fullTopicCount || 0} tópicos lidos integralmente</span>
              <span>{result.subjectMatchedTopicCount || 0} tópico(s) passaram pelo filtro do assunto</span>
              <span>{result.sourceCount || 0} fontes exibidas</span>
              <span>{result.searchedTotal || 0} registros localizados</span>
              {!!result.groupedRepeatCount && (
                <span>{result.groupedRepeatCount} repetição(ões) agrupada(s)</span>
              )}
            </div>

            <div className={styles.utility}>
              <button type="button" onClick={() => void copyAnswer()}>
                {copied ? "Resposta copiada" : "Copiar resposta e referências"}
              </button>
              <button type="button" onClick={() => window.print()}>Imprimir / Salvar PDF</button>
            </div>
          </section>

          <section className={styles.referenceGrid}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span className={styles.eyebrow}>Bíblia Sagrada</span>
                  <h2>Referências citadas na resposta e nas fontes filtradas</h2>
                </div>
                <small>ARC 2009</small>
              </div>

              {result.biblicalReferences?.length ? (
                <div className={styles.refList}>
                  {result.biblicalReferences.map((reference) => (
                    <article className={styles.refCard} key={reference.reference}>
                      <div className={styles.refHead}>
                        <div>
                          <strong>{reference.reference}</strong>
                          <small>
                            {reference.mentions} ocorrência(s)
                            {reference.topicIds?.length ? ` · ${reference.topicIds.length} tópico(s)` : ""}
                          </small>
                        </div>
                        <a href={`/biblia/referencias?ref=${encodeURIComponent(reference.reference)}`}>
                          Abrir →
                        </a>
                      </div>
                      {!!reference.verses?.length && (
                        <div className={styles.verses}>
                          {reference.verses.map((verse) => (
                            <p key={verse.id}>
                              <sup>{verse.verse}</sup> {verse.text}
                            </p>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>
                  Nenhuma referência bíblica explícita foi encontrada na resposta aprovada nem nas fontes filtradas.
                </div>
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span className={styles.eyebrow}>Rastreabilidade</span>
                  <h2>Fontes documentais</h2>
                </div>
                <small>{result.documentarySources?.length || 0} fonte(s)</small>
              </div>

              <div className={styles.sources}>
                {result.documentarySources?.map((source, index) => (
                  <article key={`${source.id || index}-${index}`}>
                    <strong>{source.title}</strong>
                    <span>
                      {source.year || "s/ano"}
                      {source.sourceType ? ` · ${source.sourceType}` : ""}
                      {source.page
                        ? ` · pág. ${source.page}${source.pageEnd && source.pageEnd !== source.page ? `–${source.pageEnd}` : ""}`
                        : ""}
                    </span>
                    {source.citationText && <p>{source.citationText}</p>}
                  </article>
                ))}
              </div>
            </section>
          </section>

          {!!result.topicReferences?.length && (
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span className={styles.eyebrow}>Fundamentação principal</span>
                  <h2>Tópicos centrais sobre o assunto</h2>
                </div>
                <small>{result.topicReferences.length} tópico(s)</small>
              </div>

              <div className={styles.topicList}>
                {result.topicReferences.map((topic) => (
                  <article
                    className={styles.topicCard}
                    id={`topic-${topic.topicId}`}
                    key={topic.topicId}
                  >
                    <div className={styles.badges}>
                      {topic.year && <span>{topic.year}</span>}
                      {topic.sourceType && <span>{topic.sourceType}</span>}
                      {topic.category && <span>{topic.category}</span>}
                      {topic.page && (
                        <span>
                          pág. {topic.page}
                          {topic.pageEnd && topic.pageEnd !== topic.page ? `–${topic.pageEnd}` : ""}
                        </span>
                      )}
                    </div>
                    <h3>
                      {topic.topicNumber ? `${topic.topicNumber}. ` : ""}
                      {topic.title}
                    </h3>
                    {topic.sourceTitle && <small className={styles.sourceTitle}>{topic.sourceTitle}</small>}

                    {topic.preview && (
                      <div className={styles.preview}>
                        <b>Trecho mais relacionado</b>
                        <p>{topic.preview}</p>
                      </div>
                    )}

                    {!!topic.repeatedIn?.length && (
                      <div className={styles.repeatBox}>
                        <b>Este ensinamento também aparece/reaparece em:</b>
                        {topic.repeatedIn.map((repeat) => (
                          <span key={repeat.id}>
                            {repeat.year || "s/ano"}
                            {repeat.sourceType ? ` · ${repeat.sourceType}` : ""}
                            {repeat.pageStart ? ` · pág. ${repeat.pageStart}` : ""}
                          </span>
                        ))}
                      </div>
                    )}

                    <FullTopicButton topic={topic} />
                  </article>
                ))}
              </div>
            </section>
          )}

          {!!result.specificGuidance?.length && (
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span className={styles.eyebrow}>Situações específicas</span>
                  <h2>Orientações relacionadas, mas não centrais à pergunta</h2>
                </div>
                <small>{result.specificGuidance.length} registro(s)</small>
              </div>

              <p className={styles.contextIntro}>
                Estes documentos tratam de casos particulares — por exemplo funeral, enfermidade,
                disciplina ou outra situação específica — e por isso não foram usados como primeira
                definição do ensinamento geral.
              </p>

              <div className={styles.topicList}>
                {result.specificGuidance.map((topic) => (
                  <article className={styles.topicCard} key={topic.topicId}>
                    <div className={styles.badges}>
                      {topic.year && <span>{topic.year}</span>}
                      {topic.sourceType && <span>{topic.sourceType}</span>}
                      {topic.page && <span>pág. {topic.page}</span>}
                    </div>
                    <h3>{topic.title}</h3>
                    {topic.preview && <p className={styles.specificPreview}>{topic.preview}</p>}
                    <FullTopicButton topic={topic} />
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className={styles.method}>
            <b>Critério da resposta</b>
            <p>
              A V8.5 mantém a consulta ao Banco de Perguntas como primeira etapa, identifica o
              assunto central, filtra os documentos por relevância real e apresenta o resultado em
              uma estrutura de leitura. A organização visual não cria doutrina: ela apenas ordena
              respostas aprovadas, textos bíblicos e documentos já existentes.
            </p>
            {result.focusQuery && (
              <p><strong>Assunto efetivamente pesquisado:</strong> {result.focusQuery}</p>
            )}
            {!!result.interpretedTerms?.length && (
              <p><strong>Conceitos documentais considerados:</strong> {result.interpretedTerms.join(" · ")}</p>
            )}
            <small>
              A resposta não substitui os documentos. Todo trecho pode ser conferido no tópico
              completo e nas respectivas fontes.
            </small>
          </section>
            </div>
          </details>
        </>
      )}
    </main>
  );
}
