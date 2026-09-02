import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SortMode = "relevance" | "oldest" | "recent";

type SearchItem = {
  id: string | number;
  year?: number | null;
  source_type?: string | null;
  topic_number?: string | null;
  title?: string | null;
  page_start?: number | null;
  page_end?: number | null;
  category?: string | null;
  source_id?: string | number | null;
  source_title_full?: string | null;
  excerpt?: string | null;
  score?: number | null;
  match_hint?: string | null;
};

type SearchResponse = {
  items?: SearchItem[];
  total?: number;
  expandedTerms?: string[];
};

type Concept = {
  label: string;
  aliases: string[];
};

type Candidate = {
  item: SearchItem;
  searchScore: number;
  queryHits: number;
  matchedTerms: string[];
  strictMatch: boolean;
  coverage: number;
  rankScore: number;
};

const STOP_WORDS = new Set([
  "a","o","as","os","um","uma","uns","umas","de","da","do","das","dos","em","no","na","nos","nas",
  "e","ou","que","qual","quais","como","quando","onde","quem","por","para","pra","com","sem","sobre",
  "ao","aos","à","às","se","ser","estar","é","são","foi","sendo","tem","ter","há","haver","pode","podem",
  "posso","podemos","deve","devem","dever","precisa","precisam","precisar","fazer","feito","feita",
  "usar","uso","existe","existem","ensina","ensinam","ensinamento","ensinamentos","orientação","orientacoes",
  "orientacao","igreja","congregação","congregacao","irmão","irmao","irmã","irma","irmãos","irmaos",
  "ccb","sobre","acerca","respeito","segundo","documento","documentos","tópico","topico"
]);

const CONCEPTS: Concept[] = [
  { label: "batismo", aliases: ["batismo","batismos","batizar","batizado","batizada","batizados","batizadas"] },
  { label: "casamento", aliases: ["casamento","casamentos","casar","casado","casada","casados","casadas","matrimônio","matrimonio","matrimonial","núpcias","nupcias"] },
  { label: "namoro", aliases: ["namoro","namorar","namorando","namorado","namorada","noivado","noivo","noiva"] },
  { label: "divórcio", aliases: ["divórcio","divorcio","divorciado","divorciada","divorciados","divorciadas","separação","separacao","desquite"] },
  { label: "ministério", aliases: ["ministério","ministerio","ancião","anciao","anciães","anciaes","diácono","diacono","diáconos","diaconos","cooperador","cooperadores","obreiro","obreiros"] },
  { label: "barba", aliases: ["barba","barbas","barbado","barbados"] },
  { label: "véu", aliases: ["véu","veu","cobrir a cabeça","cabeça coberta","cabeca coberta"] },
  { label: "oração", aliases: ["oração","oracao","orações","oracoes","orar","orando","joelhos","ajoelhar","ajoelhado"] },
  { label: "Santa Ceia", aliases: ["santa ceia","ceia do senhor","ceia","pão e vinho","pao e vinho"] },
  { label: "mocidade", aliases: ["mocidade","jovem","jovens","rjm","reunião de jovens","reuniao de jovens"] },
  { label: "música", aliases: ["música","musica","hino","hinos","hinário","hinario","instrumento","instrumentos","orquestra"] },
  { label: "Espírito Santo", aliases: ["espírito santo","espirito santo","espírito de deus","espirito de deus"] },
  { label: "línguas", aliases: ["línguas","linguas","novas línguas","novas linguas","falar em línguas","falar em linguas","dom de línguas","dom de linguas"] },
  { label: "evangelização", aliases: ["evangelização","evangelizacao","evangelizar","evangelismo","pregar","pregação","pregacao","anunciar o evangelho"] },
  { label: "pecado", aliases: ["pecado","pecados","pecar","pecaminoso","pecaminosa"] },
  { label: "doutrina", aliases: ["doutrina","doutrinas","ponto de doutrina","pontos de doutrina"] },
  { label: "Santa Palavra", aliases: ["palavra","palavra de deus","buscar palavra","busca da palavra"] },
  { label: "serviço divino", aliases: ["serviço divino","servico divino","culto","cultos","reunião","reuniao"] },
  { label: "vestimenta", aliases: ["vestimenta","vestimentas","roupa","roupas","traje","trajes","aparência","aparencia"] },
  { label: "funeral", aliases: ["funeral","funerais","sepultamento","velório","velorio","enterro"] },
  { label: "família", aliases: ["família","familia","famílias","familias","pais","filhos","filhas","lar"] },
  { label: "bebida alcoólica", aliases: ["bebida alcoólica","bebida alcoolica","álcool","alcool","vinho","cerveja","embriaguez","embriagar"] },
  { label: "tabaco", aliases: ["tabaco","cigarro","cigarros","fumar","fumante","fumo"] },
  { label: "política", aliases: ["política","politica","eleição","eleicao","eleições","eleicoes","candidato","candidatos","partido","partidos"] }
];

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[“”"‘’'`´]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phraseIn(textNorm: string, phrase: string): boolean {
  const p = normalizeText(phrase);
  if (!p) return false;
  return (` ${textNorm} `).includes(` ${p} `);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function significantTokens(question: string): string[] {
  return unique(
    normalizeText(question)
      .split(" ")
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t) && !/^\d+$/.test(t))
  );
}

function detectIntent(question: string): Concept[] {
  const q = normalizeText(question);
  const detected: Concept[] = [];

  for (const concept of CONCEPTS) {
    if (concept.aliases.some((alias) => phraseIn(q, alias))) {
      detected.push(concept);
    }
  }

  const coveredWords = new Set(
    detected.flatMap((c) => c.aliases.flatMap((a) => normalizeText(a).split(" ")))
  );

  for (const token of significantTokens(question)) {
    if (coveredWords.has(token)) continue;
    if (detected.length >= 6) break;
    detected.push({ label: token, aliases: [token] });
  }

  return detected.slice(0, 6);
}

function buildQueries(question: string, concepts: Concept[]): string[] {
  const queries: string[] = [];
  const add = (q: string) => {
    const cleaned = q.replace(/\s+/g, " ").trim();
    if (cleaned && !queries.some((x) => normalizeText(x) === normalizeText(cleaned))) {
      queries.push(cleaned);
    }
  };

  add(question);

  const labels = concepts.map((c) => c.label);
  if (labels.length) add(labels.join(" "));

  // Pares preservam intenção conjunta em perguntas com vários conceitos.
  if (labels.length >= 2) {
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        add(`${labels[i]} ${labels[j]}`);
        if (queries.length >= 5) break;
      }
      if (queries.length >= 5) break;
    }
  }

  // Uma busca individual por conceito evita perder registros históricos
  // que usam apenas uma das formas conhecidas.
  for (const concept of concepts) {
    add(concept.label);
    if (queries.length >= 7) break;
  }

  return queries.slice(0, 7);
}

function conceptMatch(fields: {
  title: string;
  category: string;
  content: string;
  source: string;
}, concept: Concept) {
  const hit = (field: string) => concept.aliases.some((a) => phraseIn(field, a));
  return {
    title: hit(fields.title),
    category: hit(fields.category),
    content: hit(fields.content),
    source: hit(fields.source)
  };
}

function scoreCandidate(item: SearchItem, concepts: Concept[], queryHits: number, searchScore: number): Candidate {
  const fields = {
    title: normalizeText(item.title),
    category: normalizeText(item.category),
    content: normalizeText(item.excerpt),
    source: normalizeText(item.source_title_full)
  };

  const matchedTerms: string[] = [];
  let titleHits = 0;
  let categoryHits = 0;
  let contentHits = 0;
  let sourceHits = 0;

  for (const concept of concepts) {
    const m = conceptMatch(fields, concept);
    if (m.title || m.category || m.content || m.source) {
      matchedTerms.push(concept.label);
      if (m.title) titleHits++;
      if (m.category) categoryHits++;
      if (m.content) contentHits++;
      if (m.source) sourceHits++;
    }
  }

  const denominator = Math.max(1, concepts.length);
  const coverage = matchedTerms.length / denominator;
  const strictMatch = concepts.length > 0 && matchedTerms.length === concepts.length;

  let rankScore = 0;
  rankScore += Math.min(180, Math.max(0, searchScore) * 0.35);
  rankScore += titleHits * 170;
  rankScore += categoryHits * 95;
  rankScore += contentHits * 60;
  rankScore += sourceHits * 18;
  rankScore += coverage * 300;
  rankScore += Math.min(5, queryHits) * 28;
  if (strictMatch) rankScore += 500;

  if (concepts.length >= 2 && coverage < 0.5) rankScore -= 180;
  if (concepts.length >= 3 && coverage < 0.67) rankScore -= 90;

  return {
    item,
    searchScore,
    queryHits,
    matchedTerms,
    strictMatch,
    coverage,
    rankScore
  };
}

function sortCandidates(items: Candidate[], sort: SortMode): Candidate[] {
  return [...items].sort((a, b) => {
    if (sort === "oldest") {
      const ay = Number(a.item.year || 9999);
      const by = Number(b.item.year || 9999);
      return ay - by || b.rankScore - a.rankScore;
    }
    if (sort === "recent") {
      const ay = Number(a.item.year || 0);
      const by = Number(b.item.year || 0);
      return by - ay || b.rankScore - a.rankScore;
    }
    return b.rankScore - a.rankScore || Number(b.item.year || 0) - Number(a.item.year || 0);
  });
}

function diversify(items: Candidate[], max = 12): Candidate[] {
  const selected: Candidate[] = [];
  const perSource = new Map<string, number>();

  for (const candidate of items) {
    const sourceKey = normalizeText(candidate.item.source_title_full || candidate.item.source_id || "sem-fonte");
    const used = perSource.get(sourceKey) || 0;
    if (used >= 2 && selected.length < 8) continue;

    selected.push(candidate);
    perSource.set(sourceKey, used + 1);
    if (selected.length >= max) break;
  }

  return selected;
}

function buildAnswer(question: string, candidates: Candidate[], strictTotal: number, concepts: Concept[]): string {
  if (!candidates.length) {
    return "Não encontrei ensinamento documental suficiente para responder a esta pergunta. Tente usar um termo mais específico ou uma expressão encontrada nos próprios documentos.";
  }

  const years = candidates
    .map((c) => Number(c.item.year || 0))
    .filter((y) => y > 0)
    .sort((a, b) => a - b);

  const period =
    years.length >= 2 && years[0] !== years[years.length - 1]
      ? ` Há registros de diferentes períodos (${years[0]}–${years[years.length - 1]}), por isso é importante consultar cada fonte no seu contexto.`
      : "";

  const conceptText = concepts.length
    ? ` Os conceitos priorizados foram: ${concepts.map((c) => c.label).join(", ")}.`
    : "";

  if (strictTotal > 0) {
    return `Foram encontrados ${strictTotal} registro${strictTotal === 1 ? "" : "s"} que reúne${strictTotal === 1 ? "" : "m"} os principais conceitos da pergunta. Abaixo estão as evidências documentais mais relevantes, sem acrescentar conclusões que não estejam apoiadas no acervo.${conceptText}${period}`;
  }

  return `Não encontrei um registro que reúna todos os conceitos principais ao mesmo tempo. Abaixo estão os documentos com maior aderência parcial à pergunta; leia as fontes antes de tirar uma conclusão.${conceptText}${period}`;
}

function buildSuggestions(concepts: Concept[]): string[] {
  const suggestions: string[] = [];
  for (const c of concepts.slice(0, 3)) {
    suggestions.push(c.label);
    const related = c.aliases
      .filter((a) => normalizeText(a) !== normalizeText(c.label))
      .slice(0, 2);
    suggestions.push(...related);
  }
  if (concepts.length >= 2) {
    suggestions.unshift(`${concepts[0].label} e ${concepts[1].label}`);
  }
  return unique(suggestions).slice(0, 6);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const question = String(body?.question ?? "").trim();
    const sort: SortMode =
      body?.sort === "oldest" || body?.sort === "recent" ? body.sort : "relevance";

    if (question.length < 3) {
      return NextResponse.json(
        { error: "Digite uma pergunta um pouco mais específica." },
        { status: 400 }
      );
    }

    if (question.length > 500) {
      return NextResponse.json(
        { error: "A pergunta está muito longa. Resuma-a em até 500 caracteres." },
        { status: 400 }
      );
    }

    const concepts = detectIntent(question);
    if (!concepts.length) {
      return NextResponse.json(
        { error: "Não consegui identificar os conceitos principais. Tente reformular a pergunta com palavras mais específicas." },
        { status: 400 }
      );
    }

    const queries = buildQueries(question, concepts);
    const origin = request.nextUrl.origin;

    const responses = await Promise.all(
      queries.map(async (query) => {
        const params = new URLSearchParams({
          q: query,
          sort: "relevance",
          limit: "30",
          offset: "0"
        });

        try {
          const res = await fetch(`${origin}/api/search?${params.toString()}`, {
            cache: "no-store",
            headers: { "x-ask-v2": "1" }
          });
          if (!res.ok) return { query, data: { items: [] } as SearchResponse };
          return { query, data: (await res.json()) as SearchResponse };
        } catch {
          return { query, data: { items: [] } as SearchResponse };
        }
      })
    );

    const pool = new Map<string, { item: SearchItem; queryHits: number; bestScore: number }>();
    const expandedFromSearch: string[] = [];

    for (const response of responses) {
      expandedFromSearch.push(...(response.data.expandedTerms || []));
      for (const item of response.data.items || []) {
        const key = String(item.id);
        const current = pool.get(key);
        const score = Number(item.score || 0);

        if (!current) {
          pool.set(key, { item, queryHits: 1, bestScore: score });
        } else {
          current.queryHits++;
          if (score > current.bestScore) {
            current.bestScore = score;
            current.item = item;
          }
        }
      }
    }

    let candidates = [...pool.values()].map((x) =>
      scoreCandidate(x.item, concepts, x.queryHits, x.bestScore)
    );

    // Em perguntas multi-conceito, resultados sem aderência real ficam fora
    // do conjunto ampliado, mesmo que tenham aparecido por expansão do /api/search.
    candidates = candidates.filter((c) =>
      concepts.length === 1 ? c.coverage >= 1 : c.coverage >= 0.34
    );

    const strictTotal = candidates.filter((c) => c.strictMatch).length;
    const ordered = sortCandidates(candidates, sort);
    const evidenceCandidates = diversify(
      strictTotal > 0
        ? [...ordered.filter((c) => c.strictMatch), ...ordered.filter((c) => !c.strictMatch)]
        : ordered,
      12
    );

    const evidence = evidenceCandidates.map((c) => ({
      topicId: String(c.item.id),
      year: c.item.year ?? null,
      sourceType: c.item.source_type || "Documento",
      page: c.item.page_start ?? null,
      title: c.item.topic_number
        ? `${c.item.topic_number}. ${c.item.title || "Tópico"}`
        : c.item.title || "Tópico",
      text: c.item.excerpt || "",
      sourceTitle: c.item.source_title_full || "",
      strictMatch: c.strictMatch,
      coverage: Number(c.coverage.toFixed(3)),
      matchedTerms: c.matchedTerms,
      rankScore: Number(c.rankScore.toFixed(2))
    }));

    const expandedTerms = unique([
      ...concepts.flatMap((c) => c.aliases),
      ...expandedFromSearch
    ])
      .filter((t) => !concepts.some((c) => normalizeText(c.label) === normalizeText(t)))
      .slice(0, 24);

    return NextResponse.json({
      version: "Perguntar V2",
      question,
      answer: buildAnswer(question, evidenceCandidates, strictTotal, concepts),
      strictTotal,
      total: candidates.length,
      coreTerms: concepts.map((c) => c.label),
      expandedTerms,
      evidence,
      suggestions: buildSuggestions(concepts),
      diagnostics: {
        strategies: queries.length,
        candidatePool: pool.size,
        rankedCandidates: candidates.length
      }
    });
  } catch (error) {
    console.error("Perguntar V2:", error);
    return NextResponse.json(
      { error: "Não foi possível consultar o acervo neste momento." },
      { status: 500 }
    );
  }
}
