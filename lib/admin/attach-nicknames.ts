import type { createServiceRoleClient } from "@/lib/supabase/server"

type ServiceClient = ReturnType<typeof createServiceRoleClient>

/**
 * posts.user_id ↔ profiles.user_id 는 스키마에 FK 가 없어 PostgREST 임베드
 * (`profiles!inner(nickname)`)가 PGRST200("no relationship found")으로 실패한다.
 * → 작성자 닉네임을 별도 조회해 `profiles: { nickname }` 형태로 병합한다.
 */
export async function attachNicknames<T extends { user_id: string | null }>(
  supabase: ServiceClient,
  rows: T[]
): Promise<(T & { profiles: { nickname: string } })[]> {
  const ids = [...new Set(rows.map((r) => r.user_id).filter((v): v is string => Boolean(v)))]
  const nickById = new Map<string, string>()
  if (ids.length > 0) {
    const { data } = await supabase.from("profiles").select("user_id, nickname").in("user_id", ids)
    for (const row of data ?? []) {
      if (row.nickname) nickById.set(row.user_id, row.nickname)
    }
  }
  return rows.map((row) => ({
    ...row,
    profiles: { nickname: (row.user_id && nickById.get(row.user_id)) || "(탈퇴/없음)" },
  }))
}
