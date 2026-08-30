import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { backfillTeamDictionaryFromLfa } from "@/lib/lfa/team-backfill"

/**
 * 팀 사전 자동 백필 (2026-08-30).
 *
 * ## 왜 크론인가
 * `team_dictionary` 에 없는 팀은 선수 한글화가 통째로 실패한다 — 라인업이 영문으로
 * 나가고, 심하면 라인업·스탯·타임라인이 아예 안 뜬다 (2026-08-23 브라이턴·본머스 실사고).
 * 로직은 스크립트로 있었지만 **사람이 기억해서 돌려야** 했고, 그래서 8/30 에 분데스리가
 * 4팀(프라이부르크·아우크스부르크·브레멘·샬케)이 미등재로 남아 같은 사고가 재발했다.
 * 운영자: "이건 서버에서 자체적으로 처리해야 하는 부분이잖아."
 *
 * 승격·강등·컵대회 라운드마다 새 팀이 들어오므로 이 구멍은 **주기적으로 다시 생긴다.**
 * 사람이 알아채는 시점은 늘 "이미 그 경기 라인업이 영문으로 나간 뒤"다.
 *
 * ## 비용
 * `matches?date=` 는 **호출당 1크레딧**이다. `days=3` 이면 회차당 최대 3크레딧,
 * 하루 1회면 월 90크레딧 — 잔여 22만 대비 무시할 수준이다.
 * ⚠️ days 를 늘리면 그대로 곱해진다. 늘리기 전에 `lfa_usage_log` 로 소모율을 볼 것.
 *
 * ## 안전
 * 등재 판정은 전부 `lib/lfa/team-backfill.ts` 안에 있고 fail-closed 다 — 동시 킥오프로
 * 팀을 확정 못 하면 **등재하지 않는다.** 남의 팀 이름이 박히는 것이 최악이라서다.
 */
export const maxDuration = 120

async function cronGet(request: NextRequest) {
  const start = Date.now()
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const apiKey = process.env.LIVE_FOOTBALL_API_KEY
    if (!apiKey) {
      return NextResponse.json({ mode: "team-dictionary-backfill", skipped: "API 키 없음" })
    }

    // 3일이면 직전 라운드까지 덮는다 — 새 팀은 라운드 단위로 들어오므로 그 이상은 낭비다
    const result = await backfillTeamDictionaryFromLfa(createServiceRoleClient(), {
      apiKey,
      days: 3,
      apply: true,
    })

    if (result.dictAdded.length > 0) {
      console.warn(
        `[team-dictionary-backfill] 신규 등재 ${result.dictAdded.length}건: ` +
          result.dictAdded.map((d) => `${d.kr}(${d.en})`).join(", ")
      )
    }

    return NextResponse.json({
      mode: "team-dictionary-backfill",
      missing: result.missing.length,
      found: result.found.length,
      unresolved: result.unresolved,
      labelsWritten: result.labelsWritten,
      dictAdded: result.dictAdded,
      dictSkipped: result.dictSkipped,
      failedDates: result.failedDates,
      duration: `${Date.now() - start}ms`,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

export const GET = withCronLog("team-dictionary-backfill", cronGet)
export async function POST(request: NextRequest) {
  return cronGet(request)
}
