"use client";

import { FormEvent, useState } from "react";
import styles from "./perguntar.module.css";

type BibleVerse = {
  id: number;
  book: string;
  bookOrder: number;
  chapter: number;
  verse: number;
  text: string;
  pdfPage?: number | null;
};

type BibleReference = {
  reference: string;
  book: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
  verses: BibleVerse[];
};

type TopicReference = {
  topicId: number;
  title: string;
  year?: number | null;
  sourceType?: string | null;
  sourceTitle?: string | null;
  page?: number | null;
  excerpt?: string;
  strictMatch?: boolean;
  coverage?: number;
};

type DocumentarySource = {
  id?: number | string | null;
  topicId?: number | null;
  title: string;
  sourceType?: string | null;
  year?: number | null;
  page?: number | null;
  citationText?: string;
};

type NaturalAskResult = {
  question: string;
  answer: string;
  naturalAnswer?: string;
  detailedAnswer?: string;
  documentaryNote?: string;
  documentaryStrength?: string;
  sourceCount?: number;
  answerOrigin?: string;
  fromQuestionBank?: boolean;
  bankMatchScore?: number;
  coreTerms?: string[];
  expandedTerms?: string[];
  strictTotal?: number;
  total?: number;
  biblicalReferences?: BibleReference[];
  topicReferences?: TopicReference[];
  documentarySources?: DocumentarySource[];
  error?: string;
};

export default function PerguntarPage() {
  const [question, setQuestion] = useState("");
  const [sort, setSort] = useState("relevance");
  const [result, setResult] = useState<NaturalAskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleaned = question.trim();
    if (!cleaned) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/ask/natural", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleaned, sort }),
      });

      const data = (await response.json()) as NaturalAskResult;
      if (!response.ok) throw new Error(data.error || "Falha na consulta.");

      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <a className={styles.back} href="/">← Voltar à Consulta de Ensinamentos</a>
        <div className={styles.kicker}>V8.1 · Perguntar ao acervo</div>
        <h1>Faça sua pergunta de forma natural</h1>
        <p>
          A resposta é organizada a partir do Banco de Perguntas e dos documentos do acervo,
          mostrando as referências bíblicas explicitamente citadas e os tópicos que sustentam
          a resposta.
        </p>

        <form className={styles.questionForm} onSubmit={submit}>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ex.: Existe ensinamento sobre uso do véu? Qual é a base bíblica e em quais tópicos isso aparece?"
            rows={5}
          />

          <div className={styles.questionFooter}>
            <label>
              <span>Organizar documentos</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="relevance">Por relevância</option>
                <option value="oldest">Do mais antigo ao mais recente</option>
                <option value="recent">Do mais recente ao mais antigo</option>
              </select>
            </label>

            <button disabled={loading || !question.trim()}>
              {loading ? "Consultando o acervo…" : "Buscar resposta"}
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

            <article className={styles.naturalAnswer}>
              {(result.naturalAnswer || result.answer)
                .split(/\n{2,}/)
                .map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </article>

            {result.detailedAnswer && (
              <details className={styles.details}>
                <summary>Ver resposta detalhada</summary>
                <div>
                  {result.detailedAnswer
                    .split(/\n{2,}/)
                    .map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                </div>
              </details>
            )}

            {result.documentaryNote && (
              <div className={styles.documentaryNote}>
                <b>Base documental:</b> {result.documentaryNote}
              </div>
            )}

            <div className={styles.answerMeta}>
              <span>{result.sourceCount || 0} fonte(s) utilizada(s)</span>
              {result.fromQuestionBank && <span>Resposta revisada no Banco de Perguntas</span>}
              {typeof result.bankMatchScore === "number" && (
                <span>Correspondência {Math.round(result.bankMatchScore * 100)}%</span>
              )}
            </div>
          </section>

          <section className={styles.referenceGrid}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span className={styles.eyebrow}>Bíblia Sagrada</span>
                  <h2>Referências bíblicas citadas</h2>
                </div>
                <small>ARC 2009</small>
              </div>

              {result.biblicalReferences?.length ? (
                <div className={styles.list}>
                  {result.biblicalReferences.map((reference) => (
                    <article className={styles.refCard} key={reference.reference}>
                      <div className={styles.refTitle}>
                        <strong>{reference.reference}</strong>
                        <a href={`/biblia/referencias?ref=${encodeURIComponent(reference.reference)}`}>
                          Abrir referência →
                        </a>
                      </div>

                      {reference.verses.length > 0 ? (
                        reference.verses.map((verse) => (
                          <p key={verse.id}>
                            <sup>{verse.verse}</sup> {verse.text}
                          </p>
                        ))
                      ) : (
                        <p>Referência identificada no acervo. Abra na Bíblia para consultar.</p>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyReference}>
                  <b>Nenhuma referência bíblica explícita foi encontrada nos registros usados.</b>
                  <p>
                    O sistema não acrescenta versículos por associação automática para não atribuir
                    ao documento uma base bíblica que ele não citou.
                  </p>
                </div>
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span className={styles.eyebrow}>Acervo documental</span>
                  <h2>Tópicos que fundamentam a resposta</h2>
                </div>
                <small>{result.topicReferences?.length || 0} tópico(s)</small>
              </div>

              {result.topicReferences?.length ? (
                <div className={styles.list}>
                  {result.topicReferences.map((topic) => (
                    <a className={styles.topicCard} href={`/topico/${topic.topicId}`} key={topic.topicId}>
                      <div className={styles.badges}>
                        {topic.year && <span>{topic.year}</span>}
                        {topic.sourceType && <span>{topic.sourceType}</span>}
                        {topic.page && <span>pág. {topic.page}</span>}
                      </div>
                      <h3>{topic.title}</h3>
                      {topic.excerpt && <p>{topic.excerpt}</p>}
                      <b>Abrir tópico completo →</b>
                    </a>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyReference}>
                  <b>Nenhum tópico individual foi vinculado à resposta.</b>
                  <p>Consulte as fontes documentais abaixo para conferir a origem do conteúdo.</p>
                </div>
              )}
            </section>
          </section>

          {!!result.documentarySources?.length && (
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <span className={styles.eyebrow}>Rastreabilidade</span>
                  <h2>Fontes documentais</h2>
                </div>
              </div>

              <div className={styles.sources}>
                {result.documentarySources.map((source, index) => (
                  <article key={`${source.id || index}-${index}`}>
                    <strong>{source.title}</strong>
                    <span>
                      {source.year || "s/ano"}
                      {source.sourceType ? ` · ${source.sourceType}` : ""}
                      {source.page ? ` · pág. ${source.page}` : ""}
                    </span>
                    {source.citationText && <p>{source.citationText}</p>}
                    {source.topicId && <a href={`/topico/${source.topicId}`}>Ver tópico →</a>}
                  </article>
                ))}
              </div>
            </section>
          )}

          {(result.coreTerms?.length || result.expandedTerms?.length) && (
            <section className={styles.method}>
              <b>Como o sistema interpretou a pergunta</b>
              {!!result.coreTerms?.length && (
                <p><strong>Conceitos principais:</strong> {result.coreTerms.join(" · ")}</p>
              )}
              {!!result.expandedTerms?.length && (
                <p><strong>Termos relacionados:</strong> {result.expandedTerms.slice(0, 18).join(" · ")}</p>
              )}
              <small>
                As referências exibidas permanecem vinculadas ao conteúdo documental encontrado.
                A V8.1 não cria doutrina nem acrescenta referências bíblicas não citadas nas fontes usadas.
              </small>
            </section>
          )}
        </>
      )}
    </main>
  );
}
