/**
 * 브레이킹(오피셜급) 판별 + 재시도 가능 게이트 판별 (2026-08-07, 개선 P0)
 *
 * 배경 — 비니시우스 재계약 오피셜 실사고: 파이프라인이 "얼마나 큰 뉴스인지"를
 * 몰라서, 레알 공식 발표가 루머 단신과 같은 게이트·같은 잠금·같은 침묵 속에
 * 하루 가까이 검수 무덤에 있었다 (오너가 사이트를 보고 발견).
 *
 * P0-1: 브레이킹이 검수 큐로 떨어지는 순간 디스코드 알림 (막힘의 가시화)
 * P0-2: 브레이킹은 해소 가능한 반려(사전 미등재)에 한해 매 사이클 자가 재평가
 *       — 사전이 등재되는 순간 다음 사이클에 스스로 살아난다
 */

import { classifyTier } from "@/lib/transfer/feed"
import { UNKNOWN_PLAYER_PREFIX } from "@/lib/news/alias-suggest"

/** 클럽명 브래킷 — 뉴스룸 관례상 [클럽명] 브래킷 = 구단 공식 발표 재작성 */
const CLUB_BRACKET_RE =
  /^\[(레알 마드리드|Real Madrid|바르셀로나|FC ?Barcelona|아스널|아스날|Arsenal|리버풀|Liverpool|첼시|Chelsea|맨체스터 시티|Manchester City|맨체스터 유나이티드|Manchester United|바이에른 뮌헨|Bayern(?: Munich)?|토트넘(?: 홋스퍼)?|Tottenham(?: Hotspur)?|파리 생제르맹|PSG|유벤투스|Juventus|인테르|Inter|AC ?밀란|AC ?Milan|아틀레티코(?: 마드리드)?|Atletico(?: Madrid)?|뉴캐슬(?: 유나이티드)?|Newcastle(?: United)?)\]/i

export interface BreakingCheckInput {
  /** 한국어 초안 제목 (브래킷 포함) */
  draftTitle: string | null
  /** 영문 원제 (있으면) */
  originalTitle: string | null
  /** 원문 출처 URL */
  sourceUrl: string | null
}

/** 오피셜급 브레이킹인가 — 강등 오탐보다 누락이 덜 아프므로 보수적으로 판별 */
export function isBreakingNewsItem(input: BreakingCheckInput): boolean {
  if (input.draftTitle && CLUB_BRACKET_RE.test(input.draftTitle)) return true
  return (
    classifyTier({
      category: null,
      original_title: input.originalTitle,
      headline_kr: input.draftTitle,
      link_url: input.sourceUrl,
      source_id: null,
    }) === "official"
  )
}

/**
 * 게이트 반려 사유가 "저절로/등재로 해소될 수 있는" 유형뿐인가.
 * 사전 미등재만 해당 — 검사관 본문 반려·이미지 부적합·중복은 재시도해도 같다.
 */
export function isRetryableGateReasons(reasons: unknown): boolean {
  if (!Array.isArray(reasons) || reasons.length === 0) return false
  return reasons.every((r) => typeof r === "string" && r.startsWith(UNKNOWN_PLAYER_PREFIX))
}
