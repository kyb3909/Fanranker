import "server-only"

import type { createServiceRoleClient } from "@/lib/supabase/server"
import { UNKNOWN_PLAYER_PREFIX } from "@/lib/news/alias-suggest"
import { loadNotation, unknownPersonNames } from "@/lib/news/notation"
import {
  newsCandidateRunId,
  recordNewsCandidateEvents,
  type NewsCandidateEvent,
} from "@/lib/news/candidate-ledger"

/**
 * 사전 등재 → 막힌 초안 부활 (2026-08-06).
 *
 * 실측: 24시간 유입의 47%가 게이트 반려 이력(needs_human)으로 잠들고, 그 최대 사유가
 * "사전 미등재 선수명"이다. 그런데 운영자가 1클릭 화면에서 이름을 등재해도 효과는
 * **미래 기사에만** 미쳤다 — 자동발행이 비용 절감으로 `auto_gate.pass=false` 이력을
 * 재검사하지 않아서, 등재의 계기가 된 바로 그 기사는 그대로 24시간 만료로 죽었다.
 *
 * 이 모듈은 등재 직후 "그 이름 때문에만 막혀 있던 drafted 초안"의 반려 기록을 걷어
 * 다음 자동발행 회차가 정상 재검사하게 한다. 원칙:
 *  - 사람의 등재 클릭이 유일한 트리거다 — 자동으로 게이트를 여는 경로가 아니다.
 *  - 재검사는 전체 품질 게이트(검사관·이미지·중복)를 처음부터 다시 통과해야 한다.
 *    걷어내는 건 "미등재" 낙인이지 통과 보증이 아니다.
 *  - 다른 미등재 이름이 하나라도 남아 있으면 건드리지 않는다.
 *  - 반려 이력은 지우지 않고 `auto_gate_cleared`로 보존한다 (감사 추적).
 */

type ServiceClient = ReturnType<typeof createServiceRoleClient>

interface DictionaryRecheckResult {
  /** 반려 기록을 걷어 재검사 대상이 된 초안 수 */
  requeued: number
  /** 사전 사유였지만 다른 미등재 이름이 남아 그대로 둔 초안 수 */
  stillBlocked: number
  /** DB 갱신 실패 수 (등재 자체는 성공 — 다음 등재 때 재시도됨) */
  failed: number
}

interface GateShape {
  pass?: boolean
  reasons?: unknown
}

/** 반려 사유가 전부 "사전 미등재 선수명"이면 그 이름들을 돌려준다. 아니면 null. */
function parseDictionaryOnlyReasons(gate: GateShape): string[] | null {
  if (gate.pass !== false) return null
  const reasons = Array.isArray(gate.reasons) ? gate.reasons.map(String) : []
  if (reasons.length === 0) return null
  if (!reasons.every((r) => r.startsWith(UNKNOWN_PLAYER_PREFIX))) return null
  return reasons.flatMap((r) =>
    r
      .slice(UNKNOWN_PLAYER_PREFIX.length)
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
  )
}

/**
 * 살아있는(drafted) 초안 중 "사전 미등재"로만 막힌 것들을 현재 사전으로 재평가해,
 * 전부 등재됐으면 반려 기록을 걷는다. 등재 API가 사전을 갱신한 **직후** 부른다.
 *
 * 실패는 registration 응답을 막지 않는다(fail-open) — 여기서 못 살린 초안은
 * 다음 등재 클릭 때 다시 평가되고, 최악이어도 기존과 같은 만료 경로일 뿐이다.
 */
export async function requeueDraftsUnblockedByDictionary(
  supabase: ServiceClient
): Promise<DictionaryRecheckResult> {
  const result: DictionaryRecheckResult = { requeued: 0, stillBlocked: 0, failed: 0 }

  // 발행 게이트와 **같은 사전 뷰**를 써야 한다 — 범위가 어긋나면 등재로 풀린 초안이
  // 영영 재평가되지 않는다 (2026-08-09: 게이트는 감독을 보는데 여기는 선수만 봤다).
  // 이제 범위를 고를 수 없다: notation 모듈이 단독으로 소유한다.
  const [dictResult, { data: rows, error: rowsError }] = await Promise.all([
    loadNotation(supabase).then(
      (n) => ({ data: n.persons, error: null as string | null }),
      (e: unknown) => ({ data: null, error: e instanceof Error ? e.message : String(e) })
    ),
    supabase
      .from("news_reservoir")
      .select("id, decision")
      .eq("status", "drafted")
      .not("decision->auto_gate", "is", null)
      .limit(200),
  ])
  if (dictResult.error || rowsError) {
    console.error("[dictionary-recheck] 조회 실패", {
      dict: dictResult.error,
      rows: rowsError?.message,
    })
    return result
  }

  const dictionary = dictResult.data ?? []
  const runId = newsCandidateRunId("player-dictionary")
  const ledgerEvents: NewsCandidateEvent[] = []
  const now = new Date().toISOString()

  for (const row of (rows ?? []) as { id: string; decision: Record<string, unknown> | null }[]) {
    const gate = (row.decision?.auto_gate ?? null) as GateShape | null
    if (!gate) continue
    const names = parseDictionaryOnlyReasons(gate)
    if (!names) continue // 사전과 무관한 반려(검사관·이미지·중복)는 건드리지 않는다

    if (unknownPersonNames(names, dictionary).length > 0) {
      result.stillBlocked++
      continue
    }

    // 낙인은 걷되 이력은 남긴다 — "왜 반려 기록이 사라졌지"가 추적 가능해야 한다
    const { auto_gate: _cleared, ...rest } = row.decision ?? {}
    const { error } = await supabase
      .from("news_reservoir")
      .update({
        decision: {
          ...rest,
          auto_gate_cleared: { at: now, by: "player-dictionary", reasons: gate.reasons },
        },
        updated_at: now,
      })
      .eq("id", row.id)
      .eq("status", "drafted") // 그 사이 발행/반려됐으면 건드리지 않는다
    if (error) {
      result.failed++
      console.error("[dictionary-recheck] 반려 기록 해제 실패", row.id, error.message)
      continue
    }
    result.requeued++
    ledgerEvents.push({
      candidate_id: row.id,
      reservoir_id: row.id,
      to_state: "drafted",
      actor: "player-dictionary",
      reason_code: "dictionary_recheck",
      details: { names },
      run_id: runId,
    })
  }

  await recordNewsCandidateEvents(supabase, ledgerEvents)
  return result
}
