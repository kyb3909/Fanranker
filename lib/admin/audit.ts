import { createServiceRoleClient } from '@/lib/supabase/server'

interface AuditLogParams {
  adminUserId: string
  action: string
  targetType: string
  targetId: string
  details?: Record<string, unknown>
  ipAddress?: string | null
}

export async function writeAuditLog({
  adminUserId,
  action,
  targetType,
  targetId,
  details,
  ipAddress,
}: AuditLogParams) {
  const supabase = createServiceRoleClient()
  await supabase.from('admin_audit_logs').insert({
    admin_user_id: adminUserId,
    action,
    target_type: targetType,
    target_id: targetId,
    details: details ?? {},
    ip_address: ipAddress ?? null,
  })
}

export function getIpFromRequest(request: Request): string | null {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
}
