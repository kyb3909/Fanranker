import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { z } from "zod"
import { apiBadRequest, apiError, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * 아바타 유니폼 — 보유 목록 조회 / 활동 점수로 구매.
 *
 * 화폐는 **활동 점수**(user_flair_scores.score_balance) 다. 벽돌 기부와 같은
 * 지갑에서 나가고, 같은 규칙으로 자기 팀 것만 살 수 있다 (운영자 확정 8/29).
 * 가격·구단 매핑의 정본은 DB 의 avatar_kits — 클라이언트가 보내는 값을 믿지 않는다.
 */
const BuySchema = z.object({
  kit_key: z.string().min(1),
  flair_id: z.string().uuid("말머리를 선택해 주세요."),
})

export async function GET() {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const supabase = createServiceRoleClient()
    const [catalog, owned, profile, scores] = await Promise.all([
      supabase
        .from("avatar_kits")
        .select("kit_key, team_id, name, price_points")
        .eq("is_active", true),
      supabase.from("user_avatar_kits").select("kit_key, acquired_at").eq("user_id", user.id),
      supabase
        .from("profiles")
        .select("equipped_kit_key, avatar_character")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("user_flair_scores")
        .select("flair_id, score_balance, post_flairs!inner(team_id, name)")
        .eq("user_id", user.id)
        .gt("score_balance", 0),
    ])

    return NextResponse.json(
      {
        catalog: catalog.data ?? [],
        owned: (owned.data ?? []).map((row) => row.kit_key),
        equippedKitKey: profile.data?.equipped_kit_key ?? null,
        character: profile.data?.avatar_character ?? null,
        // 팀별 활동 점수 지갑 — 어떤 말머리로 살 수 있는지 화면이 보여준다
        wallets: scores.data ?? [],
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (cause) {
    return apiError("유니폼 정보를 불러오지 못했습니다.", 500, cause)
  }
}

export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청입니다.")
    }
    const parsed = BuySchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.issues[0]?.message ?? "잘못된 입력입니다.")
    }

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase.rpc("buy_avatar_kit", {
      p_user_id: user.id,
      p_flair_id: parsed.data.flair_id,
      p_kit_key: parsed.data.kit_key,
    })
    if (error) return apiError("구매에 실패했습니다.", 500, error)

    const result = data as { ok: boolean; error?: string }
    if (!result?.ok) {
      return NextResponse.json({ error: result?.error ?? "구매에 실패했습니다." }, { status: 400 })
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch (cause) {
    return apiError("구매에 실패했습니다.", 500, cause)
  }
}
