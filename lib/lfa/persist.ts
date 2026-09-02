import "server-only"

import { createServiceRoleClient } from "@/lib/supabase/server"
// ⚠️ 반드시 type-only import — match.ts 가 이 파일을 값으로 가져오므로 런타임 순환이 된다
import type { LfaMatchInfo } from "@/lib/lfa/match"
import type { LfaMatch } from "@/lib/lfa/client"
// 재구매 주기 정책 = 크레딧 비용의 절반. 순수 함수라 따로 두고 시험이 지킨다.
import { dayFreshnessMs, detailsFreshnessMs } from "@/lib/lfa/day-freshness"
import { getSiblingGameIds } from "@/lib/match/sibling-ids"
import { pickDetailsRow } from "@/lib/match/pick-sibling-row"

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

export interface CachedMatchDetails {
  info: LfaMatchInfo
  updatedAt: number
  /** 신선도 기준을 넘겼는가 — 넘겼어도 값은 쓴다(LFA 실패 시 폴백) */
  stale: boolean
}

/* ── 경기 상세 ── */

export async function readMatchDetails(
  gameId: string,
  matchTime?: string | null
): Promise<CachedMatchDetails | null> {
  try {
    // ⚠️ 형제 행까지 본다 (2026-09-02). 자기 행만 보면 다른 마켓 행으로 들어온 요청마다 LFA 를
    //    다시 사고 복사본을 하나 더 만들었다. 여러 행이면 finished 가 이기고 → 최신
    //    (첼시 4-3: 경기 중 1-0 으로 굳은 행 3개 옆에 FT 행이 있었다).
    const supabase = createServiceRoleClient()
    const ids = await getSiblingGameIds(supabase, gameId)
    const { data: rows } = await supabase
      .from("match_details_cache")
      .select("game_id, payload, finished, updated_at")
      .in("game_id", ids)
    const data = pickDetailsRow(
      (rows ?? []) as { game_id: string; payload: unknown; finished: unknown; updated_at: string }[]
    )
    if (!data?.payload) return null

    const info = data.payload as unknown as LfaMatchInfo
    const updatedAt = new Date(String(data.updated_at)).getTime()
    if (!Number.isFinite(updatedAt)) return null

    const age = Date.now() - updatedAt
    // ⚠️ 수명은 **시계**가 정한다 — 캐시된 live 플래그에 물으면 스스로 갇힌다.
    //    (2026-08-25 풀럼:첼시 — 상세가 live:false 로 굳어 매치센터가 스코어를 못 봤다)
    const limit = detailsFreshnessMs({
      finished: data.finished === true,
      live: info.live === true,
      matchTime,
      // 끝났는데 타임라인이 비어 있다 = LFA 가 아직 못 채운 반쪽 (프로 경기에 이벤트 0은 없다)
      emptyDetails: (info.timeline?.length ?? 0) === 0,
    })
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
    const matches = data.payload as unknown as LfaMatch[]
    // 지난 KST 날은 값이 굳었다 — 다시 안 부른다.
    const limit = live ? dayFreshnessMs(dateUtc, matches) : Infinity
    return { matches, stale: Date.now() - updatedAt > limit }
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
