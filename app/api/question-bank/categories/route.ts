import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL não configurada.");
}

const sql = neon(databaseUrl);

type CategoryRow = {
  id: number | string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number | string;
  count: number | string;
};

type SubcategoryRow = {
  id: number | string;
  category_id: number | string;
  slug: string;
  name: string;
  sort_order: number | string;
  count: number | string;
};

type QuestionRow = {
  id: number | string;
  canonical_question: string;
  normalized_question: string;
  category_id: number | string | null;
  subcategory_id: number | string | null;
  category_slug: string | null;
  category_name: string | null;
  subcategory_slug: string | null;
  subcategory_name: string | null;
  short_answer: string | null;
  full_answer: string | null;
  source_count: number | string;
};

type AssignmentRow = {
  id: number | string;
  category_id: number | string | null;
  subcategory_id: number | string | null;
  category_slug: string | null;
  category_name: string | null;
  subcategory_slug: string | null;
  subcategory_name: string | null;
};

function numberValue(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

async function hasAdminSession(request: NextRequest) {
  try {
    const response = await fetch(new URL("/api/admin/session", request.nextUrl.origin), {
      method: "GET",
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
      cache: "no-store",
    });

    if (!response.ok) return false;
    const data = (await response.json()) as { authenticated?: boolean };
    return Boolean(data.authenticated);
  } catch {
    return false;
  }
}

async function readCategories() {
  const categoryRows = (await sql`
    SELECT
      c.id,
      c.slug,
      c.name,
      c.description,
      c.sort_order,
      COUNT(q.id) FILTER (WHERE q.status = 'approved')::int AS count
    FROM question_bank_categories c
    LEFT JOIN question_bank_questions q ON q.category_id = c.id
    WHERE c.is_active = TRUE
    GROUP BY c.id, c.slug, c.name, c.description, c.sort_order
    ORDER BY c.sort_order, c.name
  `) as CategoryRow[];

  const subcategoryRows = (await sql`
    SELECT
      sc.id,
      sc.category_id,
      sc.slug,
      sc.name,
      sc.sort_order,
      COUNT(q.id) FILTER (WHERE q.status = 'approved')::int AS count
    FROM question_bank_subcategories sc
    LEFT JOIN question_bank_questions q ON q.subcategory_id = sc.id
    WHERE sc.is_active = TRUE
    GROUP BY sc.id, sc.category_id, sc.slug, sc.name, sc.sort_order
    ORDER BY sc.category_id, sc.sort_order, sc.name
  `) as SubcategoryRow[];

  return categoryRows.map((category) => ({
    id: Number(category.id),
    slug: category.slug,
    name: category.name,
    description: category.description,
    count: Number(category.count || 0),
    subcategories: subcategoryRows
      .filter((subcategory) => Number(subcategory.category_id) === Number(category.id))
      .map((subcategory) => ({
        id: Number(subcategory.id),
        slug: subcategory.slug,
        name: subcategory.name,
        count: Number(subcategory.count || 0),
      })),
  }));
}

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q")?.trim() || "";
    const category = request.nextUrl.searchParams.get("category")?.trim() || "all";
    const subcategory = request.nextUrl.searchParams.get("subcategory")?.trim() || "all";
    const adminMode = request.nextUrl.searchParams.get("admin") === "1";

    if (!(await hasAdminSession(request))) {
      return NextResponse.json({ error: "Acesso restrito ao Banco de Perguntas." }, { status: 401 });
    }

    const [categories, questionRows] = await Promise.all([
      readCategories(),
      sql`
        SELECT
          q.id,
          q.canonical_question,
          q.normalized_question,
          q.category_id,
          q.subcategory_id,
          c.slug AS category_slug,
          c.name AS category_name,
          sc.slug AS subcategory_slug,
          sc.name AS subcategory_name,
          ans.short_answer,
          ans.full_answer,
          (
            SELECT COUNT(*)::int
            FROM question_bank_sources src
            WHERE src.question_id = q.id
          ) AS source_count
        FROM question_bank_questions q
        LEFT JOIN question_bank_categories c ON c.id = q.category_id
        LEFT JOIN question_bank_subcategories sc ON sc.id = q.subcategory_id
        LEFT JOIN LATERAL (
          SELECT a.short_answer, a.full_answer
          FROM question_bank_answers a
          WHERE a.question_id = q.id
            AND a.status = 'approved'
          ORDER BY a.version DESC, a.id DESC
          LIMIT 1
        ) ans ON TRUE
        WHERE q.status = 'approved'
        ORDER BY q.updated_at DESC, q.id DESC
      `,
    ]);

    const normalizedSearch = normalizeText(query);
    const searchTokens = normalizedSearch.split(" ").filter((token) => token.length >= 2);

    const items = (questionRows as QuestionRow[])
      .filter((row) => {
        if (category !== "all" && row.category_slug !== category) return false;
        if (subcategory !== "all" && row.subcategory_slug !== subcategory) return false;

        if (!normalizedSearch) return true;

        const searchable = normalizeText(
          [row.canonical_question, row.short_answer || "", row.full_answer || ""].join(" "),
        );
        return (
          searchable.includes(normalizedSearch) ||
          searchTokens.every((token) => searchable.includes(token))
        );
      })
      .map((row) => ({
        id: Number(row.id),
        question: row.canonical_question,
        shortAnswer: row.short_answer || row.full_answer || "",
        sourceCount: Number(row.source_count || 0),
        categoryId: numberValue(row.category_id),
        categorySlug: row.category_slug,
        categoryName: row.category_name,
        subcategoryId: numberValue(row.subcategory_id),
        subcategorySlug: row.subcategory_slug,
        subcategoryName: row.subcategory_name,
      }));

    let assignments: Record<
      string,
      {
        categoryId: number | null;
        subcategoryId: number | null;
        categorySlug: string | null;
        categoryName: string | null;
        subcategorySlug: string | null;
        subcategoryName: string | null;
      }
    > = {};

    if (adminMode) {
      const assignmentRows = (await sql`
        SELECT
          q.id,
          q.category_id,
          q.subcategory_id,
          c.slug AS category_slug,
          c.name AS category_name,
          sc.slug AS subcategory_slug,
          sc.name AS subcategory_name
        FROM question_bank_questions q
        LEFT JOIN question_bank_categories c ON c.id = q.category_id
        LEFT JOIN question_bank_subcategories sc ON sc.id = q.subcategory_id
        ORDER BY q.id
      `) as AssignmentRow[];

      assignments = Object.fromEntries(
        assignmentRows.map((row) => [
          String(row.id),
          {
            categoryId: numberValue(row.category_id),
            subcategoryId: numberValue(row.subcategory_id),
            categorySlug: row.category_slug,
            categoryName: row.category_name,
            subcategorySlug: row.subcategory_slug,
            subcategoryName: row.subcategory_name,
          },
        ]),
      );
    }

    return NextResponse.json(
      {
        query,
        category,
        subcategory,
        total: items.length,
        publishedTotal: (questionRows as QuestionRow[]).length,
        items,
        categories,
        assignments,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (cause) {
    console.error("question-bank/categories GET:", cause);
    return NextResponse.json(
      { error: "Não foi possível carregar as categorias do Banco de Perguntas." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await hasAdminSession(request))) {
      return NextResponse.json({ error: "Sessão administrativa expirada." }, { status: 401 });
    }

    const body = (await request.json()) as {
      action?: string;
      questionId?: number | string;
      categoryId?: number | string;
      subcategoryId?: number | string;
    };

    if (body.action !== "assign") {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }

    const questionId = Number(body.questionId);
    const categoryId = Number(body.categoryId);
    const subcategoryId = Number(body.subcategoryId);

    if (
      !Number.isInteger(questionId) ||
      !Number.isInteger(categoryId) ||
      !Number.isInteger(subcategoryId)
    ) {
      return NextResponse.json(
        { error: "Pergunta, categoria e subcategoria são obrigatórias." },
        { status: 400 },
      );
    }

    const valid = (await sql`
      SELECT sc.id
      FROM question_bank_subcategories sc
      JOIN question_bank_categories c ON c.id = sc.category_id
      WHERE c.id = ${categoryId}
        AND sc.id = ${subcategoryId}
        AND c.is_active = TRUE
        AND sc.is_active = TRUE
      LIMIT 1
    `) as Array<{ id: number | string }>;

    if (!valid.length) {
      return NextResponse.json(
        { error: "A subcategoria selecionada não pertence à categoria informada." },
        { status: 400 },
      );
    }

    const updated = await sql`
      UPDATE question_bank_questions
      SET
        category_id = ${categoryId},
        subcategory_id = ${subcategoryId},
        category_source = 'manual-admin',
        updated_at = now()
      WHERE id = ${questionId}
      RETURNING id
    `;

    if (!updated.length) {
      return NextResponse.json({ error: "Pergunta não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: questionId });
  } catch (cause) {
    console.error("question-bank/categories POST:", cause);
    return NextResponse.json(
      { error: "Não foi possível salvar a classificação." },
      { status: 500 },
    );
  }
}
