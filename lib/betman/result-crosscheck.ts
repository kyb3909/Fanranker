import "server-only"

import { SupabaseClient } from "@supabase/supabase-js"
import { getLfaDayIndex, lookupLfaDayEntry } from "@/lib/lfa/match"
import { lfaDetailRow } from "@/lib/motm/ft-evidence"
import { notifyDiscordOps } from "@/lib/discord-notify"
import {
  decideVerdict,
  checkResultConsistency,
  type CheckVerdict,
  type LfaEvidence,
} from "./crosscheck-verdict"
import { deriveResultFromScore } from "./result-mapper"

/**
 * 축구 결과 교차검증 러너 — **표시·알림 전용** (2026-09-02 운영자 확정).
 *
 * 2026-08-30 엔 "verdict 가 match/waived 여야만 정산" 게이트의 앞단이었다. 4일 실측에서
 * mismatch 45건이 전부 대조기 자신의 오류였고 진짜 불일치는 0건, 그 사이 당첨 슬립
 * 하나가 63시간 얼었다. 게이트는 settle.ts 에서 걷어냈다(그쪽 주석에 전말). 운영자:
 * "결과가 다르게 나온 것 같다는 것만 어드민에서 표시만 해주는 거지, 일치해야만 통과는
 * 말이 안 돼." 이제 이 러너의 산출은 어드민 빨간불 + 디스코드 알림이고, 정산은 보지 않는다.
 *
 * ## 흐름
 * settle-pending 크론(15분)이 최근 완료 축구 경기를 LFA 와 대조해 betman_result_checks 에
 * verdict 를 남긴다(불일치는 디스코드 알림, 경기당 1회). 그게 전부다.
 *
 * ## LFA 증거는 **우리 DB 부터** (2026-09-02)
 * 종전엔 일별 색인을 (리그, 킥오프 HH:MM) 로 조인했는데, 동시 킥오프 슬롯에서 다른
 * 경기 점수를 받았다 — 첼시 4-3 이 선덜랜드 1-0 을 받아 "불일치". 45건 중 35건이
 * 이것이었다. 매치센터가 이미 경기별 LFA id 로 정확히 들고 있는 `match_details_cache`
 * (finished 행의 스코어)를 먼저 보고, 없을 때만 색인(충돌 키는 이제 null)을 쓴다.
 *
 * ## 크레딧 규율 (⚠️ 2026-08-25 하루 10,885건 화재 전력)
 * LFA 는 **하루치 색인**(getLfaDayIndex, KST 날짜당 fetch ≤2회 + 캐시)만 쓴다.
 * 검사 대상이 없으면 색인 자체를 부르지 않는다. 대상은 최근 48시간 완료 경기뿐.
 * match_details_cache 읽기는 DB 조회라 크레딧이 안 나간다.
 */

const LOOKBACK_HOURS = 48

interface FootballGameRow {
  id: string
  home_team_name: string
  away_team_name: string
  home_score: number | null
  away_score: number | null
  league_code: string | null
  match_time: string
  /* result 정합성 검사 재료 (2026-08-30 운영자: "베트맨에서 긁어오는 결과값들도 있잖아")
     — 정산이 실제로 읽는 result 는 betman.co.kr 크롤이 채우므로 따로 검증해야 한다 */
  game_type: string
  handicap: number | null
  over_under_line: number | null
  result: string | null
  /* 와이즈토토 보존값 (2026-08-30c) — 베트맨 공식이 덮어쓰기 전의 교차 상대 */
  wisetoto_home_score: number | null
  wisetoto_away_score: number | null
  wisetoto_at: string | null
}

/** 이 시각 이전 캡처는 미완(전반 등) 스코어로 본다 — 정규 90분 + 추가시간 여유 */
const WISETOTO_FINAL_CAPTURE_MIN = 105

export interface CrosscheckSummary {
  scanned: number
  match: number
  mismatch: number
  /** LFA 로 확인 불가(커버리지 밖·종료 전). 정산과 무관 — 표시용 */
  pending: number
  alerted: number
}

/** KST 달력 날짜 — LFA 색인 키 */
function kstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

/**
 * 최근 완료 축구 경기 교차검증 — verdict upsert + 불일치 알림.
 * match 로 굳은 경기는 다시 보지 않는다. mismatch·pending 은 매번 재검한다 — LFA 가
 * 뒤늦게 채워지거나(pending→match) 매핑이 고쳐지면(mismatch→match) 스스로 풀린다.
 * 옛 waived 행도 재검 대상이다(2026-09-02 이전 값 — 이제 만들지 않는다).
 */
export async function crosscheckFootballResults(
  supabase: SupabaseClient
): Promise<CrosscheckSummary> {
  const summary: CrosscheckSummary = {
    scanned: 0,
    match: 0,
    mismatch: 0,
    pending: 0,
    alerted: 0,
  }

  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString()
  const { data: games, error } = await supabase
    .from("betman_games")
    .select(
      "id, home_team_name, away_team_name, home_score, away_score, league_code, match_time, game_type, handicap, over_under_line, result, wisetoto_home_score, wisetoto_away_score, wisetoto_at"
    )
    .eq("sport", "축구")
    .eq("status", "completed")
    .not("result", "is", null)
    .gte("match_time", since)
    .limit(1000)
  if (error || !games || games.length === 0) return summary

  const rows = games as FootballGameRow[]
  const ids = rows.map((g) => g.id)
  const { data: existing } = await supabase
    .from("betman_result_checks")
    .select("game_id, verdict")
    .in("game_id", ids)
  const settled = new Set(
    ((existing ?? []) as { game_id: string; verdict: string }[])
      .filter((c) => c.verdict === "match")
      .map((c) => c.game_id)
  )
  const targets = rows.filter((g) => !settled.has(g.id))
  if (targets.length === 0) return summary
  summary.scanned = targets.length

  // ── LFA 증거 1순위: 우리 DB 의 경기별 상세 캐시 (2026-09-02) ──
  // 매치센터가 경기별 LFA id 로 정확히 매핑해 둔 값이다. finished 행의 스코어만 증거로
  // 친다 — 경기 중 스코어는 "종료 전"이라 pending 으로 남는 게 맞다.
  const targetIds = targets.map((g) => g.id)
  const evidenceByGame = new Map<string, LfaEvidence>()
  const { data: details } = await supabase
    .from("match_details_cache")
    .select("game_id, finished, payload")
    .in("game_id", targetIds)
  for (const row of (details ?? []) as { game_id: string; finished: unknown; payload: unknown }[]) {
    const ev = lfaDetailRow(row as Parameters<typeof lfaDetailRow>[0])
    const prev = evidenceByGame.get(row.game_id)
    // 같은 경기 행이 여럿이면 finished 인 쪽이 이긴다
    if (!prev || (!prev.finished && ev.finished)) evidenceByGame.set(row.game_id, ev)
  }

  // ── 2순위: 날짜별 색인 — 상세 캐시가 없는 경기만. 동시 킥오프 키는 색인이 이미 버린다 ──
  const needIndex = targets.filter((g) => !evidenceByGame.get(g.id)?.finished)
  const dates = [...new Set(needIndex.map((g) => kstDate(g.match_time)))]
  const indexes = new Map<string, Awaited<ReturnType<typeof getLfaDayIndex>>>()
  for (const d of dates) indexes.set(d, await getLfaDayIndex(d))

  const upserts: {
    game_id: string
    verdict: CheckVerdict
    betman_score: string | null
    wisetoto_score: string | null
    lfa_score: string | null
    note: string | null
    checked_at: string
  }[] = []
  const newMismatches: {
    game: FootballGameRow
    betman: string | null
    lfa: string | null
    note: string | null
  }[] = []

  for (const g of targets) {
    // 상세 캐시(finished) → 없으면 색인. 둘 다 없으면 null = pending
    const detail = evidenceByGame.get(g.id)
    let lfaEntry: LfaEvidence | null = detail?.finished ? detail : null
    if (!lfaEntry && g.league_code) {
      const index = indexes.get(kstDate(g.match_time))
      lfaEntry = index
        ? (lookupLfaDayEntry(index, { leagueCode: g.league_code, matchTime: g.match_time }) ?? null)
        : null
    }
    const kickoffMs = new Date(g.match_time).getTime()
    // 와이즈토토 보존값 — 경기 끝난 뒤 캡처분만 인정 (전반 1-0 같은 미완 스코어 차단)
    const wtFinal =
      g.wisetoto_at &&
      new Date(g.wisetoto_at).getTime() >= kickoffMs + WISETOTO_FINAL_CAPTURE_MIN * 60_000
    const r = decideVerdict({
      betman: { home: g.home_score, away: g.away_score },
      wisetoto: wtFinal ? { home: g.wisetoto_home_score, away: g.wisetoto_away_score } : null,
      lfa: lfaEntry,
    })
    let verdict = r.verdict
    let note: string | null = r.note

    // ② 스코어가 검증됐으면 result 필드(betman.co.kr 크롤분)도 그 스코어와 맞는지 본다.
    //    정산은 result 로 지급하므로, 스코어만 검증하면 지급 값이 검증 밖이다.
    if (verdict === "match" && g.home_score != null && g.away_score != null) {
      const expected = deriveResultFromScore(
        g.home_score,
        g.away_score,
        g.game_type as Parameters<typeof deriveResultFromScore>[2],
        g.handicap,
        g.over_under_line
      )
      const consistency = checkResultConsistency({
        homeScore: g.home_score,
        awayScore: g.away_score,
        storedResult: g.result,
        expectedResult: expected,
      })
      if (!consistency.ok) {
        verdict = "mismatch"
        // 스코어층 참고 메모가 있으면 뒤에 붙인다 (예: "LFA 상이(참고)")
        note = note ? `${consistency.note} · ${note}` : consistency.note
      }
    }

    summary[verdict]++
    upserts.push({
      game_id: g.id,
      verdict,
      betman_score: r.betmanScore,
      wisetoto_score: r.wisetotoScore,
      lfa_score: r.lfaScore,
      note,
      checked_at: new Date().toISOString(),
    })
    if (verdict === "mismatch") {
      newMismatches.push({ game: g, betman: r.betmanScore, lfa: r.lfaScore, note })
    }
  }

  if (upserts.length > 0) {
    await supabase.from("betman_result_checks").upsert(upserts, { onConflict: "game_id" })
  }

  // 불일치 알림 — 경기당 1회 (alerted_at 가드). 같은 사고를 15분마다 다시 울리지 않는다
  if (newMismatches.length > 0) {
    const { data: alertState } = await supabase
      .from("betman_result_checks")
      .select("game_id, alerted_at")
      .in(
        "game_id",
        newMismatches.map((m) => m.game.id)
      )
    const alreadyAlerted = new Set(
      ((alertState ?? []) as { game_id: string; alerted_at: string | null }[])
        .filter((c) => c.alerted_at)
        .map((c) => c.game_id)
    )
    const fresh = newMismatches.filter((m) => !alreadyAlerted.has(m.game.id))
    if (fresh.length > 0) {
      await notifyDiscordOps({
        title: `⚠️ 경기 결과 불일치 ${fresh.length}건 — 확인 필요 (정산은 진행됨)`,
        description:
          "베트맨과 산 피드(LFA)의 스코어가 다릅니다. 정산은 베트맨 결과대로 이미 나갔습니다 — 베트맨이 틀린 것으로 확인되면 사후 정정하세요.",
        level: "alert",
        url: "/admin/matches",
        fields: fresh.slice(0, 6).map((m) => ({
          name: `${m.game.home_team_name} vs ${m.game.away_team_name}`,
          value: m.note ?? `와이즈토토 ${m.betman ?? "?"} · LFA ${m.lfa ?? "?"}`,
        })),
      })
      await supabase
        .from("betman_result_checks")
        .update({ alerted_at: new Date().toISOString() })
        .in(
          "game_id",
          fresh.map((m) => m.game.id)
        )
      summary.alerted = fresh.length
    }
  }

  return summary
}

/* 정산 게이트(settle-gate.ts)는 2026-09-02 에 폐지했다 — 이 파일의 verdict 는 이제
   정산과 무관하다. settle.ts 는 이 파일을 import 하지 않는다 (server-only + LFA +
   디스코드를 물고 있어 settle 테스트가 열리지 못하는 0 test 함정도 그대로 피한다). */
