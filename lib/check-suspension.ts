import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * 유저가 현재 정지 상태인지 확인
 * - suspended_until이 null이면 영구 정지
 * - suspended_until이 미래 시점이면 임시 정지
 */
export async function isUserSuspended(userId: string): Promise<boolean> {
  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()

  const { data } = await supabase
    .from('user_suspensions')
    .select('id')
    .eq('user_id', userId)
    .or(`suspended_until.is.null,suspended_until.gt.${now}`)
    .limit(1)
    .maybeSingle()

  return !!data
}
