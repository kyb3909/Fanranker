import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

const roundPostSchema = z.object({
  gmTs: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  year: z.number().optional(),
  round: z.number().optional(),
})

/**
 * POST /api/betman/round
 *
 * n8n에서 새 회차(gmTs) 감지 시 호출.
 * betman_rounds에 해당 회차가 없으면 생성하고, round_id를 반환.
 * 이미 있으면 기존 round_id 반환.
 *
 * Body: { gmTs: string, year?: number, round?: number }
 * - gmTs: Betman에서 추출한 회차 키 (예: "260018")
 * - year: 연도 (미입력 시 현재 연도)
 * - round: 회차 번호 (미입력 시 gmTs 숫자로 사용)
 */
export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = roundPostSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "gmTs가 필요합니다.")
    }
    const gmTs = parsed.data.gmTs

    if (!gmTs) {
      return apiBadRequest("gmTs가 필요합니다.")
    }

    const supabase = createServiceRoleClient()
    const now = new Date()
    const year = parsed.data.year ?? now.getFullYear()
    const roundNum = parsed.data.round ?? (parseInt(gmTs, 10) || 0)

    // gm_ts로 이미 있는 회차인지 확인 (컬럼이 있으면)
    const { data: existing } = await supabase
      .from("betman_rounds")
      .select("id, year, round")
      .eq("gm_ts", gmTs)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({
        created: false,
        roundId: existing.id,
        year: existing.year,
        round: existing.round,
        gmTs,
      })
    }

    // year + round로도 확인 (gm_ts 없을 때 대비)
    const { data: existingByYearRound } = await supabase
      .from("betman_rounds")
      .select("id, year, round")
      .eq("year", year)
      .eq("round", roundNum)
      .maybeSingle()

    if (existingByYearRound) {
      // 기존 행에 gm_ts만 채우기
      const { error: updateError } = await supabase
        .from("betman_rounds")
        .update({ gm_ts: gmTs })
        .eq("id", existingByYearRound.id)
      if (updateError) {
        return apiError("회차 정보 업데이트 중 오류가 발생했습니다.", 500, updateError)
      }
      return NextResponse.json({
        created: false,
        roundId: existingByYearRound.id,
        year: existingByYearRound.year,
        round: existingByYearRound.round,
        gmTs,
      })
    }

    // 마감일: 7일 후 23:59 KST
    const deadline = new Date(now)
    deadline.setDate(deadline.getDate() + 7)
    deadline.setHours(23, 59, 59, 999)

    const { data: inserted, error } = await supabase
      .from("betman_rounds")
      .insert({
        gm_ts: gmTs,
        year,
        round: roundNum,
        status: "open",
        deadline: deadline.toISOString(),
      })
      .select("id, year, round")
      .single()

    if (error) {
      return apiError("회차 생성 중 오류가 발생했습니다.", 500, error)
    }

    return NextResponse.json({
      created: true,
      roundId: inserted.id,
      year: inserted.year,
      round: inserted.round,
      gmTs,
    })
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
