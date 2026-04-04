import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { z } from "zod"

const VALID_MBTI = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
] as const

const patchProfileSchema = z.object({
  nickname: z.string().optional(),
  avatar_url: z.string().nullable().optional(),
  bio: z.string().max(50).nullable().optional(),
  favorite_team: z.string().max(30).nullable().optional(),
  favorite_player: z.string().max(30).nullable().optional(),
  mbti: z.enum(VALID_MBTI).nullable().optional(),
  onboarding_completed: z.boolean().optional(),
})

const deleteProfileSchema = z.object({
  confirm: z.string(),
})

/**
 * GET /api/profile/me
 *
 * Get current user's profile
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
    }

    const userId = user.id

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    let supabase
    try {
      supabase = createServiceRoleClient()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류"
      console.error("Failed to create Supabase client:", errorMessage)
      return NextResponse.json({ error: "서버 설정 오류가 발생했습니다." }, { status: 500 })
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        "id, user_id, nickname, nickname_changed_at, avatar_url, bio, favorite_team, favorite_player, mbti, role, is_journalist, onboarding_completed, created_at, updated_at"
      )
      .eq("user_id", userId)
      .single()

    if (error && error.code !== "PGRST116") {
      console.error("Failed to fetch profile:", error)
      return NextResponse.json(
        { error: "프로필을 가져오는 중 오류가 발생했습니다." },
        { status: 500 }
      )
    }

    return NextResponse.json(profile || {}, {
      headers: { "Cache-Control": "private, max-age=30" },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("GET /api/profile/me error:", msg)
    return NextResponse.json({ error: "서버 오류", debug: msg }, { status: 500 })
  }
}

/**
 * PATCH /api/profile/me
 *
 * Update current user's profile
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
    }

    const userId = user.id

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = patchProfileSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }
    const {
      nickname,
      avatar_url,
      bio,
      favorite_team,
      favorite_player,
      mbti,
      onboarding_completed,
    } = parsed.data

    // 닉네임 유효성 검사
    if (nickname !== undefined) {
      const trimmedNickname = nickname.trim()
      if (trimmedNickname.length < 2) {
        return NextResponse.json({ error: "닉네임은 2자 이상이어야 합니다." }, { status: 400 })
      }
      if (trimmedNickname.length > 20) {
        return NextResponse.json({ error: "닉네임은 20자 이하여야 합니다." }, { status: 400 })
      }
      // 허용 문자: 한글, 영문, 숫자, 공백, 하이픈, 밑줄, 점
      if (!/^[\p{L}\p{N}\s\-_.]+$/u.test(trimmedNickname)) {
        return NextResponse.json(
          { error: "닉네임에 특수문자를 사용할 수 없습니다." },
          { status: 400 }
        )
      }
    }

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    let supabase
    try {
      supabase = createServiceRoleClient()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류"
      console.error("Failed to create Supabase client:", errorMessage)
      return NextResponse.json({ error: "서버 설정 오류가 발생했습니다." }, { status: 500 })
    }

    // avatar_url 도메인 검증
    if (avatar_url !== undefined && avatar_url !== null) {
      const { isAllowedImageUrl } = await import("@/lib/validate-image-url")
      if (!isAllowedImageUrl(avatar_url)) {
        return NextResponse.json({ error: "허용되지 않은 이미지 URL입니다." }, { status: 400 })
      }
    }

    // 닉네임 중복 체크
    if (nickname !== undefined) {
      const trimmedNickname = nickname.trim()
      const { data: existing } = await supabase
        .from("profiles")
        .select("user_id")
        .ilike("nickname", trimmedNickname)
        .is("deleted_at", null)
        .neq("user_id", userId)
        .limit(1)
        .single()

      if (existing) {
        return NextResponse.json({ error: "이미 사용 중인 닉네임입니다." }, { status: 409 })
      }
    }

    // Build update object
    const updateData: {
      nickname?: string
      nickname_changed_at?: string
      avatar_url?: string | null
      bio?: string | null
      favorite_team?: string | null
      favorite_player?: string | null
      mbti?: string | null
      onboarding_completed?: boolean
    } = {}
    if (nickname !== undefined) updateData.nickname = nickname.trim()
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url
    if (bio !== undefined) updateData.bio = bio
    if (favorite_team !== undefined) updateData.favorite_team = favorite_team
    if (favorite_player !== undefined) updateData.favorite_player = favorite_player
    if (mbti !== undefined) updateData.mbti = mbti
    if (onboarding_completed !== undefined) updateData.onboarding_completed = onboarding_completed

    const PROFILE_SELECT =
      "id, user_id, nickname, nickname_changed_at, avatar_url, bio, favorite_team, favorite_player, mbti, role, is_journalist, onboarding_completed, created_at, updated_at"

    // 먼저 프로필이 존재하는지 확인
    const { data: existingProfile, error: fetchError } = await supabase
      .from("profiles")
      .select("user_id, nickname, nickname_changed_at")
      .eq("user_id", userId)
      .single()

    // Case 1: DB 에러 (프로필 미존재가 아닌 진짜 에러)
    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Failed to check profile existence:", {
        error: fetchError,
        code: fetchError.code,
        message: fetchError.message,
        userId,
      })
      return NextResponse.json({ error: "프로필 확인 중 오류가 발생했습니다." }, { status: 500 })
    }

    // Case 2: 프로필이 없으면 새로 생성
    if (fetchError?.code === "PGRST116") {
      const defaultNickname = `User_${userId.slice(-8)}`
      const { data: newProfile, error: insertError } = await supabase
        .from("profiles")
        .insert({
          user_id: userId,
          nickname: updateData.nickname || defaultNickname,
          avatar_url: updateData.avatar_url || user.imageUrl || null,
          ...(bio !== undefined ? { bio } : {}),
          ...(favorite_team !== undefined ? { favorite_team } : {}),
          ...(favorite_player !== undefined ? { favorite_player } : {}),
          ...(mbti !== undefined ? { mbti } : {}),
          ...(onboarding_completed !== undefined ? { onboarding_completed } : {}),
        })
        .select(PROFILE_SELECT)
        .single()

      if (insertError) {
        console.error("Failed to create profile:", { error: insertError, userId })
        return NextResponse.json({ error: "프로필 생성 중 오류가 발생했습니다." }, { status: 500 })
      }
      return NextResponse.json(newProfile)
    }

    // Case 3: 프로필 존재 — 닉네임 쿨다운 체크
    if (nickname !== undefined && existingProfile) {
      const trimmedNickname = nickname.trim()
      if (trimmedNickname !== existingProfile.nickname && existingProfile.nickname_changed_at) {
        const NICKNAME_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000
        const nextChangeAt =
          new Date(existingProfile.nickname_changed_at).getTime() + NICKNAME_COOLDOWN_MS
        if (Date.now() < nextChangeAt) {
          const nextDate = new Date(nextChangeAt).toLocaleDateString("ko-KR")
          return NextResponse.json(
            { error: `닉네임은 ${nextDate} 이후에 변경할 수 있습니다.` },
            { status: 429 }
          )
        }
      }
    }

    // Case 4: 프로필 업데이트
    if (
      updateData.nickname &&
      existingProfile &&
      updateData.nickname !== existingProfile.nickname
    ) {
      updateData.nickname_changed_at = new Date().toISOString()
    }

    const { data: updatedProfile, error: updateError } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("user_id", userId)
      .select(PROFILE_SELECT)
      .single()

    if (updateError) {
      console.error("Failed to update profile:", { error: updateError, userId })
      return NextResponse.json(
        { error: "프로필 업데이트 중 오류가 발생했습니다." },
        { status: 500 }
      )
    }

    return NextResponse.json(updatedProfile)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("PATCH /api/profile/me error:", msg)
    return NextResponse.json({ error: "서버 오류", debug: msg }, { status: 500 })
  }
}

/**
 * DELETE /api/profile/me
 *
 * Delete current user's account (soft delete)
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
    }

    // Require explicit confirmation to prevent CSRF and accidental deletion
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = deleteProfileSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }
    if (parsed.data.confirm !== "계정삭제") {
      return NextResponse.json(
        { error: '계정 삭제를 확인하려면 "계정삭제"를 입력해주세요.' },
        { status: 400 }
      )
    }

    const userId = user.id

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    let supabase
    try {
      supabase = createServiceRoleClient()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류"
      console.error("Failed to create Supabase client:", errorMessage)
      return NextResponse.json({ error: "서버 설정 오류가 발생했습니다." }, { status: 500 })
    }

    // Soft delete - mark profile as deleted
    const { error } = await supabase
      .from("profiles")
      .update({
        deleted_at: new Date().toISOString(),
        nickname: "[삭제된 사용자]",
      })
      .eq("user_id", userId)

    if (error) {
      console.error("Failed to delete profile:", error)
      return NextResponse.json({ error: "계정 삭제 중 오류가 발생했습니다." }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
