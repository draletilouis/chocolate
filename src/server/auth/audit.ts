import { query } from '../db';

export interface AuditEvent {
  category?: 'security' | 'administration' | 'system';
  action: string;
  description?: string;
  severity?: 'info' | 'warning' | 'error';
  source?: 'user' | 'system';
  entityType?: string;
  entityId?: string | number | null;
  actor?: { id?: number | null; name?: string | null; role?: string | null };
  request?: { method?: string; path?: string; ip?: string | null; userAgent?: string | null };
  statusCode?: number;
  metadata?: Record<string, unknown>;
}

/** Security audit trail (login.failed, login.succeeded, logout, password.changed, ...). Never throws. */
export async function recordAudit(event: AuditEvent) {
  try {
    await query(
      `INSERT INTO audit_logs (actor_user_id, actor_name, actor_role, category, action, entity_type, entity_id, description,
                               method, path, status_code, ip_address, user_agent, source, severity, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)`,
      [
        event.actor?.id ?? null, event.actor?.name ?? 'System', event.actor?.role ?? null,
        event.category ?? 'security', event.action, event.entityType ?? null,
        event.entityId === undefined || event.entityId === null ? null : String(event.entityId), event.description ?? null,
        event.request?.method ?? null, event.request?.path ?? null, event.statusCode ?? null,
        event.request?.ip ?? null, event.request?.userAgent ?? null, event.source ?? 'user', event.severity ?? 'info',
        JSON.stringify(event.metadata ?? {}),
      ],
    );
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
