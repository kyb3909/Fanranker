import "server-only"

import { SupabaseClient } from "@supabase/supabase-js"
import { getLfaDayIndex, lookupLfaDayEntry } from "@/lib/lfa/match"
import { notifyDiscordOps } from "@/lib/discord-notify"
import { decideVerdict, checkResultConsistency, type CheckVerdict } from "./crosscheck-verdict"
import { deriveResultFromScore } from "./result-mapper"

/**
 * 축구 결과 교차검증 러너 + 정산 게이트 (2026-08-30 운영자 확정).
 *
 * "크로스 체크가 완료되고, 오류가 있으면 알림으로 알려주고, 그게 다 되어야
 *  이후에 맞춘 것도 정산."
 *
 * ## 흐름
 * settle-pending 크론(15분)이 ① crosscheckFootballResults 로 최근 완료 축구 경기를
 * LFA 와 대조해 betman_result_checks 에 verdict 를 남기고(불일치는 디스코드 알림),
 * ② settlePredictions 안의 filterVerifiedForSettle 이 verdict 없는/불합격 축구
 * 경기를 정산에서 제외한다. 정산 진입로가 네 곳(results·settle·predictions/settle·
 * sweep)이지만 전부 settlePredictions 로 모이므로 게이트는 거기 하나다.
 *
 * ## 크레딧 규율 (⚠️ 2026-08-25 하루 10,885건 화재 전력)
 * LFA 는 **하루치 색인**(getLfaDayIndex, KST 날짜당 fetch ≤2회 + 캐시)만 쓴다.
 * 검사 대상이 없으면 색인 자체를 부르지 않는다. 대상은 최근 48시간 완료 경기뿐.
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
  pending: number
  waived: number
  alerted: number
}

/** KST 달력 날짜 — LFA 색인 키 */
function kstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

/**
 * ① 최근 완료 축구 경기 교차검증 — verdict upsert + 불일치·유예 알림.
 * match/waived 로 이미 굳은 경기는 다시 보지 않는다. mismatch·pending 은 재검한다
 * (와이즈토토가 나중에 정정하거나 LFA 가 뒤늦게 채워질 수 있다).
 */
export async function crosscheckFootballResults(
  supabase: SupabaseClient
): Promise<CrosscheckSummary> {
  const summary: CrosscheckSummary = {
    scanned: 0,
    match: 0,
    mismatch: 0,
    pending: 0,
    waived: 0,
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
    ((existing ?? []) as { game_id: string; verdict: CheckVerdict }[])
      .filter((c) => c.verdict === "match" || c.verdict === "waived")
      .map((c) => c.game_id)
  )
  const targets = rows.filter((g) => !settled.has(g.id))
  if (targets.length === 0) return summary
  summary.scanned = targets.length

  // 날짜별 색인 — 필요한 KST 날짜만, 한 번씩
  const dates = [...new Set(targets.map((g) => kstDate(g.match_time)))]
  const indexes = new Map<string, Awaited<ReturnType<typeof getLfaDayIndex>>>()
  for (const d of dates) indexes.set(d, await getLfaDayIndex(d))

  const now = Date.now()
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
    const index = indexes.get(kstDate(g.match_time))
    const lfaEntry =
      index && g.league_code
        ? (lookupLfaDayEntry(index, { leagueCode: g.league_code, matchTime: g.match_time }) ?? null)
        : null
    const kickoffMs = new Date(g.match_time).getTime()
    // 와이즈토토 보존값 — 경기 끝난 뒤 캡처분만 인정 (전반 1-0 같은 미완 스코어 차단)
    const wtFinal =
      g.wisetoto_at &&
      new Date(g.wisetoto_at).getTime() >= kickoffMs + WISETOTO_FINAL_CAPTURE_MIN * 60_000
    const r = decideVerdict({
      betman: { home: g.home_score, away: g.away_score },
      wisetoto: wtFinal ? { home: g.wisetoto_home_score, away: g.wisetoto_away_score } : null,
      lfa: lfaEntry,
      hoursSinceKickoff: (now - kickoffMs) / 3600_000,
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
        title: `⚠️ 경기 결과 불일치 ${fresh.length}건 — 정산 보류 중`,
        description:
          "와이즈토토와 산 피드(LFA)의 스코어가 다릅니다. 확인 전까지 해당 경기 정산이 멈춰 있습니다.",
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

/* 정산 게이트(filterVerifiedForSettle)는 lib/betman/settle-gate.ts 로 분리했다 —
   이 파일은 server-only + LFA + 디스코드를 물고 있어 settle.ts 가 import 하면
   settle 테스트 파일이 열리지 못한다 (0 test 함정). */
