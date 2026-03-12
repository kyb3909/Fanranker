import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

const EquipSchema = z.object({
  board_slug: z.string().min(1, "게시판을 선택해주세요."),
  adj_title_id: z.string().uuid().nullable().optional(),
  noun_title_id: z.string().uuid().nullable().optional(),
})

/**
 * POST /api/titles/equip
 *
 * 게시판별 칭호 장착/변경
 * adj_title_id, noun_title_id에 null을 보내면 해제
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }

    const result = EquipSchema.safeParse(body)
    if (!result.success) {
      return apiBadRequest(result.error.issues[0]?.message || "잘못된 입력입니다.")
    }

    const { board_slug, adj_title_id, noun_title_id } = result.data
    const supabase = createServiceRoleClient()
    const userId = user.id

    // 형용사 칭호 보유 여부 확인
    if (adj_title_id) {
      const { data: owned } = await supabase
        .from("user_adj_titles")
        .select("id")
        .eq("user_id", userId)
        .eq("adj_title_id", adj_title_id)
        .single()

      if (!owned) {
        return apiBadRequest("보유하지 않은 형용사 칭호입니다.")
      }
    }

    // 명사 칭호 보유 여부 확인
    if (noun_title_id) {
      const { data: owned } = await supabase
        .from("user_noun_titles")
        .select("id")
        .eq("user_id", userId)
        .eq("noun_title_id", noun_title_id)
        .single()

      if (!owned) {
        return apiBadRequest("보유하지 않은 명사 칭호입니다.")
      }
    }

    // upsert 장착 정보
    const { data, error } = await supabase
      .from("user_equipped_titles")
      .upsert(
        {
          user_id: userId,
          board_slug,
          adj_title_id: adj_title_id || null,
          noun_title_id: noun_title_id || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,board_slug" }
      )
      .select()
      .single()

    if (error) {
      return apiError("칭호 장착 중 오류가 발생했습니다.", 500, error)
    }

    return NextResponse.json(data)
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
