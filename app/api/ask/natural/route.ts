import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type GenericRecord = Record<string, any>;

function cleanText(value: unknown) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function naturalizeLead(text: string) {
  const cleaned = cleanText(text);
  if (!cleaned) return "";
  if (/^(de acordo|conforme|o acervo|os registros|a bíblia|a escritura|não foi|não há|sim\b|não\b)/i.test(cleaned)) {
    return cleaned;
  }
  const first = cleaned.charAt(0).toLocaleLowerCase("pt-BR") + cleaned.slice(1);
  return `De acordo com os registros localizados no acervo, ${first}`;
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function normalizeBookAlias(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]/g, "");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getBibleCatalog(origin: string) {
  try {
    const response = await fetch(`${origin}/api/bible/books`, { cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.books) ? data.books : [];
  } catch {
    return [];
  }
}

function findBibleReferences(text: string, books: GenericRecord[]) {
  if (!text || !books.length) return [];

  const aliases: Array<{ alias: string; canonical: string }> = [];
  for (const book of books) {
    const name = String(book?.name || "").trim();
    const abbreviation = String(book?.abbreviation || "").trim();
    if (!name) continue;

    const variants = new Set<string>([
      name,
      abbreviation,
      name.replace(/^([123])(?=\p{L})/u, "$1 "),
      abbreviation.replace(/^([123])(?=\p{L})/u, "$1 "),
    ]);

    for (const variant of variants) {
      if (variant) aliases.push({ alias: variant, canonical: name });
    }
  }

  aliases.sort((a, b) => b.alias.length - a.alias.length);

  const lookup = new Map<string, string>();
  for (const item of aliases) lookup.set(normalizeBookAlias(item.alias), item.canonical);

  const pattern = aliases
    .map((item) => escapeRegex(item.alias).replace(/\ /g, "\\s*"))
    .join("|");

  if (!pattern) return [];

  const regex = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${pattern})\\.?\\s*(\\d{1,3})(?:\\s*[:.,]\\s*(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3}))?)?`,
    "giu",
  );

  const refs: Array<{ reference: string; book: string; chapter: number; verseStart?: number; verseEnd?: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    const canonical = lookup.get(normalizeBookAlias(match[2]));
    if (!canonical) continue;
    const chapter = Number(match[3]);
    const verseStart = match[4] ? Number(match[4]) : undefined;
    const verseEnd = match[5] ? Number(match[5]) : verseStart;

    const reference = `${canonical} ${chapter}${
      verseStart
        ? `:${verseStart}${verseEnd && verseEnd !== verseStart ? `-${verseEnd}` : ""}`
        : ""
    }`;

    refs.push({ reference, book: canonical, chapter, verseStart, verseEnd });
  }

  return uniqueBy(refs, (item) => item.reference).slice(0, 16);
}

async function hydrateBibleReferences(
  origin: string,
  refs: Array<{ reference: string; book: string; chapter: number; verseStart?: number; verseEnd?: number }>,
) {
  const hydrated = await Promise.all(
    refs.map(async (ref) => {
      try {
        const response = await fetch(
          `${origin}/api/bible/search?q=${encodeURIComponent(ref.reference)}&limit=30`,
          { cache: "no-store" },
        );
        if (!response.ok) return { ...ref, verses: [] };
        const data = await response.json();
        return {
          ...ref,
          verses: Array.isArray(data?.items)
            ? data.items.slice(0, 20).map((item: GenericRecord) => ({
                id: Number(item.id),
                book: item.book,
                bookOrder: Number(item.book_order),
                chapter: Number(item.chapter),
                verse: Number(item.verse),
                text: item.text,
                pdfPage: item.pdf_page ? Number(item.pdf_page) : null,
              }))
            : [],
        };
      } catch {
        return { ...ref, verses: [] };
      }
    }),
  );
  return hydrated;
}

function buildTopicReferences(base: GenericRecord) {
  const fromEvidence = (Array.isArray(base?.evidence) ? base.evidence : [])
    .filter((item: GenericRecord) => item?.topicId)
    .map((item: GenericRecord) => ({
      topicId: Number(item.topicId),
      title: cleanText(item.title) || "Tópico documental",
      year: item.year ?? null,
      sourceType: item.sourceType ?? null,
      sourceTitle: item.sourceTitle ?? null,
      page: item.page ?? null,
      excerpt: cleanText(item.text),
      strictMatch: Boolean(item.strictMatch),
      coverage: Number(item.coverage || 0),
    }));

  const fromBank = (Array.isArray(base?.bankSources) ? base.bankSources : [])
    .filter((item: GenericRecord) => item?.topicId)
    .map((item: GenericRecord) => ({
      topicId: Number(item.topicId),
      title: cleanText(item.sourceTitle) || "Tópico vinculado ao Banco de Perguntas",
      year: item.sourceYear ?? null,
      sourceType: item.sourceType ?? null,
      sourceTitle: item.sourceTitle ?? null,
      page: item.pageStart ?? null,
      excerpt: cleanText(item.citationText),
      strictMatch: true,
      coverage: 1,
    }));

  return uniqueBy([...fromBank, ...fromEvidence], (item) => String(item.topicId)).slice(0, 16);
}

function buildSources(base: GenericRecord) {
  const bank = (Array.isArray(base?.bankSources) ? base.bankSources : []).map((item: GenericRecord) => ({
    id: item.id ?? null,
    topicId: item.topicId ?? null,
    title: cleanText(item.sourceTitle) || cleanText(item.sourceType) || "Fonte documental",
    sourceType: item.sourceType ?? null,
    year: item.sourceYear ?? null,
    page: item.pageStart ?? null,
    citationText: cleanText(item.citationText),
  }));

  const evidence = (Array.isArray(base?.evidence) ? base.evidence : []).map((item: GenericRecord, index: number) => ({
    id: `ev-${item.topicId || index}`,
    topicId: item.topicId ?? null,
    title: cleanText(item.sourceTitle) || cleanText(item.title) || "Fonte documental",
    sourceType: item.sourceType ?? null,
    year: item.year ?? null,
    page: item.page ?? null,
    citationText: cleanText(item.text),
  }));

  return uniqueBy([...bank, ...evidence], (item) =>
    `${item.topicId || ""}|${item.title}|${item.year || ""}|${item.page || ""}`,
  ).slice(0, 20);
}

function buildNaturalAnswer(base: GenericRecord) {
  const shortAnswer = cleanText(base?.shortAnswer || base?.answer);
  const fullAnswer = cleanText(base?.fullAnswer || base?.answer);

  const direct = naturalizeLead(shortAnswer);
  const detailed = fullAnswer && fullAnswer !== shortAnswer ? fullAnswer : "";

  const evidence = Array.isArray(base?.evidence) ? base.evidence : [];
  const strongest = evidence
    .slice()
    .sort((a: GenericRecord, b: GenericRecord) => Number(b.coverage || 0) - Number(a.coverage || 0))
    .slice(0, 3);

  let documentaryNote = "";
  if (strongest.length) {
    const labels = strongest
      .map((item: GenericRecord) => {
        const year = item.year ? String(item.year) : "";
        const title = cleanText(item.title);
        return [year, title].filter(Boolean).join(" · ");
      })
      .filter(Boolean);
    if (labels.length) {
      documentaryNote = `A base documental principal desta resposta está nos registros: ${labels.join("; ")}.`;
    }
  }

  return { direct, detailed, documentaryNote };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const question = cleanText(body?.question);
    const sort = body?.sort || "relevance";

    if (!question) {
      return NextResponse.json({ error: "Digite uma pergunta." }, { status: 400 });
    }

    const origin = request.nextUrl.origin;

    const baseResponse = await fetch(`${origin}/api/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") || "",
      },
      body: JSON.stringify({ question, sort }),
      cache: "no-store",
    });

    const base = await baseResponse.json();

    if (!baseResponse.ok) {
      return NextResponse.json(
        { error: base?.error || "Não foi possível consultar o acervo." },
        { status: baseResponse.status },
      );
    }

    const topics = buildTopicReferences(base);
    const sources = buildSources(base);
    const natural = buildNaturalAnswer(base);

    const bibleCatalog = await getBibleCatalog(origin);

    const corpusForRefs = [
      natural.direct,
      natural.detailed,
      ...topics.map((item) => `${item.title}\n${item.excerpt}`),
      ...sources.map((item) => item.citationText),
    ].join("\n\n");

    const explicitBibleRefs = findBibleReferences(corpusForRefs, bibleCatalog);
    const biblicalReferences = await hydrateBibleReferences(origin, explicitBibleRefs);

    const sourceCount = sources.length;
    const documentaryStrength =
      sourceCount >= 3 ? "forte" :
      sourceCount === 2 ? "moderada" :
      sourceCount === 1 ? "limitada" : "sem fonte cadastrada";

    try {
      await fetch(`${origin}/api/usage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "ask",
          query: question,
          resultCount: Number(base?.total || topics.length || 0),
          sourcePage: "/perguntar",
          metadata: {
            naturalAnswer: true,
            fromQuestionBank: Boolean(base?.fromQuestionBank),
            biblicalReferences: biblicalReferences.length,
            topicReferences: topics.length,
          },
        }),
      });
    } catch {}

    return NextResponse.json({
      ...base,
      question,
      answer: natural.direct || cleanText(base?.answer),
      naturalAnswer: natural.direct || cleanText(base?.answer),
      detailedAnswer: natural.detailed,
      documentaryNote: natural.documentaryNote,
      biblicalReferences,
      topicReferences: topics,
      documentarySources: sources,
      documentaryStrength,
      sourceCount,
      answerOrigin: base?.fromQuestionBank ? "question-bank" : "documentary-search",
      explicitBibleReferencesOnly: true,
    });
  } catch (error) {
    console.error("Erro em /api/ask/natural:", error);
    return NextResponse.json(
      { error: "Não foi possível montar a resposta documental enriquecida." },
      { status: 500 },
    );
  }
}
