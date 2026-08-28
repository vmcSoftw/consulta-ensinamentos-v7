import { pool } from '@/lib/db';

export type AdminAuditEvent = {
  sessionId?: number | null;
  action: string;
  entityType?: string | null;
  entityId?: number | null;
  summary: string;
  details?: Record<string, unknown> | null;
};

/**
 * Grava um evento administrativo sem interromper a operação principal caso
 * a auditoria esteja indisponível. Isso permite aplicar o patch antes de
 * executar `npm run preparar:auditoria` sem quebrar o login/cadastro.
 */
export async function writeAdminAudit(event: AdminAuditEvent) {
  try {
    await pool.query(`
      INSERT INTO public.admin_audit_log
        (session_id, action, entity_type, entity_id, summary, details)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)
    `, [
      event.sessionId ?? null,
      String(event.action || '').slice(0, 120),
      event.entityType ? String(event.entityType).slice(0, 80) : null,
      event.entityId ?? null,
      String(event.summary || '').slice(0, 600),
      JSON.stringify(event.details || {})
    ]);
  } catch (error: any) {
    // 42P01 = tabela ainda não criada. A operação principal deve continuar.
    if (error?.code !== '42P01') {
      console.warn('Falha não bloqueante ao registrar auditoria administrativa:', error?.message || error);
    }
  }
}
