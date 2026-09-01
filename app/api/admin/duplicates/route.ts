import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { adminConfigured, getValidAdminSession, isSameOriginAdminRequest } from '@/lib/admin';
import { writeAdminAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeIdList(value: unknown) {
  if (!Array.isArray(value)) return [] as number[];
  return [...new Set(value.map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 300);
}

const normalizedTopicContent = `regexp_replace(lower(trim(coalesce(t.content,''))), '\\s+', ' ', 'g')`;
const normalizedTopicTitle = `regexp_replace(lower(trim(coalesce(t.title,''))), '\\s+', ' ', 'g')`;
const normalizedTopicNumber = `regexp_replace(lower(trim(coalesce(t.topic_number,''))), '\\s+', ' ', 'g')`;
const normalizedCategory = `regexp_replace(lower(trim(coalesce(t.category,''))), '\\s+', ' ', 'g')`;
const normalizedSourceType = `regexp_replace(lower(trim(coalesce(s.source_type,''))), '\\s+', ' ', 'g')`;
const normalizedSourceTitle = `regexp_replace(lower(trim(coalesce(s.title,''))), '\\s+', ' ', 'g')`;

async function requireAdmin(req: NextRequest, mutation = false) {
  if (mutation && !isSameOriginAdminRequest(req)) {
    return { error: NextResponse.json({ error: 'Origem da solicitação administrativa não autorizada.' }, { status: 403 }) };
  }
  if (!adminConfigured()) {
    return { error: NextResponse.json({ error: 'Segurança administrativa não configurada.' }, { status: 503 }) };
  }
  const session = await getValidAdminSession(req);
  if (!session) {
    return { error: NextResponse.json({ error: 'Sessão administrativa inválida ou expirada.' }, { status: 401 }) };
  }
  return { session };
}

function distinct(values: Array<string | number | null>) {
  return new Set(values.map(value => value == null ? '∅' : String(value).trim().toLocaleLowerCase('pt-BR'))).size;
}

function reviewReasons(items: any[]) {
  const reasons: string[] = [];
  if (distinct(items.map(item => item.topicNumber)) > 1) reasons.push('Número do tópico diverge');
  if (distinct(items.map(item => item.pageEnd)) > 1) reasons.push('Página final diverge');
  if (distinct(items.map(item => item.category)) > 1) reasons.push('Categoria diverge');
  if (distinct(items.map(item => item.sourceSectionId)) > 1) reasons.push('Vínculo interno de fonte diverge');
  return reasons.length ? reasons : ['Há metadados diferentes entre registros com texto equivalente'];
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  try {
    const rows = (await pool.query(`
      WITH base AS (
        SELECT
          t.id,
          t.source_section_id,
          t.topic_number,
          t.title,
          t.page_start,
          t.page_end,
          t.category,
          left(regexp_replace(trim(coalesce(t.content,'')), '\\s+', ' ', 'g'), 360) AS content_preview,
          s.year,
          s.source_type,
          s.title AS source_title,
          md5(
            concat_ws('|',
              t.source_section_id::text,
              coalesce(s.year::text,''),
              ${normalizedSourceType},
              ${normalizedSourceTitle},
              ${normalizedTopicNumber},
              ${normalizedTopicTitle},
              coalesce(t.page_start::text,''),
              coalesce(t.page_end::text,''),
              ${normalizedCategory},
              ${normalizedTopicContent}
            )
          ) AS exact_key,
          md5(
            concat_ws('|',
              coalesce(s.year::text,''),
              ${normalizedSourceType},
              ${normalizedSourceTitle},
              ${normalizedTopicTitle},
              coalesce(t.page_start::text,''),
              ${normalizedTopicContent}
            )
          ) AS candidate_key
        FROM public.topics t
        JOIN public.source_sections s ON s.id=t.source_section_id
        WHERE length(trim(coalesce(t.content,''))) >= 20
      ), candidate_groups AS (
        SELECT candidate_key
        FROM base
        GROUP BY candidate_key
        HAVING count(*) > 1
      )
      SELECT b.*
      FROM base b
      JOIN candidate_groups c USING (candidate_key)
      ORDER BY b.candidate_key, b.exact_key, b.id ASC
      LIMIT 1600
    `)).rows;

    const candidateGroups = new Map<string, any[]>();
    for (const row of rows) {
      const key = String(row.candidate_key);
      if (!candidateGroups.has(key)) candidateGroups.set(key, []);
      candidateGroups.get(key)!.push({
        id: Number(row.id),
        sourceSectionId: Number(row.source_section_id),
        topicNumber: row.topic_number == null ? null : String(row.topic_number),
        title: String(row.title || ''),
        pageStart: row.page_start == null ? null : Number(row.page_start),
        pageEnd: row.page_end == null ? null : Number(row.page_end),
        category: row.category == null ? null : String(row.category),
        year: row.year == null ? null : Number(row.year),
        sourceType: String(row.source_type || ''),
        sourceTitle: String(row.source_title || ''),
        contentPreview: String(row.content_preview || ''),
        exactKey: String(row.exact_key)
      });
    }

    const exactGroups: any[] = [];
    const reviewGroups: any[] = [];

    for (const [candidateKey, items] of candidateGroups) {
      const exactSubgroups = new Map<string, any[]>();
      for (const item of items) {
        if (!exactSubgroups.has(item.exactKey)) exactSubgroups.set(item.exactKey, []);
        exactSubgroups.get(item.exactKey)!.push(item);
      }

      for (const [exactKey, exactItems] of exactSubgroups) {
        if (exactItems.length < 2) continue;
        const keepId = Math.min(...exactItems.map(item => Number(item.id)));
        exactGroups.push({
          key: exactKey,
          copies: exactItems.length,
          keepId,
          removable: exactItems.length - 1,
          items: exactItems.map(item => ({
            ...item,
            exactKey: undefined,
            recommendedKeep: Number(item.id) === keepId
          }))
        });
      }

      if (exactSubgroups.size > 1) {
        reviewGroups.push({
          key: candidateKey,
          copies: items.length,
          reasons: reviewReasons(items),
          items: items.map(item => ({ ...item, exactKey: undefined, recommendedKeep: false }))
        });
      }
    }

    exactGroups.sort((a, b) => b.copies - a.copies || a.keepId - b.keepId);
    reviewGroups.sort((a, b) => b.copies - a.copies || Math.min(...a.items.map((i: any) => i.id)) - Math.min(...b.items.map((i: any) => i.id)));

    const exactRecords = exactGroups.reduce((sum, group) => sum + Number(group.copies || 0), 0);
    const removable = exactGroups.reduce((sum, group) => sum + Number(group.removable || 0), 0);
    const reviewRecords = reviewGroups.reduce((sum, group) => sum + Number(group.copies || 0), 0);

    return NextResponse.json({
      groups: exactGroups,
      exactGroups,
      reviewGroups,
      stats: {
        groups: exactGroups.length,
        duplicateRecords: exactRecords,
        removable,
        reviewGroups: reviewGroups.length,
        reviewRecords
      },
      rule: 'Exclusão automática somente quando fonte, ano, número do tópico, título, páginas, categoria e conteúdo coincidem. Textos equivalentes com metadados divergentes ficam apenas para revisão.'
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Não foi possível analisar os dados duplicados.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, true);
  if ('error' in auth) return auth.error;

  const topicIds = normalizeIdList((await req.json().catch(() => ({})))?.topic_ids);
  if (!topicIds.length) {
    return NextResponse.json({ error: 'Selecione pelo menos um registro duplicado para excluir.' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const validation = (await client.query(`
      WITH base AS (
        SELECT
          t.id,
          md5(
            concat_ws('|',
              t.source_section_id::text,
              coalesce(s.year::text,''),
              ${normalizedSourceType},
              ${normalizedSourceTitle},
              ${normalizedTopicNumber},
              ${normalizedTopicTitle},
              coalesce(t.page_start::text,''),
              coalesce(t.page_end::text,''),
              ${normalizedCategory},
              ${normalizedTopicContent}
            )
          ) AS exact_key
        FROM public.topics t
        JOIN public.source_sections s ON s.id=t.source_section_id
        WHERE length(trim(coalesce(t.content,''))) >= 20
      ), groups AS (
        SELECT exact_key, count(*)::int AS copies, min(id)::bigint AS keep_id
        FROM base
        GROUP BY exact_key
        HAVING count(*) > 1
      )
      SELECT b.id, b.exact_key, g.copies, g.keep_id
      FROM base b
      JOIN groups g USING (exact_key)
      WHERE b.id = ANY($1::bigint[])
    `, [topicIds])).rows;

    if (validation.length !== topicIds.length) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Um ou mais registros selecionados não são duplicados exatos pelo critério seguro atual.' }, { status: 409 });
    }

    const protectedIds = validation.filter(row => Number(row.id) === Number(row.keep_id)).map(row => Number(row.id));
    if (protectedIds.length) {
      await client.query('ROLLBACK');
      return NextResponse.json({
        error: 'O registro principal de cada grupo é protegido e não pode ser excluído por esta ferramenta.',
        protectedIds
      }, { status: 409 });
    }

    const selectedByGroup = new Map<string, number>();
    for (const row of validation) {
      const key = String(row.exact_key);
      selectedByGroup.set(key, (selectedByGroup.get(key) || 0) + 1);
      if ((selectedByGroup.get(key) || 0) >= Number(row.copies)) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'A exclusão deixaria um grupo sem nenhum registro preservado.' }, { status: 409 });
      }
    }

    const deleted = (await client.query(`
      DELETE FROM public.topics
      WHERE id = ANY($1::bigint[])
      RETURNING id, title, source_section_id
    `, [topicIds])).rows;

    await client.query('COMMIT');

    await writeAdminAudit({
      sessionId: Number(auth.session.id),
      action: 'topic.duplicates_deleted',
      entityType: 'topic',
      entityId: null,
      summary: `${deleted.length} registro(s) duplicado(s) exato(s) excluído(s) após revisão administrativa`,
      details: {
        deletedIds: deleted.map(row => Number(row.id)),
        titles: deleted.slice(0, 25).map(row => String(row.title || '')),
        safetyRule: 'Somente duplicações exatas foram excluídas; o registro de menor ID de cada grupo foi preservado.'
      }
    });

    return NextResponse.json({
      ok: true,
      deleted: deleted.length,
      deletedIds: deleted.map(row => Number(row.id))
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(error);
    if (error?.code === '23503') {
      return NextResponse.json({ error: 'Um dos registros está relacionado a outro dado e não pode ser excluído com segurança.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Falha ao excluir dados duplicados.' }, { status: 500 });
  } finally {
    client.release();
  }
}
