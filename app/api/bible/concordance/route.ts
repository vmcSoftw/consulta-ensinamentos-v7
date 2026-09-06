import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL não configurada.");

const sql = neon(databaseUrl);

const ACCENTS_FROM = "ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ";
const ACCENTS_TO   = "AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}



type VerseRow = {
  id: number | string;
  book_order: number | string;
  book: string;
  abbreviation: string;
  testament: string;
  chapter: number | string;
  verse: number | string;
  text: string;
  pdf_page: number | string | null;
};

type CountRow = {
  book_order: number | string;
  book: string;
  abbreviation: string;
  testament: string;
  total: number | string;
};

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim() || "";
    const testament = request.nextUrl.searchParams.get("testament")?.trim() || "all";
    const mode = request.nextUrl.searchParams.get("mode") === "all" ? "all" : "exact";
    const book = Number(request.nextUrl.searchParams.get("book") || 0);
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 120), 1), 300);
    const offset = Math.max(Number(request.nextUrl.searchParams.get("offset") || 0), 0);

    if (!q) {
      return NextResponse.json({
        query: "",
        mode,
        testament,
        total: 0,
        items: [],
        books: [],
      });
    }

    const normalized = normalize(q);
    const tokens = normalized.split(" ").filter((token) => token.length >= 2);

    if (!normalized || !tokens.length) {
      return NextResponse.json({ error: "Digite uma palavra ou expressão válida." }, { status: 400 });
    }


    // A consulta permanece documental: nenhuma relação bíblica é inventada.
    // exact = ocorrência literal da palavra/frase (ignorando acentos e caixa)
    // all   = todos os termos pesquisados no mesmo versículo
    let rows: VerseRow[] = [];
    let counts: CountRow[] = [];
    let total = 0;

    if (mode === "exact") {
      const regexPattern =
        "(^|[^a-z0-9])" +
        tokens.join("[^a-z0-9]+") +
        "([^a-z0-9]|$)";

      const result = await sql`
        SELECT
          v.id,
          v.book_order,
          b.name AS book,
          b.abbreviation,
          b.testament,
          v.chapter,
          v.verse,
          v.text,
          v.pdf_page
        FROM bible_verses v
        JOIN bible_books b ON b.id = v.book_id
        WHERE lower(translate(v.text, ${ACCENTS_FROM}, ${ACCENTS_TO})) ~ ${regexPattern}
          AND (${testament} = 'all' OR b.testament = ${testament})
          AND (${book} = 0 OR v.book_order = ${book})
        ORDER BY v.book_order, v.chapter, v.verse
        LIMIT ${limit} OFFSET ${offset}
      `;
      rows = result as VerseRow[];

      const countResult = await sql`
        SELECT COUNT(*)::int AS total
        FROM bible_verses v
        JOIN bible_books b ON b.id = v.book_id
        WHERE lower(translate(v.text, ${ACCENTS_FROM}, ${ACCENTS_TO})) ~ ${regexPattern}
          AND (${testament} = 'all' OR b.testament = ${testament})
          AND (${book} = 0 OR v.book_order = ${book})
      `;
      total = Number((countResult[0] as { total: number | string })?.total || 0);

      const countRows = await sql`
        SELECT
          v.book_order,
          b.name AS book,
          b.abbreviation,
          b.testament,
          COUNT(*)::int AS total
        FROM bible_verses v
        JOIN bible_books b ON b.id = v.book_id
        WHERE lower(translate(v.text, ${ACCENTS_FROM}, ${ACCENTS_TO})) ~ ${regexPattern}
          AND (${testament} = 'all' OR b.testament = ${testament})
        GROUP BY v.book_order, b.name, b.abbreviation, b.testament
        ORDER BY v.book_order
      `;
      counts = countRows as CountRow[];
    } else {
      const result = await sql`
        SELECT
          v.id,
          v.book_order,
          b.name AS book,
          b.abbreviation,
          b.testament,
          v.chapter,
          v.verse,
          v.text,
          v.pdf_page
        FROM bible_verses v
        JOIN bible_books b ON b.id = v.book_id
        WHERE to_tsvector('portuguese', v.text) @@ plainto_tsquery('portuguese', ${q})
          AND (${testament} = 'all' OR b.testament = ${testament})
          AND (${book} = 0 OR v.book_order = ${book})
        ORDER BY v.book_order, v.chapter, v.verse
        LIMIT ${limit} OFFSET ${offset}
      `;
      rows = result as VerseRow[];

      const countResult = await sql`
        SELECT COUNT(*)::int AS total
        FROM bible_verses v
        JOIN bible_books b ON b.id = v.book_id
        WHERE to_tsvector('portuguese', v.text) @@ plainto_tsquery('portuguese', ${q})
          AND (${testament} = 'all' OR b.testament = ${testament})
          AND (${book} = 0 OR v.book_order = ${book})
      `;
      total = Number((countResult[0] as { total: number | string })?.total || 0);

      const countRows = await sql`
        SELECT
          v.book_order,
          b.name AS book,
          b.abbreviation,
          b.testament,
          COUNT(*)::int AS total
        FROM bible_verses v
        JOIN bible_books b ON b.id = v.book_id
        WHERE to_tsvector('portuguese', v.text) @@ plainto_tsquery('portuguese', ${q})
          AND (${testament} = 'all' OR b.testament = ${testament})
        GROUP BY v.book_order, b.name, b.abbreviation, b.testament
        ORDER BY v.book_order
      `;
      counts = countRows as CountRow[];
    }

    return NextResponse.json({
      query: q,
      normalized,
      mode,
      testament,
      total,
      offset,
      limit,
      hasMore: offset + rows.length < total,
      books: counts.map((row) => ({
        order: Number(row.book_order),
        name: row.book,
        abbreviation: row.abbreviation,
        testament: row.testament,
        total: Number(row.total || 0),
      })),
      items: rows.map((row) => ({
        id: Number(row.id),
        bookOrder: Number(row.book_order),
        book: row.book,
        abbreviation: row.abbreviation,
        testament: row.testament,
        chapter: Number(row.chapter),
        verse: Number(row.verse),
        text: row.text,
        pdfPage: row.pdf_page === null ? null : Number(row.pdf_page),
        reference: `${row.book} ${row.chapter}:${row.verse}`,
      })),
    });
  } catch (error) {
    console.error("Erro em /api/bible/concordance:", error);
    return NextResponse.json(
      { error: "Não foi possível consultar as concordâncias bíblicas." },
      { status: 500 },
    );
  }
}
