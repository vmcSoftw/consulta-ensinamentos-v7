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

type Result = {
  question: string;
  naturalAnswer?: string;
  answer: string;
  detailedAnswer?: string;
  documentaryStrength?: string;
  documentaryNote?: string;
  sourceCount?: number;
  fullTopicCount?: number;
  searchedTotal?: number;
  fromQuestionBank?: boolean;
  bankMatchScore?: number;
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
      const response = await fetch("/api/ask/natural", {
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
    const parts = [
      `PERGUNTA\n${result.question}`,
      `RESPOSTA DOCUMENTAL\n${result.naturalAnswer || result.answer}`,
    ];

    if (result.bibleSummary?.length) {
      parts.push(`REFERÊNCIAS BÍBLICAS CITADAS\n${result.bibleSummary.join("\n")}`);
    }

    if (result.topicReferences?.length) {
      parts.push(
        "FONTES PRINCIPAIS\n" +
        result.topicReferences
          .map((topic) => `${topic.title}\n${cite(topic)}`)
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
        <div className={styles.kicker}>V8.3 · Resposta documental avançada</div>
        <h1>Pergunte ao acervo</h1>
        <p>
          O sistema lê os tópicos completos, separa o ensinamento principal de situações
          específicas e apresenta as referências bíblicas realmente citadas nos documentos.
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
              {loading ? "Lendo o acervo completo…" : "Responder com base no acervo"}
            </button>
          </div>
        </form>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      {result && (
        <>
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

            <article className={styles.directAnswer}>
              <span className={styles.answerLabel}>Resposta objetiva</span>
              {(result.naturalAnswer || result.answer)
                .split(/\n{2,}/)
                .map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </article>

            {!!result.bibleSummary?.length && (
              <div className={styles.bibleStrip}>
                <b>Base bíblica citada nos documentos</b>
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
                  <h2>Referências citadas nas fontes</h2>
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
                  Nenhuma referência bíblica explícita foi encontrada nas fontes utilizadas.
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
              A V8.3 prioriza documentos que tratam diretamente do assunto perguntado, agrupa
              repetições históricas e separa orientações de casos específicos para não confundir
              uma exceção ou situação particular com o ensinamento geral.
            </p>
            {!!result.interpretedTerms?.length && (
              <p><strong>Conceitos considerados:</strong> {result.interpretedTerms.join(" · ")}</p>
            )}
            <small>
              A resposta não substitui os documentos. Todo trecho pode ser conferido no tópico
              completo e nas respectivas fontes.
            </small>
          </section>
        </>
      )}
    </main>
  );
}
