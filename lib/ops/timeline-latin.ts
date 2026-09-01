/**
 * 불변식 판정 — 저장 타임라인에 **고칠 수 있었는데 안 고쳐진** 영문 이름이 있는가
 * (**순수 모듈**, 2026-09-01).
 *
 * ## 왜 감시가 필요한가
 * `Ø`·`Ł` 같은 NFD 비분해 글자가 정규화에서 통째로 지워져("Ødegaard" → "degaard") 이름
 * 대조가 실패했고, 타임라인 이름이 영문으로 남거나 **실재하지 않는 이름**("Martin degaard")이
 * 리포트로 발행됐다. 287경기가 그 상태였는데 아무 신호도 없었다.
 *
 * 더 나쁜 것은 **저장분이 스스로 낫지 않는다**는 점이다 — `match_details_cache` 는 끝난
 * 경기 수명이 사실상 무한이라 LFA 를 다시 안 부른다. 즉 이 규칙이 우는 시점에 이미 그
 * 경기는 영구히 굳어 있고, 백필을 돌려야 낫는다.
 *
 * ## 무엇을 세는가 — "비한글 이름"이 아니라 "고칠 수 있는 이름"
 * ⚠️ 단순히 비한글 비율로 재면 **임계값을 세울 수 없다.** 스쿼드 사전에 없는 선수는
 *    원문을 유지하는 것이 설계(fail-closed)이고, 그런 이름이 리그에 따라 15~63% 의 상수
 *    배경으로 깔린다. 그래서 **지금 규칙으로 다시 판정했을 때 한글이 되는 것만** 센다 —
 *    그것이 곧 "코드가 놓친 것"이다. 실사고 287경기가 정확히 이 부류였다.
 *
 * 판정에는 파이프라인과 **같은 순수 모듈**(`localizeTimelineName`)을 쓴다. 규칙을 복제하면
 * 감시와 저장이 서로 다른 말을 하게 되고, 사전이 자라면 감시도 저절로 따라온다.
 *
 * ⚠️ 대조 근거는 **그 경기 저장 라인업(roster)** 만 쓴다. 스쿼드 사전 폴백까지 부르면
 *    팀 사전 → 스쿼드 조회가 경기마다 붙어 60초 예산을 넘긴다. 감지에 필요한 것은 완전성이
 *    아니라 민감도인데, 이 병(Ø 계열)은 **roster 만으로 전부 잡힌다** — 라인업에는 한글로
 *    떠 있는 선수가 타임라인에만 영문으로 남은 것이 실사고의 모양이었다.
 */
import { localizeTimelineName, hasHangul, type RosterEntry } from "@/lib/lfa/scorer-name"

export interface TimelineEventLike {
  minute?: string
  player?: string
  inPlayer?: string
  assist?: string
}

export interface FixableName {
  label: string
  minute: string
  before: string
  after: string
}

/** 모수가 적을 땐 타이밍 잔재일 수 있다 — 이름 수 또는 경기 수 둘 중 하나를 넘겨야 운다 */
export const TIMELINE_MIN_NAMES = 5
export const TIMELINE_MIN_MATCHES = 3

/** 한 경기의 타임라인에서 "지금 규칙으로는 한글이 되는" 영문 이름을 찾는다 */
export function findFixableTimelineNames(
  events: TimelineEventLike[],
  roster: RosterEntry[],
  label: string
): FixableName[] {
  if (!Array.isArray(events) || roster.length === 0) return []
  const out: FixableName[] = []
  const seen = new Set<string>()
  for (const e of events) {
    for (const raw of [e?.player, e?.inPlayer, e?.assist]) {
      if (!raw || hasHangul(raw)) continue
      // 스쿼드 폴백은 의도적으로 비운다 (위 주석 참조)
      const ko = localizeTimelineName(raw, roster, [])
      if (!ko || !hasHangul(ko) || ko === raw) continue
      const dedupe = `${raw}→${ko}`
      if (seen.has(dedupe)) continue // 같은 선수가 여러 이벤트에 나온다 — 한 번만 센다
      seen.add(dedupe)
      out.push({ label, minute: String(e?.minute ?? ""), before: raw, after: ko })
    }
  }
  return out
}

export interface TimelineLatinVerdict {
  names: FixableName[]
  matchCount: number
  alert: boolean
}

export function assessTimelineLatin(
  perMatch: FixableName[][],
  opts: { minNames?: number; minMatches?: number } = {}
): TimelineLatinVerdict {
  const minNames = opts.minNames ?? TIMELINE_MIN_NAMES
  const minMatches = opts.minMatches ?? TIMELINE_MIN_MATCHES
  const hit = (perMatch ?? []).filter((m) => m.length > 0)
  const names = hit.flat()
  return {
    names,
    matchCount: hit.length,
    alert: names.length >= minNames || hit.length >= minMatches,
  }
}
