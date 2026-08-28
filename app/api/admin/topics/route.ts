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
    const title = String(body.title || '').trim();
    const content = String(body.content || '').trim();
    const category = String(body.category || '').trim() || null;
    const topicNumber = String(body.topic_number || '').trim() || null;
    const pageStart = intOrNull(body.page_start);
    const pageEnd = intOrNull(body.page_end) || pageStart;
    const forceDuplicate = body.force_duplicate === true;
    const keywords = Array.isArray(body.keywords)
      ? body.keywords.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 40)
      : String(body.keywords || '').split(',').map((x: string) => x.trim()).filter(Boolean).slice(0, 40);
    const entryOrigin = body.entry_origin === 'pdf' ? 'pdf' : 'manual';
    const sourceFileName = String(body.source_file_name || '').trim().slice(0, 255) || null;
    const sourceFileSha256Raw = String(body.source_file_sha256 || '').trim().toLowerCase();
    const sourceFileSha256 = /^[a-f0-9]{64}$/.test(sourceFileSha256Raw) ? sourceFileSha256Raw : null;
    const sourceFileSize = Number.isInteger(Number(body.source_file_size)) && Number(body.source_file_size) > 0
      ? Number(body.source_file_size)
      : null;

    if (!title || !content || !pageStart) {
      return NextResponse.json({ error: 'Título, conteúdo e página inicial são obrigatórios.' }, { status: 400 });
    }

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
      const sourcePageStart = intOrNull(src.page_start) || pageStart;
      const sourcePageEnd = intOrNull(src.page_end) || sourcePageStart;

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

    // A verificação é feita ANTES de qualquer gravação e procura duplicações em todo o acervo.
    // Assim ela também funciona quando o administrador escolhe "Nova fonte" para um documento
    // que já existe com outro ID no banco.
    if (!forceDuplicate) {
      const duplicateCheck = await client.query(`
        WITH candidate AS (
          SELECT
            $1::text AS incoming_title,
            $2::text AS incoming_content,
            $3::int AS incoming_page,
            $4::bigint AS incoming_source_id,
            $5::int AS incoming_year,
            $6::text AS incoming_source_type,
            $7::text AS incoming_source_title,
            regexp_replace(lower(trim($2::text)), '\\s+', ' ', 'g') AS incoming_content_norm,
            lower(trim($1::text)) AS incoming_title_norm
        )
        SELECT
          t.id,
          t.title,
          t.topic_number,
          t.page_start,
          t.page_end,
          t.category,
          s.year,
          s.source_type,
          s.title AS source_title,
          CASE
            WHEN regexp_replace(lower(trim(t.content)), '\\s+', ' ', 'g') = c.incoming_content_norm
              THEN 'Conteúdo idêntico já existente no acervo'
            WHEN lower(trim(t.title)) = c.incoming_title_norm
              AND t.page_start = c.incoming_page
              AND c.incoming_source_id IS NOT NULL
              AND t.source_section_id = c.incoming_source_id
              THEN 'Mesmo título e mesma página na mesma fonte'
            WHEN lower(trim(t.title)) = c.incoming_title_norm
              AND t.page_start = c.incoming_page
              AND coalesce(s.year,0) = coalesce(c.incoming_year,0)
              AND lower(trim(s.source_type)) = lower(trim(c.incoming_source_type))
              AND lower(trim(s.title)) = lower(trim(c.incoming_source_title))
              THEN 'Mesmo título e mesma página em fonte equivalente'
            WHEN lower(trim(t.title)) = c.incoming_title_norm
              AND char_length(c.incoming_content_norm) >= 300
              AND left(regexp_replace(lower(trim(t.content)), '\\s+', ' ', 'g'), 500) = left(c.incoming_content_norm, 500)
              THEN 'Título e início do conteúdo muito semelhantes'
            ELSE 'Possível duplicação'
          END AS match_reason
        FROM topics t
        JOIN source_sections s ON s.id=t.source_section_id
        CROSS JOIN candidate c
        WHERE
          regexp_replace(lower(trim(t.content)), '\\s+', ' ', 'g') = c.incoming_content_norm
          OR (
            lower(trim(t.title)) = c.incoming_title_norm
            AND t.page_start = c.incoming_page
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
            lower(trim(t.title)) = c.incoming_title_norm
            AND char_length(c.incoming_content_norm) >= 300
            AND left(regexp_replace(lower(trim(t.content)), '\\s+', ' ', 'g'), 500) = left(c.incoming_content_norm, 500)
          )
        ORDER BY
          CASE
            WHEN regexp_replace(lower(trim(t.content)), '\\s+', ' ', 'g') = c.incoming_content_norm THEN 0
            WHEN lower(trim(t.title)) = c.incoming_title_norm AND t.page_start = c.incoming_page THEN 1
            ELSE 2
          END,
          t.id
        LIMIT 8`, [
          title,
          content,
          pageStart,
          sourceMeta.id,
          sourceMeta.year,
          sourceMeta.source_type,
          sourceMeta.title
        ]);

      if (duplicateCheck.rowCount) {
        return NextResponse.json({
          error: 'Este tópico parece já existir no acervo.',
          code: 'POSSIBLE_DUPLICATE',
          duplicates: duplicateCheck.rows.map(row => ({
            id: Number(row.id),
            title: row.title,
            topic_number: row.topic_number,
            page_start: row.page_start,
            page_end: row.page_end,
            category: row.category,
            year: row.year,
            source_type: row.source_type,
            source_title: row.source_title,
            match_reason: row.match_reason
          }))
        }, { status: 409 });
      }
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
          sourceMeta.page_start || pageStart,
          sourceMeta.page_end || sourceMeta.page_start || pageEnd || pageStart
        ]);
      sourceId = Number(createdSource.rows[0].id);
      sourceCreated = true;
    }

    const created = await client.query(`
      INSERT INTO topics(source_section_id, topic_number, title, content, page_start, page_end, category, keywords)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id`, [sourceId, topicNumber, title, content, pageStart, pageEnd, category, keywords]);

    await client.query('COMMIT');
    transactionStarted = false;

    const topicId = Number(created.rows[0].id);
    const auditDetails = {
      origin: entryOrigin,
      fileName: sourceFileName,
      fileSha256: sourceFileSha256,
      fileSize: sourceFileSize,
      title,
      topicNumber,
      pageStart,
      pageEnd,
      category,
      sourceId,
      sourceTitle: sourceMeta.title,
      sourceType: sourceMeta.source_type,
      year: sourceMeta.year,
      duplicateOverride: forceDuplicate
    };

    if (sourceCreated) {
      await writeAdminAudit({
        sessionId: Number(adminSession.id),
        action: 'source.created',
        entityType: 'source_section',
        entityId: sourceId,
        summary: `Fonte cadastrada: ${sourceMeta.title}`,
        details: {
          origin: entryOrigin,
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
      action: forceDuplicate ? 'topic.created_duplicate_override' : 'topic.created',
      entityType: 'topic',
      entityId: topicId,
      summary: `${forceDuplicate ? 'Tópico gravado após confirmação de possível duplicação' : 'Tópico cadastrado'}: ${title}`,
      details: auditDetails
    });

    return NextResponse.json({ ok: true, id: topicId, sourceId });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch(() => {});
    }
    console.error(error);
    return NextResponse.json({ error: 'Falha ao inserir tópico.' }, { status: 500 });
  } finally {
    client.release();
  }
}
