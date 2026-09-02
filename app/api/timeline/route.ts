import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SearchItem = {
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

type SearchResponse = {
  items?: SearchItem[];
  total?: number;
  hasMore?: boolean;
  expandedTerms?: string[];
};

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim() || "";

    if (q.length < 2) {
      return NextResponse.json(
        { error: "Digite ao menos 2 caracteres para montar a linha do tempo." },
        { status: 400 }
      );
    }

    const origin = request.nextUrl.origin;
    const collected = new Map<string, SearchItem>();
    const expanded: string[] = [];
    const pageSize = 100;
    const maxItems = 300;

    for (let offset = 0; offset < maxItems; offset += pageSize) {
      const params = new URLSearchParams({
        q,
        sort: "oldest",
        limit: String(pageSize),
        offset: String(offset),
      });

      const response = await fetch(`${origin}/api/search?${params.toString()}`, {
        cache: "no-store",
        headers: { "x-timeline": "1" },
      });

      if (!response.ok) {
        throw new Error("Falha ao consultar o acervo.");
      }

      const data = (await response.json()) as SearchResponse;
      expanded.push(...(data.expandedTerms || []));

      for (const item of data.items || []) {
        collected.set(String(item.id), item);
      }

      if (!data.hasMore || !(data.items || []).length) break;
    }

    const items = [...collected.values()].sort((a, b) => {
      const ay = Number(a.year || 9999);
      const by = Number(b.year || 9999);
      if (ay !== by) return ay - by;

      const ap = Number(a.page_start || 999999);
      const bp = Number(b.page_start || 999999);
      if (ap !== bp) return ap - bp;

      return String(a.title || "").localeCompare(String(b.title || ""), "pt-BR");
    });

    const byYear = new Map<string, SearchItem[]>();

    for (const item of items) {
      const key = item.year ? String(item.year) : "Sem ano";
      const arr = byYear.get(key) || [];
      arr.push(item);
      byYear.set(key, arr);
    }

    const years = [...byYear.entries()]
      .map(([year, records]) => ({
        year,
        count: records.length,
        records,
      }))
      .sort((a, b) => {
        if (a.year === "Sem ano") return 1;
        if (b.year === "Sem ano") return -1;
        return Number(a.year) - Number(b.year);
      });

    const numericYears = years
      .map((x) => Number(x.year))
      .filter((x) => Number.isFinite(x));

    return NextResponse.json({
      query: q,
      total: items.length,
      years,
      firstYear: numericYears.length ? Math.min(...numericYears) : null,
      lastYear: numericYears.length ? Math.max(...numericYears) : null,
      expandedTerms: unique(expanded).slice(0, 20),
      limited: collected.size >= maxItems,
    });
  } catch (error) {
    console.error("Linha do Tempo:", error);
    return NextResponse.json(
      { error: "Não foi possível montar a linha do tempo neste momento." },
      { status: 500 }
    );
  }
}
