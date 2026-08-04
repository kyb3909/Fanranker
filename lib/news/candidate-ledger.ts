import "server-only"

import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

export const NEWS_CANDIDATE_STATES = [
  "discovered",
  "deduplicated",
  "assigned",
  "evidence_ready",
  "drafted",
  "fact_checking",
  "revision_required",
  "copy_ready",
  "policy_ready",
  "visual_ready",
  "publish_ready",
  "published",
  "held",
  "duplicate",
  "expired",
  "rejected",
  "retry_wait",
  "dead_letter",
  "needs_human",
  "partially_published",
] as const

export type NewsCandidateState = (typeof NEWS_CANDIDATE_STATES)[number]

export interface NewsCandidateEvent {
  candidate_id: string
  to_state: NewsCandidateState
  actor: string
  reason_code?: string
  details?: Record<string, unknown>
  run_id?: string
  reservoir_id?: string
  dedupe_key?: string
  canonical_url?: string
  source?: Record<string, unknown>
  content_hash?: string
}

type LedgerClient = Pick<SupabaseClient, "rpc">

/** 같은 실행에서 발생한 전이를 묶고 재시도 시 중복 이벤트를 피하기 위한 실행 ID. */
export function newsCandidateRunId(actor: string): string {
  return `${actor}:${randomUUID()}`
}

/**
 * Shadow ledger 기록. 원장 장애가 기사 생산을 막으면 안 되므로 fail-open이지만,
 * false와 구조화 로그를 반환해 운영자가 관측 저하를 즉시 알 수 있게 한다.
 */
export async function recordNewsCandidateEvents(
  supabase: LedgerClient,
  events: NewsCandidateEvent[]
): Promise<boolean> {
  if (events.length === 0) return true
  if (typeof supabase.rpc !== "function") {
    console.error("[news-candidate-ledger] rpc 사용 불가", { events: events.length })
    return false
  }

  const { error } = await supabase.rpc("record_news_candidate_events", { p_events: events })
  if (error) {
    console.error("[news-candidate-ledger] 상태 전이 기록 실패", {
      events: events.length,
      candidates: [...new Set(events.map((event) => event.candidate_id))].slice(0, 20),
      error: error.message,
    })
    return false
  }
  return true
}
