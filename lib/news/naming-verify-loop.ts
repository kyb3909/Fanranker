/**
 * 발행 전 표기 검증 루프 (2026-08-07 운영자 지시:
 * "발행하기 전에 저 루프를 모두 다 돌고 나서 무결함이 검증된 다음에 발행")
 *
 * 자동발행 게이트가 미등재 선수명을 만나면 곧장 보류하지 않고, 소급 도구
 * (naming-audit)와 같은 검증 루프를 발행 전에 돌린다:
 *   미등재 이름 → LLM 표기 후보 제안 → 네이버 뉴스 검색량 대조 → 압도 표기 승자
 *   → 사전 자동 등재 (기사 표기는 옛 표기 alt 로) → 발행 초크의 사전 치환이
 *   본문을 대표 표기로 정리 → 발행.
 *
 * fail-closed 유지: 네이버 근거가 없는 이름은 등재하지 않고 보류(사람 검수)로
 * 남는다. 인프라 실패(네이버 미가동·후보 생성 실패)는 판정이 아니므로 낙인 없이
 * retry_wait — 이미지 게이트의 infra 구분(2026-08-06)과 같은 규율.
 *
 * 이 자동 등재는 "무인 사서"의 부활이 아니다: 사서 폐지 사유는 근거 없는 등재
 * (은퇴 레전드·감독을 선수로)였고, 여기는 naming-audit(8/4 운영자 승인 가동 중)과
 * 동일하게 **네이버 실사용 근거가 있는 승자만** 등재한다.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { verifySpelling } from "@/lib/naming/verify"
import { isClubName } from "@/lib/naming/pick"
import { normalizePlayerKey } from "@/lib/saga/identity"

type ServiceClient = SupabaseClient<never, never, never> | { from: CallableFunction }

/** 기사 1건당 검증 상한 — LLM 1회 + 네이버 최대 4회/이름이라 폭주 방지 */
const MAX_VERIFICATIONS_PER_ARTICLE = 8

export interface NamingLoopResult {
  /** 네이버 근거로 사전에 새로 등재된 이름 (기사 표기 → 대표 표기) */
  registered: { name: string; preferred: string }[]
  /** 검증을 통과하지 못한 이름 — 기존대로 보류(사람 검수) 사유가 된다 */
  stillUnknown: string[]
  /** 인프라 실패로 검증 자체를 못 한 이름 — 낙인 없이 retry_wait 대상 */
  infraFailed: string[]
}

/** verifySpelling 실패 사유 중 "판정 불가(인프라)"와 "근거 부족(판정)"의 구분 */
function isInfraReason(reason: string | undefined): boolean {
  if (!reason) return false
  return reason.includes("네이버 API 미가동") || reason.includes("후보 생성 실패")
}

export async function resolveUnknownPlayersViaNaver(
  supabase: ServiceClient,
  names: string[],
  contextTitle: string,
  cache?: Map<string, { preferred: string } | "unknown" | "infra">
): Promise<NamingLoopResult> {
  const result: NamingLoopResult = { registered: [], stillUnknown: [], infraFailed: [] }
  const memo = cache ?? new Map()
  let verifications = 0

  for (const raw of names) {
    const name = raw.trim()
    if (!name) continue

    // 클럽명 오탐 차단 (실사고: '리버풀'이 선수로 추출됨) — 미등재 취급하지 않는다
    if (isClubName(name)) continue

    const cached = memo.get(name)
    if (cached === "unknown") {
      result.stillUnknown.push(name)
      continue
    }
    if (cached === "infra") {
      result.infraFailed.push(name)
      continue
    }
    if (cached) {
      // 같은 런에서 이미 검증·등재된 이름
      continue
    }

    if (verifications >= MAX_VERIFICATIONS_PER_ARTICLE) {
      // 상한 초과분은 시도조차 못 했다 — 판정이 아니므로 재시도로
      result.infraFailed.push(name)
      continue
    }
    verifications++

    const v = await verifySpelling(name, contextTitle)

    if (!v.winner || !v.romanized) {
      if (isInfraReason(v.reason)) {
        memo.set(name, "infra")
        result.infraFailed.push(name)
      } else {
        memo.set(name, "unknown")
        result.stillUnknown.push(name)
      }
      continue
    }

    const registerError = await registerVerifiedPlayer(supabase, {
      articleName: name,
      preferred: v.winner,
      romanized: v.romanized,
      notes: `발행 게이트 등재 — 네이버: ${v.counts.map((c) => `${c.candidate} ${c.total}건`).join(", ")}`,
    })
    if (registerError) {
      // 등재 실패는 인프라 실패로 취급 — 다음 회차에 다시 시도
      memo.set(name, "infra")
      result.infraFailed.push(name)
      continue
    }

    memo.set(name, { preferred: v.winner })
    result.registered.push({ name, preferred: v.winner })
  }

  return result
}

/**
 * 네이버 검증을 통과한 표기를 사전에 등재. naming-audit(소급 감사)과 같은 형태 —
 * id 는 romanized 키 기반, 기사 표기가 대표와 다르면 옛 표기(alt)로 흡수해
 * 발행 초크의 사전 치환이 본문을 대표 표기로 바꾸게 한다.
 */
export async function registerVerifiedPlayer(
  supabase: ServiceClient,
  input: { articleName: string; preferred: string; romanized: string; notes: string }
): Promise<string | null> {
  const romanKey = normalizePlayerKey(input.romanized)
  const { error } = await (supabase as SupabaseClient).from("news_alias_dictionary").upsert(
    {
      id: `player_auto_${romanKey.replace(/-/g, "_")}`.slice(0, 60),
      category: "player",
      preferred_ko: input.preferred,
      romanized: input.romanized,
      surfaces: [romanKey.replace(/-/g, " "), input.preferred],
      hangul_alts: input.preferred !== input.articleName ? [input.articleName] : [],
      confidence: 0.7,
      notes: input.notes,
    },
    { onConflict: "id", ignoreDuplicates: true }
  )
  return error ? error.message : null
}
