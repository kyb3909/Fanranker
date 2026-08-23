import "server-only"

import { createServiceRoleClient } from "@/lib/supabase/server"
// ⚠️ 반드시 type-only import — match.ts 가 이 파일을 값으로 가져오므로 런타임 순환이 된다
import type { LfaMatchInfo } from "@/lib/lfa/match"
import type { LfaMatch } from "@/lib/lfa/client"

/**
 * 경기 상세 영구 캐시 (2026-08-24 — "왜 자꾸 데이터가 제때 안 뜨냐" 에 대한 구조 답).
 *
 * ## 무엇이 문제였나
 * 매치센터는 **사용자가 페이지를 여는 순간** LFA 를 불렀다. 그런데
 *  · LFA 는 서버 캐시가 비면 수십 초가 걸린다 (실측: matches 46초, details 120초 초과)
 *  · 우리 `unstable_cache` 는 **배포할 때마다 초기화**된다 — 자주 배포할수록 자주 차갑다
 *  · 한 번 실패하면 그 자리에서 빈 화면이다 (스코어·라인업·스탯·타임라인이 한꺼번에)
 *
 * 즉 화면이 외부 API 의 그날 컨디션에 직접 매달려 있었다. 그게 "제때 안 뜬다" 의 정체다.
 *
 * ## 바꾼 것
 * cron 이 미리 받아 이 표에 적재하고, 화면은 **DB 를 먼저** 읽는다 (수 ms, 배포와 무관).
 * LFA 가 느리거나 죽어도 마지막으로 받은 값을 내준다 — 빈 화면보다 조금 낡은 값이 낫다.
 *
 * 신선도 기준은 화면이 필요로 하는 만큼만:
 *  · 종료 = 값이 굳었다. 영구 (다시 안 부른다 → 크레딧 0)
 *  · 라이브 = 60초 (경기 분·스코어가 움직인다)
 *  · 그 외 = 10분
 */

const FRESH_LIVE_MS = 60_000
const FRESH_OTHER_MS = 10 * 60_000

export interface CachedMatchDetails {
  info: LfaMatchInfo
  updatedAt: number
  /** 신선도 기준을 넘겼는가 — 넘겼어도 값은 쓴다(LFA 실패 시 폴백) */
  stale: boolean
}

/* ── 경기 상세 ── */

export async function readMatchDetails(gameId: string): Promise<CachedMatchDetails | null> {
  try {
    const { data } = await createServiceRoleClient()
      .from("match_details_cache")
      .select("payload, finished, updated_at")
      .eq("game_id", gameId)
      .maybeSingle()
    if (!data?.payload) return null

    const info = data.payload as unknown as LfaMatchInfo
    const updatedAt = new Date(String(data.updated_at)).getTime()
    if (!Number.isFinite(updatedAt)) return null

    const age = Date.now() - updatedAt
    const limit = data.finished ? Infinity : info.live ? FRESH_LIVE_MS : FRESH_OTHER_MS
    return { info, updatedAt, stale: age > limit }
  } catch {
    // fail-open — 캐시를 못 읽으면 평소대로 LFA 를 부른다
    return null
  }
}

/* ── 날짜별 경기 목록 ── */

/**
 * 하루치 목록은 **모든 것의 앞단**이다 — 이게 비면 경기 해석(resolveMatch)이 막히고
 * 라인업·스탯·타임라인·불판이 한꺼번에 죽는다. 그런데 응답이 913KB 라 가장 느리고
 * 가장 자주 실패한다. 그래서 여기도 DB 에 눕힌다.
 *
 * 저장은 화면이 실제로 쓰는 필드만 (로고·부가정보 제외 — 900KB → 200KB 수준).
 */
export interface CachedDayMatches {
  matches: LfaMatch[]
  stale: boolean
}

function trimMatch(m: LfaMatch): LfaMatch {
  return {
    id: m.id,
    league: { id: m.league?.id, name: m.league?.name } as LfaMatch["league"],
    kickoff: m.kickoff,
    status: m.status,
    home: { id: m.home?.id, name: m.home?.name, score: m.home?.score } as LfaMatch["home"],
    away: { id: m.away?.id, name: m.away?.name, score: m.away?.score } as LfaMatch["away"],
    ...(m.halftime ? { halftime: m.halftime } : {}),
  }
}

export async function readDayMatches(
  dateUtc: string,
  live: boolean
): Promise<CachedDayMatches | null> {
  try {
    const { data } = await createServiceRoleClient()
      .from("lfa_day_cache")
      .select("payload, updated_at")
      .eq("date_utc", dateUtc)
      .maybeSingle()
    if (!data?.payload) return null

    const updatedAt = new Date(String(data.updated_at)).getTime()
    if (!Number.isFinite(updatedAt)) return null
    // 지난 날은 값이 굳었다 — 다시 안 부른다. 오늘·미래만 5분.
    const limit = live ? 5 * 60_000 : Infinity
    return {
      matches: data.payload as unknown as LfaMatch[],
      stale: Date.now() - updatedAt > limit,
    }
  } catch {
    return null
  }
}

export async function writeDayMatches(dateUtc: string, matches: LfaMatch[]): Promise<void> {
  try {
    await createServiceRoleClient()
      .from("lfa_day_cache")
      .upsert(
        {
          date_utc: dateUtc,
          payload: matches.map(trimMatch) as unknown as Record<string, unknown>[],
          match_count: matches.length,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "date_utc" }
      )
  } catch {
    /* 적재 실패가 화면을 깨면 안 된다 */
  }
}

export async function writeMatchDetails(gameId: string, info: LfaMatchInfo): Promise<void> {
  try {
    await createServiceRoleClient()
      .from("match_details_cache")
      .upsert(
        {
          game_id: gameId,
          lfa_match_id: info.matchId,
          payload: info as unknown as Record<string, unknown>,
          finished: info.finished,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "game_id" }
      )
  } catch {
    // 적재 실패가 화면을 깨면 안 된다
  }
}
