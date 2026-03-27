import { NextRequest, NextResponse } from "next/server"
import { createAnonClient } from "@/lib/supabase/server"

/**
 * GET /api/profile/check-nickname?nickname=xxx
 * 닉네임 중복 확인 (회원가입/설정에서 실시간 체크)
 */
export async function GET(request: NextRequest) {
  const nickname = request.nextUrl.searchParams.get("nickname")?.trim()

  if (!nickname || nickname.length < 2) {
    return NextResponse.json({ available: false, error: "닉네임은 2자 이상이어야 합니다." })
  }

  if (nickname.length > 20) {
    return NextResponse.json({ available: false, error: "닉네임은 20자 이하여야 합니다." })
  }

  const nicknameRegex = /^[\p{L}\p{N}\s\-_.]+$/u
  if (!nicknameRegex.test(nickname)) {
    return NextResponse.json({ available: false, error: "닉네임에 특수문자를 사용할 수 없습니다." })
  }

  const supabase = createAnonClient()
  const { data } = await supabase
    .from("profiles")
    .select("user_id")
    .ilike("nickname", nickname)
    .is("deleted_at", null)
    .limit(1)
    .single()

  const res = NextResponse.json({ available: !data })
  res.headers.set("Cache-Control", "no-store")
  return res
}
