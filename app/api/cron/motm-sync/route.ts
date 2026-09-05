import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"
import { sweepMotmPolls } from "@/lib/motm/poll"

// LFA-only fixtures also fetch confirmed lineups/FT evidence through the shared pipeline.
export const maxDuration = 120

/**
 * MoTM 폴 생성·마감 스윕 (2026-08-22, 15분 간격 — vercel.json 등록).
 *
 * 생성: FT(킥오프+110분) 지난 매치 페이지 리그 경기 → 라인업 스냅샷(선발+교체 투입)을
 *       후보로 polls(kind='motm') 1행. match_key unique 라 마켓 중복 행·재실행에 안전.
 * 마감: closes_at(익일 11:00 KST) 지난 폴 is_active=false → 투표 API 가 자동 차단.
 * 보강: 교체 후보가 통째로 빠진 채 만들어진 폴은 라인업이 뒤늦게 고쳐지면 다시 짠다
 *       (2026-08-31). 표가 있으면 빠진 후보만 덧붙여 이미 던진 표를 지킨다.
 */
async function cronGet(request: NextRequest) {
  const start = Date.now()
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const result = await sweepMotmPolls()
    return NextResponse.json({
      mode: "motm-sync",
      ...result,
      duration: `${Date.now() - start}ms`,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

export const GET = withCronLog("motm-sync", cronGet)
export async function POST(request: NextRequest) {
  return cronGet(request)
}
