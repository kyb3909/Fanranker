/**
 * 불변식 판정 — betman 경기에 붙은 LFA 매치가 **같은 팀의 경기인가** (순수 모듈, 2026-09-02).
 *
 * ## 왜 필요한가
 * betman↔LFA 연결(`lib/lfa/match.ts resolveMatch`)은 (리그, 킥오프 HH:MM) 이 가장 강한 신호다.
 * 같은 시각에 후보가 하나뿐이면 팀명을 보지 않고 확정해 왔다(2026-08-16 실측 10/10 이 이 단계).
 * 그 지름길은 두 일정이 어긋나는 날 — 연기, 킥오프 변경, betman 이 그 경기를 안 파는 경우 —
 * **남의 경기에 붙는다.** 붙고 나면 매치센터·라인업·MoTM 이 종료 전까지 남의 경기를 보여주고,
 * 결과 대조는 FT 뒤에야 "불일치"로 알린다. 그래서 링크 자체를 매시 대조한다.
 *
 * ## 무엇과 무엇을
 * 우리가 저장한 링크(`match_details_cache.lfa_match_id`)를 그날 LFA 목록 사본(`lfa_day_cache`,
 * 팀명 포함)에서 찾아 LFA 양 팀명을 얻고, betman 한글 팀명 → 사전 영문명과 `teamMatches` 로
 * 대조한다. 대조 규칙은 연결 코드가 쓰는 것과 **같은 함수**여야 한다 — 감사관이 다른 자로 재면
 * 감사관의 오탐인지 링크의 오류인지 구분이 안 된다.
 *
 * ## 판정 못 하는 경우는 세지 않는다
 *  · 사전에 한쪽 팀이라도 없으면 `unknown_team` — 한글명 토큰은 영문명과 겹칠 수 없어 대조 불가
 *  · 그날 LFA 목록 사본에 그 id 가 없으면 `no_day_cache` — 근거가 없다
 * 둘 다 finding 이 아니다. "모른다"를 "틀렸다"로 올리면 감사관이 신뢰를 잃는다.
 */

import { teamMatches } from "@/lib/match/pair-fixtures"

export interface LinkedGame {
  gameId: string
  /** 사람이 읽을 경기 표시 — "첼시 v 브라이턴 08-30 22:00" */
  label: string
  homeKr: string
  awayKr: string
  lfaMatchId: string
}

export interface LfaNamedMatch {
  id: string
  homeName: string
  awayName: string
}

export type LinkStatus = "ok" | "mismatch" | "unknown_team" | "no_day_cache"

export interface LinkVerdict {
  gameId: string
  label: string
  lfaMatchId: string
  status: LinkStatus
  homeEn: string | null
  awayEn: string | null
  lfaHome: string | null
  lfaAway: string | null
}

/** 사전이 양 팀을 알 때만 참/거짓. 모르면 null (판정 불가) */
export function linkTeamsAgree(
  lfa: { homeName: string; awayName: string },
  homeEn: string | null | undefined,
  awayEn: string | null | undefined
): boolean | null {
  if (!homeEn || !awayEn) return null
  return teamMatches(lfa.homeName, homeEn) && teamMatches(lfa.awayName, awayEn)
}

export function auditLfaLinks(
  games: LinkedGame[],
  lfaById: Map<string, LfaNamedMatch>,
  teamEn: Map<string, string>
): LinkVerdict[] {
  const out: LinkVerdict[] = []
  for (const g of games) {
    const homeEn = teamEn.get(g.homeKr.trim()) ?? null
    const awayEn = teamEn.get(g.awayKr.trim()) ?? null
    const lfa = lfaById.get(g.lfaMatchId) ?? null
    const base = {
      gameId: g.gameId,
      label: g.label,
      lfaMatchId: g.lfaMatchId,
      homeEn,
      awayEn,
      lfaHome: lfa?.homeName ?? null,
      lfaAway: lfa?.awayName ?? null,
    }
    if (!lfa) {
      out.push({ ...base, status: "no_day_cache" })
      continue
    }
    const agree = linkTeamsAgree(lfa, homeEn, awayEn)
    if (agree === null) {
      out.push({ ...base, status: "unknown_team" })
      continue
    }
    out.push({ ...base, status: agree ? "ok" : "mismatch" })
  }
  return out
}

export function summarizeLinkAudit(verdicts: LinkVerdict[]): Record<LinkStatus, number> {
  const s: Record<LinkStatus, number> = { ok: 0, mismatch: 0, unknown_team: 0, no_day_cache: 0 }
  for (const v of verdicts) s[v.status]++
  return s
}
