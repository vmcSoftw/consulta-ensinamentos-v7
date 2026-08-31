import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { adminConfigured, getValidAdminSession, isSameOriginAdminRequest } from '@/lib/admin';
import { writeAdminAudit } from '@/lib/audit';

export const runtime = 'nodejs';

function intOrNull(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

type SourceMeta = {
  id: number | null;
  year: number | null;
  source_type: string;
  title: string;
  page_start: number | null;
  page_end: number | null;
};

type IncomingTopic = {
  input_index: number;
  topic_number: string | null;
  title: string;
  content: string;
  page_start: number;
  page_end: number;
  category: string | null;
  keywords: string[];
};

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    if (!isSameOriginAdminRequest(req)) {
      return NextResponse.json({ error: 'Origem da solicitação administrativa não autorizada.' }, { status: 403 });
    }

    if (!adminConfigured()) {
      return NextResponse.json({ error: 'Segurança administrativa não configurada no servidor.' }, { status: 503 });
    }

    const adminSession = await getValidAdminSession(req);
    if (!adminSession) {
      return NextResponse.json({ error: 'Acesso administrativo não autorizado.' }, { status: 401 });
    }

    const body = await req.json();
    const rawTopics = Array.isArray(body.topics) ? body.topics : [];
    if (!rawTopics.length) {
      return NextResponse.json({ error: 'Nenhum tópico foi selecionado para importação.' }, { status: 400 });
    }
    if (rawTopics.length > 150) {
      return NextResponse.json({ error: 'Importe no máximo 150 tópicos por operação.' }, { status: 400 });
    }

    const topics: IncomingTopic[] = rawTopics.map((item: any, index: number) => {
      const title = String(item.title || '').trim();
      const content = String(item.content || '').trim();
      const pageStart = intOrNull(item.page_start);
      const pageEnd = intOrNull(item.page_end) || pageStart;
      const keywords = Array.isArray(item.keywords)
        ? item.keywords.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 40)
        : String(item.keywords || '').split(',').map((x: string) => x.trim()).filter(Boolean).slice(0, 40);

      if (!title || !content || !pageStart) {
        throw new Error(`O tópico ${index + 1} está incompleto. Título, conteúdo e página inicial são obrigatórios.`);
      }

      return {
        input_index: index,
        topic_number: String(item.topic_number || '').trim() || null,
        title,
        content,
        page_start: pageStart,
        page_end: pageEnd || pageStart,
        category: String(item.category || '').trim() || null,
        keywords
      };
    });

    const sourceFileName = String(body.source_file_name || '').trim().slice(0, 255) || null;
    const sourceFileSha256Raw = String(body.source_file_sha256 || '').trim().toLowerCase();
    const sourceFileSha256 = /^[a-f0-9]{64}$/.test(sourceFileSha256Raw) ? sourceFileSha256Raw : null;
    const sourceFileSize = Number.isInteger(Number(body.source_file_size)) && Number(body.source_file_size) > 0
      ? Number(body.source_file_size)
      : null;

    let sourceId = intOrNull(body.source_section_id);
    let sourceMeta: SourceMeta | null = null;

    if (sourceId) {
      const existingSource = await client.query(`
        SELECT id, year, source_type, title, page_start, page_end
        FROM source_sections
        WHERE id=$1`, [sourceId]);

      if (!existingSource.rowCount) {
        return NextResponse.json({ error: 'Fonte informada não existe.' }, { status: 400 });
      }

      const row = existingSource.rows[0];
      sourceMeta = {
        id: Number(row.id),
        year: row.year == null ? null : Number(row.year),
        source_type: String(row.source_type || 'Documento'),
        title: String(row.title || ''),
        page_start: row.page_start == null ? null : Number(row.page_start),
        page_end: row.page_end == null ? null : Number(row.page_end)
      };
    } else if (body.new_source) {
      const src = body.new_source;
      const sourceTitle = String(src.title || '').trim();
      const sourceType = String(src.source_type || '').trim() || 'Documento';
      const sourceYear = intOrNull(src.year);
      const sourcePageStart = intOrNull(src.page_start) || Math.min(...topics.map(t => t.page_start));
      const sourcePageEnd = intOrNull(src.page_end) || Math.max(...topics.map(t => t.page_end));

      if (!sourceTitle) {
        return NextResponse.json({ error: 'Informe o título da nova fonte.' }, { status: 400 });
      }

      sourceMeta = {
        id: null,
        year: sourceYear,
        source_type: sourceType,
        title: sourceTitle,
        page_start: sourcePageStart,
        page_end: sourcePageEnd
      };
    }

    if (!sourceMeta) {
      return NextResponse.json({ error: 'Selecione uma fonte existente ou cadastre uma nova fonte.' }, { status: 400 });
    }

    const duplicateRows = await client.query(`
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS x(
          input_index int,
          title text,
          content text,
          page_start int
        )
      ), candidate AS (
        SELECT
          $2::bigint AS incoming_source_id,
          $3::int AS incoming_year,
          $4::text AS incoming_source_type,
          $5::text AS incoming_source_title
      )
      SELECT
        i.input_index,
        t.id,
        t.title,
        t.page_start,
        t.page_end,
        s.year,
        s.source_type,
        s.title AS source_title,
        CASE
          WHEN regexp_replace(lower(trim(t.content)), '\\s+', ' ', 'g') = regexp_replace(lower(trim(i.content)), '\\s+', ' ', 'g')
            THEN 'Conteúdo idêntico já existente no acervo'
          WHEN lower(trim(t.title)) = lower(trim(i.title))
            AND t.page_start = i.page_start
            AND c.incoming_source_id IS NOT NULL
            AND t.source_section_id = c.incoming_source_id
            THEN 'Mesmo título e mesma página na mesma fonte'
          WHEN lower(trim(t.title)) = lower(trim(i.title))
            AND t.page_start = i.page_start
            AND coalesce(s.year,0) = coalesce(c.incoming_year,0)
            AND lower(trim(s.source_type)) = lower(trim(c.incoming_source_type))
            AND lower(trim(s.title)) = lower(trim(c.incoming_source_title))
            THEN 'Mesmo título e mesma página em fonte equivalente'
          WHEN lower(trim(t.title)) = lower(trim(i.title))
            AND char_length(regexp_replace(lower(trim(i.content)), '\\s+', ' ', 'g')) >= 300
            AND left(regexp_replace(lower(trim(t.content)), '\\s+', ' ', 'g'), 500)
              = left(regexp_replace(lower(trim(i.content)), '\\s+', ' ', 'g'), 500)
            THEN 'Título e início do conteúdo muito semelhantes'
          ELSE 'Possível duplicação'
        END AS match_reason
      FROM incoming i
      JOIN topics t ON (
        regexp_replace(lower(trim(t.content)), '\\s+', ' ', 'g') = regexp_replace(lower(trim(i.content)), '\\s+', ' ', 'g')
        OR (
          lower(trim(t.title)) = lower(trim(i.title))
          AND t.page_start = i.page_start
        )
        OR (
          lower(trim(t.title)) = lower(trim(i.title))
          AND char_length(regexp_replace(lower(trim(i.content)), '\\s+', ' ', 'g')) >= 300
          AND left(regexp_replace(lower(trim(t.content)), '\\s+', ' ', 'g'), 500)
            = left(regexp_replace(lower(trim(i.content)), '\\s+', ' ', 'g'), 500)
        )
      )
      JOIN source_sections s ON s.id=t.source_section_id
      CROSS JOIN candidate c
      WHERE
        regexp_replace(lower(trim(t.content)), '\\s+', ' ', 'g') = regexp_replace(lower(trim(i.content)), '\\s+', ' ', 'g')
        OR (
          lower(trim(t.title)) = lower(trim(i.title))
          AND t.page_start = i.page_start
          AND (
            (c.incoming_source_id IS NOT NULL AND t.source_section_id = c.incoming_source_id)
            OR (
              coalesce(s.year,0) = coalesce(c.incoming_year,0)
              AND lower(trim(s.source_type)) = lower(trim(c.incoming_source_type))
              AND lower(trim(s.title)) = lower(trim(c.incoming_source_title))
            )
          )
        )
        OR (
          lower(trim(t.title)) = lower(trim(i.title))
          AND char_length(regexp_replace(lower(trim(i.content)), '\\s+', ' ', 'g')) >= 300
          AND left(regexp_replace(lower(trim(t.content)), '\\s+', ' ', 'g'), 500)
            = left(regexp_replace(lower(trim(i.content)), '\\s+', ' ', 'g'), 500)
        )
      ORDER BY i.input_index, t.id
    `, [
      JSON.stringify(topics.map(t => ({ input_index: t.input_index, title: t.title, content: t.content, page_start: t.page_start }))),
      sourceMeta.id,
      sourceMeta.year,
      sourceMeta.source_type,
      sourceMeta.title
    ]);

    const duplicateMap = new Map<number, any[]>();
    for (const row of duplicateRows.rows) {
      const index = Number(row.input_index);
      const list = duplicateMap.get(index) || [];
      if (list.length < 5) {
        list.push({
          id: Number(row.id),
          title: row.title,
          page_start: row.page_start,
          page_end: row.page_end,
          year: row.year,
          source_type: row.source_type,
          source_title: row.source_title,
          match_reason: row.match_reason
        });
      }
      duplicateMap.set(index, list);
    }

    const accepted = topics.filter(t => !duplicateMap.has(t.input_index));
    const skipped = topics
      .filter(t => duplicateMap.has(t.input_index))
      .map(t => ({
        input_index: t.input_index,
        title: t.title,
        page_start: t.page_start,
        matches: duplicateMap.get(t.input_index) || []
      }));

    if (!accepted.length) {
      return NextResponse.json({
        ok: true,
        created: 0,
        skippedDuplicates: skipped.length,
        skipped,
        sourceId: sourceMeta.id,
        message: 'Nenhum tópico novo foi gravado porque todos os selecionados já parecem existir no acervo.'
      });
    }

    await client.query('BEGIN');
    transactionStarted = true;
    let sourceCreated = false;

    if (!sourceId) {
      const createdSource = await client.query(`
        INSERT INTO source_sections(document_id, year, source_type, title, page_start, page_end, source_order)
        VALUES(1,$1,$2,$3,$4,$5,(SELECT COALESCE(max(source_order),0)+1 FROM source_sections))
        RETURNING id`, [
          sourceMeta.year,
          sourceMeta.source_type,
          sourceMeta.title,
          sourceMeta.page_start,
          sourceMeta.page_end
        ]);
      sourceId = Number(createdSource.rows[0].id);
      sourceCreated = true;
    }

    const createdTopics: Array<{ id: number; input_index: number; title: string }> = [];
    for (const topic of accepted) {
      const created = await client.query(`
        INSERT INTO topics(source_section_id, topic_number, title, content, page_start, page_end, category, keywords)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id`, [
          sourceId,
          topic.topic_number,
          topic.title,
          topic.content,
          topic.page_start,
          topic.page_end,
          topic.category,
          topic.keywords
        ]);
      createdTopics.push({ id: Number(created.rows[0].id), input_index: topic.input_index, title: topic.title });
    }

    await client.query('COMMIT');
    transactionStarted = false;

    if (sourceCreated) {
      await writeAdminAudit({
        sessionId: Number(adminSession.id),
        action: 'source.created',
        entityType: 'source_section',
        entityId: sourceId,
        summary: `Fonte cadastrada por importação inteligente: ${sourceMeta.title}`,
        details: {
          origin: 'pdf-batch',
          fileName: sourceFileName,
          fileSha256: sourceFileSha256,
          fileSize: sourceFileSize,
          sourceTitle: sourceMeta.title,
          sourceType: sourceMeta.source_type,
          year: sourceMeta.year,
          pageStart: sourceMeta.page_start,
          pageEnd: sourceMeta.page_end
        }
      });
    }

    await writeAdminAudit({
      sessionId: Number(adminSession.id),
      action: 'pdf.batch_imported',
      entityType: 'source_section',
      entityId: sourceId,
      summary: `Importação inteligente de PDF: ${createdTopics.length} tópico(s) gravado(s), ${skipped.length} duplicado(s) ignorado(s).`,
      details: {
        origin: 'pdf-batch',
        fileName: sourceFileName,
        fileSha256: sourceFileSha256,
        fileSize: sourceFileSize,
        sourceTitle: sourceMeta.title,
        sourceType: sourceMeta.source_type,
        year: sourceMeta.year,
        createdCount: createdTopics.length,
        skippedDuplicates: skipped.length,
        topics: createdTopics.slice(0, 150),
        skipped: skipped.slice(0, 50)
      }
    });

    return NextResponse.json({
      ok: true,
      created: createdTopics.length,
      createdTopics,
      skippedDuplicates: skipped.length,
      skipped,
      sourceId,
      sourceCreated
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch(() => {});
    }
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha na importação inteligente do PDF.' }, { status: 500 });
  } finally {
    client.release();
  }
}
