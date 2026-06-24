import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

/**
 * GET  /api/flair-prefs — 내 말머리 즐겨찾기/뮤트 목록
 * POST /api/flair-prefs — 말머리 pref 토글 (favorite | mute | null=해제)
 *
 * 담벼락 개인화. 클라(use-feed)가 GET 으로 prefs 를 받아
 * only_flairs / exclude_flairs URL 파라미터로 /api/posts 에 전달한다.
 * API 는 service role 로 RLS 우회하되 Clerk user.id 로 본인 행만 다룬다.
 */
export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ prefs: [] })

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from("user_flair_prefs")
    .select("flair_id, pref")
    .eq("user_id", user.id)

  if (error) return apiError("말머리 설정을 불러오지 못했습니다.", 500, error)

  const res = NextResponse.json({ prefs: data ?? [] })
  res.headers.set("Cache-Control", "private, no-store")
  return res
}

const PrefSchema = z.object({
  flair_id: z.string().uuid(),
  pref: z.enum(["favorite", "mute"]).nullable(),
})

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, "STANDARD")
  if (limited) return limited

  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiBadRequest("잘못된 요청 본문입니다.")
  }
  const result = PrefSchema.safeParse(body)
  if (!result.success) {
    return apiBadRequest(result.error.issues[0]?.message || "잘못된 입력입니다.")
  }
  const { flair_id, pref } = result.data

  const supabase = createServiceRoleClient()
  if (pref === null) {
    // 해제
    const { error } = await supabase
      .from("user_flair_prefs")
      .delete()
      .eq("user_id", user.id)
      .eq("flair_id", flair_id)
    if (error) return apiError("말머리 설정 저장에 실패했습니다.", 500, error)
  } else {
    // favorite / mute 설정 (토글 전환 포함)
    const { error } = await supabase
      .from("user_flair_prefs")
      .upsert({ user_id: user.id, flair_id, pref }, { onConflict: "user_id,flair_id" })
    if (error) return apiError("말머리 설정 저장에 실패했습니다.", 500, error)
  }

  return NextResponse.json({ ok: true })
}
