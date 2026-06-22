import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError } from "@/lib/api-error"
import { env } from "@/lib/env"

// 클라이언트는 60초로 제한하고, CF 는 backstop 으로 약간 여유(65초). 초과 영상은 CF 가 거부.
const MAX_DURATION_SECONDS = 65

/**
 * POST /api/upload/video
 * Cloudflare Stream "direct creator upload" URL 발급.
 * 클라이언트가 받은 uploadURL 로 영상 파일을 CF 에 직접 업로드 → 우리 서버 대역폭 미사용.
 * 업로드 완료 후 uid 로 임베드(iframe.videodelivery.net/{uid})를 글에 삽입.
 *
 * Returns: { uploadURL: string, uid: string }
 */
export async function POST() {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
    }

    const accountId = env.CLOUDFLARE_ACCOUNT_ID
    const apiToken = env.CLOUDFLARE_STREAM_API_TOKEN
    if (!accountId || !apiToken) {
      return NextResponse.json(
        { error: "영상 업로드가 아직 설정되지 않았습니다." },
        { status: 503 }
      )
    }

    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          maxDurationSeconds: MAX_DURATION_SECONDS,
          requireSignedURLs: false,
          creator: user.id,
        }),
      }
    )

    const data = await cfRes.json().catch(() => null)
    if (!cfRes.ok || !data?.success || !data?.result?.uploadURL || !data?.result?.uid) {
      console.error("Cloudflare Stream direct_upload error:", data?.errors ?? data ?? cfRes.status)
      return NextResponse.json({ error: "업로드 URL 발급에 실패했습니다." }, { status: 502 })
    }

    return NextResponse.json(
      { uploadURL: data.result.uploadURL as string, uid: data.result.uid as string },
      { status: 200 }
    )
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
