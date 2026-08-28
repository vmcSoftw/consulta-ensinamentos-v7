import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { adminConfigured, getValidAdminSession } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function boundedLimit(value: string | null) {
  const n = Number(value || 100);
  if (!Number.isInteger(n)) return 100;
  return Math.min(200, Math.max(10, n));
}

export async function GET(req: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json({ error: 'Segurança administrativa não configurada.' }, { status: 503 });
  }

  const session = await getValidAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Sessão administrativa inválida ou expirada.' }, { status: 401 });
  }

  const limit = boundedLimit(req.nextUrl.searchParams.get('limit'));
  const actionPrefix = String(req.nextUrl.searchParams.get('action') || '').trim().slice(0, 80);
  const params: unknown[] = [];
  let where = '';

  if (actionPrefix) {
    params.push(`${actionPrefix}%`);
    where = `WHERE action LIKE $${params.length}`;
  }
  params.push(limit);

  try {
    const items = (await pool.query(`
      SELECT id, created_at, session_id, action, entity_type, entity_id, summary, details
      FROM public.admin_audit_log
      ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}
    `, params)).rows;

    const stats = (await pool.query(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE action IN ('topic.created','topic.created_duplicate_override'))::int AS topics_created,
        count(*) FILTER (WHERE action='source.created')::int AS sources_created,
        count(*) FILTER (WHERE action IN ('topic.created','topic.created_duplicate_override') AND details->>'origin'='pdf')::int AS pdf_imports,
        count(*) FILTER (WHERE action='admin.login.success')::int AS successful_logins
      FROM public.admin_audit_log
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `)).rows[0] || {};

    return NextResponse.json({ items, stats }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    if (error?.code === '42P01') {
      return NextResponse.json({
        error: 'A estrutura de auditoria ainda não foi preparada. Execute npm run preparar:auditoria.'
      }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Não foi possível consultar o histórico administrativo.' }, { status: 500 });
  }
}
