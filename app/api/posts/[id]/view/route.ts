import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { auth } from "@clerk/nextjs/server"
import { createAnonClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"

/**
 * POST /api/posts/[id]/view
 * 조회수 증가 (IP 기반 제한: 1시간에 한 번만)
 *
 * 로그인 유저면 user_id 도 같이 남긴다 — 콘텐츠 소비를 유저 단위로 보기 위함
 * (유입 코호트가 기사까지 읽는지 / 읽은 사람이 재방문하는지). 비로그인은 NULL.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = createAnonClient()

    // 조회 기록은 로그인 여부와 무관하게 남겨야 하므로, 인증 실패는 삼키고 익명으로 진행
    let userId: string | null = null
    try {
      userId = (await auth()).userId
    } catch {
      /* 비로그인·세션 오류 → 익명 조회로 계속 */
    }

    // IP 주소를 SHA-256 해시하여 개인정보 보호 (PIPA 준수)
    const forwarded = request.headers.get("x-forwarded-for")
    const realIp = request.headers.get("x-real-ip")
    const rawIp = forwarded?.split(",")[0]?.trim() || realIp || "unknown"
    const ipHash = createHash("sha256").update(rawIp).digest("hex")

    // RPC 함수를 사용하여 IP 해시 기반 제한과 함께 조회수 증가
    const { data, error } = await supabase.rpc("increment_post_view_count", {
      post_id_param: id,
      ip_address_param: ipHash,
      user_id_param: userId,
    })

    if (error) {
      console.error("Failed to increment view count:", error)
      // 에러가 발생해도 조회수 증가 실패만 로그하고 계속 진행
      return NextResponse.json({ success: false, message: "조회수 증가 실패" })
    }

    // data가 false면 이미 최근 1시간 내에 조회한 IP
    if (data === false) {
      return NextResponse.json({
        success: false,
        message: "이미 최근 1시간 내에 조회했습니다.",
        incremented: false,
      })
    }

    return NextResponse.json({
      success: true,
      message: "조회수가 증가했습니다.",
      incremented: true,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
