import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type AnyRow = Record<string, any>;

type Seed = {
  id: number;
  priority: number;
  origin: "question-bank" | "ask-evidence" | "smart-search";
  score?: number;
  title?: string;
  excerpt?: string;
  year?: number | null;
  sourceType?: string | null;
  sourceTitle?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  category?: string | null;
};

type Topic = {
  id: number;
  topicNumber?: string | null;
  title: string;
  content: string;
  year?: number | null;
  sourceType?: string | null;
  sourceTitle?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  category?: string | null;
  keywords: string[];
  origin: Seed["origin"];
  seedPriority: number;
  baseScore: number;
  coverage: number;
  centrality: number;
  specificityPenalty: number;
  rankingScore: number;
  preview: string;
  repeatedIn?: Array<{
    id: number;
    year?: number | null;
    sourceType?: string | null;
    sourceTitle?: string | null;
    pageStart?: number | null;
  }>;
};

const STOPWORDS = new Set([
  "a","ao","aos","aquela","aquelas","aquele","aqueles","as","com","como","da","das","de","do","dos",
  "e","em","entre","essa","essas","esse","esses","esta","estas","este","estes","eu","foi","ha","há",
  "isso","isto","ja","já","mais","me","na","nas","no","nos","o","os","ou","para","pela","pelas","pelo",
  "pelos","por","qual","quais","que","se","sem","ser","sobre","sua","suas","seu","seus","um","uma",
  "umas","uns","ensinamento","ensinamentos","entendimento","entendimentos","assunto","assuntos",
  "igreja","irmandade","irmao","irmaos","irma","irmas","dizer","diz","dizem"
]);

const SPECIFIC_CONTEXT = [
  "funeral","sepultamento","sepultar","caixao","urna funeraria","falecid","morta","morto",
  "enferm","doente","cura","curar","molestia","milagre",
  "permissao","permitir","emprestar","emprestado","tirar o","retirar o",
  "disciplina","advertencia","escandalo","inconveniente",
  "caso especifico","situação especifica","situação específica",
];

function clean(value: unknown) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function norm(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniq<T>(rows: T[], key: (row: T) => string) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const k = key(row);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function jsonFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function isGeneralQuestion(question: string) {
  const q = norm(question);
  return [
    "qual o ensinamento sobre",
    "qual e o ensinamento sobre",
    "qual entendimento sobre",
    "qual e o entendimento sobre",
    "o que os ensinamentos dizem sobre",
    "o que diz o ensinamento sobre",
    "o que diz sobre",
    "como a congregacao entende",
  ].some((pattern) => q.includes(pattern));
}

function terms(question: string, base: AnyRow) {
  const all = [
    ...norm(question).split(" "),
    ...(Array.isArray(base?.coreTerms) ? base.coreTerms : []),
    ...(Array.isArray(base?.expandedTerms) ? base.expandedTerms : []),
  ]
    .map((item) => norm(String(item)))
    .filter((item) => item.length >= 3 && !STOPWORDS.has(item));

  return [...new Set(all)].slice(0, 32);
}

function coverage(text: string, coreTerms: string[]) {
  if (!coreTerms.length) return 0;
  const hay = norm(text);
  let count = 0;
  for (const term of coreTerms) {
    if (hay.includes(term)) count++;
  }
  return count / coreTerms.length;
}

function titleCentrality(title: string, coreTerms: string[]) {
  const nt = norm(title);
  if (!nt || !coreTerms.length) return 0;
  let score = 0;
  for (const term of coreTerms) {
    if (nt.includes(term)) score += term.includes(" ") ? 18 : 11;
  }
  if (coreTerms.every((term) => nt.includes(term))) score += 22;
  return score;
}

function specificityPenalty(topic: { title: string; content: string }, general: boolean, coreTerms: string[]) {
  if (!general) return 0;
  const head = norm(`${topic.title} ${topic.content.slice(0, 1100)}`);
  const queryWords = new Set(coreTerms.flatMap((term) => term.split(" ")));
  let penalty = 0;

  for (const marker of SPECIFIC_CONTEXT) {
    const nm = norm(marker);
    if (head.includes(nm) && ![...queryWords].some((word) => nm.includes(word))) {
      penalty += 22;
    }
  }

  if (/\b(referencia ao topico|repeticao topico|repetição tópico)\b/i.test(topic.content.slice(0, 500))) {
    penalty += 10;
  }

  return Math.min(penalty, 120);
}

function sourceBreadthBonus(topic: { content: string; sourceType?: string | null }) {
  const length = topic.content.length;
  let score = 0;
  if (length >= 900) score += 8;
  if (length >= 2200) score += 10;
  if (length >= 5000) score += 12;
  if (length >= 10000) score += 8;

  const type = norm(String(topic.sourceType || ""));
  if (type.includes("circular")) score += 10;
  if (type.includes("rge")) score += 8;
  if (type.includes("carta")) score += 6;
  return score;
}

function sentenceList(text: string) {
  const prepared = clean(text)
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bLeitura\s+\d+\s+min\b/gi, " ")
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, " ")
    .replace(/\b\d+[ªº]?\s*Carta\b/gi, " ")
    .trim();

  return (prepared.match(/[^.!?]+(?:[.!?]+|$)/g) || [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 34);
}

function sentenceScore(sentence: string, coreTerms: string[], general: boolean) {
  const ns = norm(sentence);
  let score = 0;

  for (const term of coreTerms) {
    if (ns.includes(term)) score += term.includes(" ") ? 13 : 7;
  }

  if (/\b(deve|devem|serve|servem|usa|usam|usar|finalidade|significa|significado|ensina|ensinada|mandamento|doutrina|escritura|palavra de deus|está escrito|esta escrito)\b/i.test(sentence)) score += 9;
  if (/\b(não deve|nao deve|não é|nao e|não se|nao se)\b/i.test(sentence)) score += 4;
  if (/\b(coríntios|corintios|romanos|mateus|joão|joao|atos|timóteo|timoteo|pedro|hebreus)\b/i.test(sentence)) score += 3;

  if (/^(cara|querida|querido|os anci[aã]es|a paz de deus|vossos irmãos|vossos irmaos)/i.test(sentence)) score -= 20;
  if (general && SPECIFIC_CONTEXT.some((marker) => ns.includes(norm(marker)))) score -= 7;

  return score;
}

function bestPassage(topic: Topic, question: string, coreTerms: string[], maxChars = 1450) {
  const sentences = sentenceList(topic.content);
  if (!sentences.length) return topic.content.slice(0, maxChars);

  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: sentenceScore(sentence, coreTerms, isGeneralQuestion(question)),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 5);

  if (!ranked.length) return sentences.slice(0, 4).join(" ").slice(0, maxChars);

  const indexes = new Set<number>();
  for (const row of ranked) {
    indexes.add(row.index);
    if (row.index > 0 && sentences[row.index - 1]?.length <= 320) indexes.add(row.index - 1);
    if (sentences[row.index + 1]?.length <= 320) indexes.add(row.index + 1);
  }

  let text = "";
  for (const index of [...indexes].sort((a, b) => a - b)) {
    const sentence = sentences[index];
    if (!sentence) continue;
    const next = text ? `${text} ${sentence}` : sentence;
    if (next.length > maxChars && text) break;
    text = next.slice(0, maxChars);
  }
  return text.trim();
}

function tokenSet(text: string) {
  return new Set(
    norm(text)
      .split(" ")
      .filter((word) => word.length >= 4 && !STOPWORDS.has(word)),
  );
}

function similarity(a: string, b: string) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let intersection = 0;
  for (const value of A) if (B.has(value)) intersection++;
  return intersection / Math.max(1, Math.min(A.size, B.size));
}

function groupRepeats(topics: Topic[]) {
  const primaries: Topic[] = [];

  for (const topic of topics) {
    const basis = `${topic.title} ${topic.content.slice(0, 2800)}`;
    let duplicateOf: Topic | undefined;

    for (const primary of primaries) {
      const compare = `${primary.title} ${primary.content.slice(0, 2800)}`;
      if (similarity(basis, compare) >= 0.82) {
        duplicateOf = primary;
        break;
      }
    }

    if (!duplicateOf) {
      primaries.push({ ...topic, repeatedIn: [] });
      continue;
    }

    duplicateOf.repeatedIn = [
      ...(duplicateOf.repeatedIn || []),
      {
        id: topic.id,
        year: topic.year,
        sourceType: topic.sourceType,
        sourceTitle: topic.sourceTitle,
        pageStart: topic.pageStart,
      },
    ];
  }

  return primaries;
}

function collectSeeds(base: AnyRow, smart: AnyRow) {
  const rows: Seed[] = [];

  for (const source of Array.isArray(base?.bankSources) ? base.bankSources : []) {
    const id = Number(source?.topicId);
    if (!id) continue;
    rows.push({
      id,
      priority: 240,
      origin: "question-bank",
      title: clean(source?.sourceTitle),
      excerpt: clean(source?.citationText),
      year: source?.sourceYear ?? null,
      sourceType: source?.sourceType ?? null,
      sourceTitle: source?.sourceTitle ?? null,
      pageStart: source?.pageStart ?? null,
    });
  }

  for (const item of Array.isArray(base?.evidence) ? base.evidence : []) {
    const id = Number(item?.topicId);
    if (!id) continue;
    rows.push({
      id,
      priority: 175,
      origin: "ask-evidence",
      score: Number(item?.coverage || 0) * 100,
      title: clean(item?.title),
      excerpt: clean(item?.text),
      year: item?.year ?? null,
      sourceType: item?.sourceType ?? null,
      sourceTitle: item?.sourceTitle ?? null,
      pageStart: item?.page ?? null,
    });
  }

  for (const item of Array.isArray(smart?.items) ? smart.items : []) {
    const id = Number(item?.id);
    if (!id) continue;
    rows.push({
      id,
      priority: 145,
      origin: "smart-search",
      score: Number(item?.score || 0),
      title: clean(item?.title),
      excerpt: clean(item?.excerpt),
      year: item?.year ?? null,
      sourceType: item?.source_type ?? null,
      sourceTitle: item?.source_title_full ?? null,
      pageStart: item?.page_start ?? null,
      pageEnd: item?.page_end ?? null,
      category: item?.category ?? null,
    });
  }

  const best = new Map<number, Seed>();
  for (const seed of rows) {
    const current = best.get(seed.id);
    if (!current || seed.priority > current.priority) best.set(seed.id, seed);
  }

  return [...best.values()].slice(0, 18);
}

async function hydrate(origin: string, seeds: Seed[], question: string, coreTerms: string[]) {
  const general = isGeneralQuestion(question);

  const rows = await Promise.all(
    seeds.map(async (seed) => {
      try {
        const { response, data } = await jsonFetch(`${origin}/api/topic/${seed.id}`);
        const content = response.ok ? clean(data?.content || seed.excerpt) : clean(seed.excerpt);
        const title = response.ok ? clean(data?.title || seed.title) : clean(seed.title);
        const topicNumber = response.ok ? data?.topic_number ?? null : null;
        const year = response.ok ? data?.year ?? seed.year ?? null : seed.year ?? null;
        const sourceType = response.ok ? data?.source_type ?? seed.sourceType ?? null : seed.sourceType ?? null;
        const sourceTitle = response.ok ? data?.source_title_full ?? seed.sourceTitle ?? null : seed.sourceTitle ?? null;
        const pageStart = response.ok ? data?.page_start ?? seed.pageStart ?? null : seed.pageStart ?? null;
        const pageEnd = response.ok ? data?.page_end ?? seed.pageEnd ?? null : seed.pageEnd ?? null;
        const category = response.ok ? data?.category ?? seed.category ?? null : seed.category ?? null;
        const keywords = response.ok && Array.isArray(data?.keywords) ? data.keywords : [];

        const cov = coverage(`${title} ${content}`, coreTerms);
        const central = titleCentrality(title, coreTerms) + sourceBreadthBonus({ content, sourceType });
        const penalty = specificityPenalty({ title, content }, general, coreTerms);

        const rankingScore =
          seed.priority +
          Math.min(65, Number(seed.score || 0) / 4) +
          cov * 110 +
          central -
          penalty;

        const topic: Topic = {
          id: seed.id,
          topicNumber,
          title: title || "Tópico documental",
          content,
          year,
          sourceType,
          sourceTitle,
          pageStart,
          pageEnd,
          category,
          keywords,
          origin: seed.origin,
          seedPriority: seed.priority,
          baseScore: Number(seed.score || 0),
          coverage: cov,
          centrality: central,
          specificityPenalty: penalty,
          rankingScore,
          preview: "",
        };

        topic.preview = bestPassage(topic, question, coreTerms);
        return topic;
      } catch {
        const content = clean(seed.excerpt);
        const title = clean(seed.title) || "Tópico documental";
        const cov = coverage(`${title} ${content}`, coreTerms);
        const central = titleCentrality(title, coreTerms);
        const penalty = specificityPenalty({ title, content }, general, coreTerms);
        const topic: Topic = {
          id: seed.id,
          topicNumber: null,
          title,
          content,
          year: seed.year ?? null,
          sourceType: seed.sourceType ?? null,
          sourceTitle: seed.sourceTitle ?? null,
          pageStart: seed.pageStart ?? null,
          pageEnd: seed.pageEnd ?? null,
          category: seed.category ?? null,
          keywords: [],
          origin: seed.origin,
          seedPriority: seed.priority,
          baseScore: Number(seed.score || 0),
          coverage: cov,
          centrality: central,
          specificityPenalty: penalty,
          rankingScore: seed.priority + cov * 110 + central - penalty,
          preview: "",
        };
        topic.preview = bestPassage(topic, question, coreTerms);
        return topic;
      }
    }),
  );

  return rows
    .filter((topic) => topic.content || topic.title)
    .sort((a, b) => b.rankingScore - a.rankingScore || Number(b.year || 0) - Number(a.year || 0));
}

function centralAndSpecific(topics: Topic[], question: string) {
  if (!isGeneralQuestion(question)) return { central: topics, specific: [] as Topic[] };

  const central: Topic[] = [];
  const specific: Topic[] = [];

  for (const topic of topics) {
    if (topic.specificityPenalty >= 22) specific.push(topic);
    else central.push(topic);
  }

  return { central, specific };
}

function chosenSentences(topics: Topic[], coreTerms: string[], question: string) {
  const candidates: Array<{
    sentence: string;
    topicId: number;
    topicTitle: string;
    sourceLabel: string;
    score: number;
  }> = [];

  for (const topic of topics.slice(0, 5)) {
    const sentences = sentenceList(topic.content);
    for (const sentence of sentences) {
      const score =
        sentenceScore(sentence, coreTerms, isGeneralQuestion(question)) +
        topic.rankingScore / 40;

      if (score >= 12) {
        candidates.push({
          sentence,
          topicId: topic.id,
          topicTitle: topic.title,
          sourceLabel: [
            topic.year || null,
            topic.sourceType || null,
            topic.sourceTitle || null,
            topic.pageStart ? `pág. ${topic.pageStart}` : null,
          ].filter(Boolean).join(" · "),
          score,
        });
      }
    }
  }

  const selected: typeof candidates = [];
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    const nc = norm(candidate.sentence);
    if (selected.some((existing) => similarity(nc, norm(existing.sentence)) >= 0.78)) continue;
    selected.push(candidate);
    if (selected.length >= 5) break;
  }

  return selected;
}

function composeDirect(base: AnyRow, selected: ReturnType<typeof chosenSentences>) {
  const approvedShort = clean(base?.shortAnswer || "");
  if (base?.fromQuestionBank && approvedShort) return approvedShort;

  if (!selected.length) {
    const fallback = clean(base?.answer || "");
    if (fallback && !/^foram encontrados \d+ registros/i.test(fallback)) return fallback;
    return "Os registros localizados não permitem formar uma resposta objetiva sem ampliar a leitura das fontes abaixo.";
  }

  const body = selected.slice(0, 3).map((item) => item.sentence).join(" ");
  return `Segundo os registros mais diretamente relacionados à pergunta, ${body.charAt(0).toLocaleLowerCase("pt-BR")}${body.slice(1)}`;
}

function bibleAliasRows(books: AnyRow[]) {
  const map = new Map<string, string>();
  for (const book of books) {
    const name = clean(book?.name);
    const abbr = clean(book?.abbreviation);
    if (!name) continue;

    const variants = new Set<string>([name, abbr]);
    const n = norm(name);
    const m = n.match(/^([123])\s+(.+)$/);
    const prefix = m ? m[1] : "";
    const core = m ? m[2] : n;
    const word = core.split(" ")[0];

    if (word.length >= 2) {
      variants.add(`${prefix}${word.slice(0, 2)}`);
      variants.add(`${prefix} ${word.slice(0, 2)}`);
    }
    if (word.length >= 3) {
      variants.add(`${prefix}${word.slice(0, 3)}`);
      variants.add(`${prefix} ${word.slice(0, 3)}`);
    }
    if (word.length >= 4) {
      variants.add(`${prefix}${word.slice(0, 4)}`);
      variants.add(`${prefix} ${word.slice(0, 4)}`);
    }

    for (const variant of variants) {
      const key = norm(variant).replace(/\s+/g, "");
      if (key.length >= 2) map.set(key, name);
    }
  }
  return map;
}

function findBibleRefs(texts: Array<{ text: string; topicId?: number }>, books: AnyRow[]) {
  const aliases = bibleAliasRows(books);
  const regex = /(^|[^\p{L}\p{N}])([123]?\s*[A-Za-zÀ-ÿ]{2,18}\.?)\s*(\d{1,3})\s*[:.,]\s*(\d{1,3})(?:\s*(?:-|–|—|a|e)\s*(\d{1,3}))?/giu;
  const found = new Map<string, AnyRow>();

  for (const block of texts) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(block.text))) {
      const key = norm(match[2]).replace(/\s+/g, "");
      let book = aliases.get(key);

      if (!book && key.length >= 3) {
        for (const [alias, canonical] of aliases.entries()) {
          if (alias.startsWith(key)) {
            book = canonical;
            break;
          }
        }
      }

      if (!book) continue;

      const chapter = Number(match[3]);
      const verseStart = Number(match[4]);
      const verseEnd = match[5] ? Number(match[5]) : verseStart;
      const reference = `${book} ${chapter}:${verseStart}${verseEnd !== verseStart ? `-${verseEnd}` : ""}`;
      const current = found.get(reference);

      if (current) {
        current.mentions++;
        if (block.topicId && !current.topicIds.includes(block.topicId)) current.topicIds.push(block.topicId);
      } else {
        found.set(reference, {
          reference,
          book,
          chapter,
          verseStart,
          verseEnd,
          mentions: 1,
          topicIds: block.topicId ? [block.topicId] : [],
        });
      }
    }
  }

  return [...found.values()]
    .sort((a, b) => b.mentions - a.mentions || a.reference.localeCompare(b.reference, "pt-BR"))
    .slice(0, 28);
}

async function books(origin: string) {
  try {
    const { response, data } = await jsonFetch(`${origin}/api/bible/books`);
    return response.ok && Array.isArray(data?.books) ? data.books : [];
  } catch {
    return [];
  }
}

async function hydrateBible(origin: string, refs: AnyRow[]): Promise<AnyRow[]> {
  return Promise.all(
    refs.map(async (ref, index) => {
      if (index >= 14) return { ...ref, verses: [] };
      try {
        const { response, data } = await jsonFetch(
          `${origin}/api/bible/search?q=${encodeURIComponent(ref.reference)}&limit=25`,
        );
        if (!response.ok) return { ...ref, verses: [] };

        const items = Array.isArray(data?.items) ? data.items : [];
        const exact = items.filter((item: AnyRow) => {
          if (norm(String(item.book)) !== norm(String(ref.book))) return false;
          if (Number(item.chapter) !== Number(ref.chapter)) return false;
          const verse = Number(item.verse);
          return verse >= Number(ref.verseStart) && verse <= Number(ref.verseEnd);
        });

        return {
          ...ref,
          verses: exact.slice(0, 20).map((item: AnyRow) => ({
            id: Number(item.id),
            book: item.book,
            bookOrder: Number(item.book_order),
            chapter: Number(item.chapter),
            verse: Number(item.verse),
            text: item.text,
            pdfPage: item.pdf_page ? Number(item.pdf_page) : null,
          })),
        };
      } catch {
        return { ...ref, verses: [] };
      }
    }),
  );
}

function strength(topics: Topic[]) {
  const sources = new Set(
    topics.map((topic) => `${topic.year || ""}|${topic.sourceTitle || topic.sourceType || topic.id}`),
  );
  if (sources.size >= 4) return "forte";
  if (sources.size >= 2) return "moderada";
  if (sources.size === 1) return "limitada";
  return "sem fonte documental";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const question = clean(body?.question);
    const sort = ["relevance", "oldest", "recent"].includes(body?.sort) ? body.sort : "relevance";

    if (!question) {
      return NextResponse.json({ error: "Digite uma pergunta." }, { status: 400 });
    }

    const origin = request.nextUrl.origin;

    const [
      { response: baseResponse, data: base },
      { data: smart },
      bibleBooks,
    ] = await Promise.all([
      jsonFetch(`${origin}/api/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: request.headers.get("cookie") || "",
        },
        body: JSON.stringify({ question, sort }),
      }),
      jsonFetch(`${origin}/api/search/smart?q=${encodeURIComponent(question)}&sort=${encodeURIComponent(sort)}&limit=18`),
      books(origin),
    ]);

    if (!baseResponse.ok) {
      return NextResponse.json(
        { error: base?.error || "Não foi possível consultar o acervo." },
        { status: baseResponse.status },
      );
    }

    const coreTerms = terms(question, base);
    const hydrated = await hydrate(origin, collectSeeds(base, smart), question, coreTerms);
    const grouped = groupRepeats(hydrated);
    const { central, specific } = centralAndSpecific(grouped, question);

    const ordered =
      sort === "oldest"
        ? [...central].sort((a, b) => Number(a.year || 9999) - Number(b.year || 9999))
        : sort === "recent"
          ? [...central].sort((a, b) => Number(b.year || 0) - Number(a.year || 0))
          : central;

    const selected = chosenSentences(ordered, coreTerms, question);
    const direct = composeDirect(base, selected);
    const approvedFull = base?.fromQuestionBank ? clean(base?.fullAnswer || "") : "";

    const answerSections = selected.map((item, index) => ({
      order: index + 1,
      topicId: item.topicId,
      topicTitle: item.topicTitle,
      text: item.sentence,
      sourceLabel: item.sourceLabel,
    }));

    const topicReferences = ordered.slice(0, 10).map((topic) => ({
      topicId: topic.id,
      topicNumber: topic.topicNumber,
      title: topic.title,
      year: topic.year,
      sourceType: topic.sourceType,
      sourceTitle: topic.sourceTitle,
      page: topic.pageStart,
      pageEnd: topic.pageEnd,
      category: topic.category,
      keywords: topic.keywords,
      preview: topic.preview,
      contentLength: topic.content.length,
      fullTopicAvailable: topic.content.length > 0,
      fullTopicEndpoint: `/api/topic/${topic.id}`,
      coverage: topic.coverage,
      rankingScore: topic.rankingScore,
      repeatedIn: topic.repeatedIn || [],
    }));

    const specificGuidance = specific.slice(0, 6).map((topic) => ({
      topicId: topic.id,
      topicNumber: topic.topicNumber,
      title: topic.title,
      year: topic.year,
      sourceType: topic.sourceType,
      sourceTitle: topic.sourceTitle,
      page: topic.pageStart,
      pageEnd: topic.pageEnd,
      preview: topic.preview,
      fullTopicEndpoint: `/api/topic/${topic.id}`,
    }));

    const sourceRows = uniq(
      [...ordered.slice(0, 10), ...specific.slice(0, 4)].map((topic) => ({
        id: `topic-${topic.id}`,
        topicId: topic.id,
        title: topic.sourceTitle || topic.title,
        sourceType: topic.sourceType,
        year: topic.year,
        page: topic.pageStart,
        pageEnd: topic.pageEnd,
        citationText: topic.preview,
      })),
      (row) => `${row.topicId}|${row.title}|${row.year || ""}|${row.page || ""}`,
    );

    const bibleBlocks = [
      { text: clean(base?.shortAnswer || "") },
      { text: clean(base?.fullAnswer || "") },
      ...ordered.slice(0, 9).map((topic) => ({ text: topic.content, topicId: topic.id })),
      ...specific.slice(0, 3).map((topic) => ({ text: topic.content, topicId: topic.id })),
    ];

    const biblicalReferences = await hydrateBible(
      origin,
      findBibleRefs(bibleBlocks, bibleBooks),
    );

    const bibleSummary = biblicalReferences.slice(0, 8).map((ref) => ref.reference);

    try {
      await fetch(`${origin}/api/usage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "ask",
          query: question,
          resultCount: Number(smart?.total || base?.total || grouped.length || 0),
          sourcePage: "/perguntar",
          metadata: {
            answerEngine: "v8.3-documental-advanced",
            centralTopics: ordered.length,
            specificTopics: specific.length,
            bibleReferences: biblicalReferences.length,
            groupedRepeats: hydrated.length - grouped.length,
          },
        }),
      });
    } catch {}

    return NextResponse.json({
      ...base,
      question,
      answer: direct,
      naturalAnswer: direct,
      detailedAnswer: approvedFull,
      answerSections,
      biblicalReferences,
      bibleSummary,
      topicReferences,
      specificGuidance,
      documentarySources: sourceRows,
      documentaryStrength: strength([...ordered, ...specific]),
      sourceCount: sourceRows.length,
      fullTopicCount: hydrated.filter((topic) => topic.content.length > 0).length,
      searchedTotal: Number(smart?.total || base?.total || 0),
      interpretedTerms: coreTerms,
      answerEngine: "v8.3-documental-advanced",
      answerOrigin: base?.fromQuestionBank ? "question-bank" : "documentary-synthesis",
      explicitBibleReferencesOnly: true,
      groupedRepeatCount: hydrated.length - grouped.length,
      documentaryNote: `${hydrated.filter((topic) => topic.content.length > 0).length} tópico(s) foram lidos integralmente. Os registros gerais foram priorizados e orientações de situações específicas foram separadas da resposta principal.`,
    });
  } catch (error) {
    console.error("Erro em /api/ask/natural V8.3:", error);
    return NextResponse.json(
      { error: "Não foi possível preparar a resposta documental avançada." },
      { status: 500 },
    );
  }
}

