import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

const unknownItemSchema = z.object({
  source: z.enum(["game", "result"]),
  gm_ts: z.union([z.string(), z.number()]).transform(String),
  // sentinel defaults match the DB (-1 / '') so ON CONFLICT works without NULL gymnastics.
  game_no: z.number().int().nullable().optional(),
  bet_typ_id: z.union([z.string(), z.number()]).nullable().optional(),
  handi_val: z.number().int().nullable().optional(),
  game_result: z.string().nullable().optional(),
  mch_score: z.string().nullable().optional(),
  home_score: z.number().int().nullable().optional(),
  away_score: z.number().int().nullable().optional(),
  sport: z.string().nullable().optional(),
  league_code: z.string().nullable().optional(),
  home_team_name: z.string().nullable().optional(),
  away_team_name: z.string().nullable().optional(),
  match_time: z.string().nullable().optional(),
  raw_data: z.record(z.unknown()),
})

const postSchema = z.object({
  items: z.array(unknownItemSchema).min(1, "items 배열이 비어 있습니다."),
})

/**
 * POST /api/betman/unknown-games
 *
 * VPS scraper 가 BET_TYPE_MAP / RESULT_HANDI_MAP 에 없는 게임/결과를 발견했을 때
 * raw 형태로 보관하는 보관소. 정산/UI 와 무관.
 *
 * 같은 (source, gm_ts, game_no, bet_typ_id, handi_val) 조합이 다시 들어오면
 * last_seen_at + raw_data 만 갱신 (seen_count 는 update 측에서 ++ 못 하므로 그대로 둠).
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

    const parsed = postSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }

    const supabase = createServiceRoleClient()
    const now = new Date().toISOString()

    const rows = parsed.data.items.map((item) => ({
      source: item.source,
      gm_ts: item.gm_ts,
      game_no: item.game_no ?? -1,
      bet_typ_id: item.bet_typ_id != null ? String(item.bet_typ_id) : "",
      handi_val: item.handi_val ?? -1,
      game_result: item.game_result ?? null,
      mch_score: item.mch_score ?? null,
      home_score: item.home_score ?? null,
      away_score: item.away_score ?? null,
      sport: item.sport ?? null,
      league_code: item.league_code ?? null,
      home_team_name: item.home_team_name ?? null,
      away_team_name: item.away_team_name ?? null,
      match_time: item.match_time ?? null,
      raw_data: item.raw_data,
      last_seen_at: now,
    }))

    const { error } = await supabase.from("betman_unknown_games").upsert(rows, {
      onConflict: "source,gm_ts,game_no,bet_typ_id,handi_val",
      ignoreDuplicates: false,
    })

    if (error) {
      console.error("betman_unknown_games upsert error:", error)
      return NextResponse.json(
        { error: "미지원 게임 raw 저장 중 오류가 발생했습니다." },
        { status: 500 }
      )
    }

    return NextResponse.json({
      total: rows.length,
      message: `${rows.length}건 raw 저장 완료`,
    })
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
