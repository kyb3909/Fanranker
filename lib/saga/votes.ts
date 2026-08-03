import "server-only"

import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * 사가 메인 투표 집계 — append-only 원장(saga_votes)에서 계산 (P0_AUDIT §2-3).
 *
 * "현재 스탠스"는 유저별 가장 최근 행이다. 원장을 덮어쓰지 않으므로(poll_votes 의
 * upsert 결함 정정) 여론 시계열 그래프(W4)가 같은 테이블에서 공짜로 나온다.
 */

type ServiceClient = ReturnType<typeof createServiceRoleClient>

export interface MainVoteAggregate {
  go: number
  stay: number
  total: number
}

export async function aggregateMainVotes(
  supabase: ServiceClient,
  sagaId: string
): Promise<MainVoteAggregate> {
  const { data: votes } = await supabase
    .from("saga_votes")
    .select("user_id, choice, created_at")
    .eq("saga_id", sagaId)
    .eq("scope", "main")
    .order("created_at", { ascending: false })
    .limit(5000)
  const latest = new Map<string, string>()
  for (const v of votes ?? []) if (!latest.has(v.user_id)) latest.set(v.user_id, v.choice)
  const go = [...latest.values()].filter((c) => c === "go").length
  const total = latest.size
  return { go, stay: total - go, total }
}

/** 유저의 현재 스탠스 (미투표면 null) — 위젯 하이라이트·댓글 스냅샷 공용 */
export async function latestMainChoice(
  supabase: ServiceClient,
  sagaId: string,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("saga_votes")
    .select("choice")
    .eq("saga_id", sagaId)
    .eq("scope", "main")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.choice ?? null
}
