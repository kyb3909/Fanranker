import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError } from "@/lib/api-error"
import { SsrfBlockedError } from "@/lib/ssrf-guard"
import {
  UploadError,
  MAX_UPLOAD_SIZE,
  optimizeAndStore,
  fetchExternalImage,
} from "@/lib/images/rehost"

/**
 * POST /api/upload/image
 * 이미지를 WebP로 변환 후 Supabase Storage에 업로드
 * (변환·검증·업로드 코어는 lib/images/rehost — 뉴스 발행 파이프라인과 공유)
 *
 * - multipart/form-data ('file'): 사용자가 올린 파일 업로드 (기존)
 * - application/json ({ imageUrl }): 외부 이미지 URL을 서버에서 가져와 재호스팅
 * Query: ?type=avatar (아바타) | 없으면 게시글 이미지
 *
 * Returns: { url: string } — /storage/posts/... 프록시 경로
 */
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
    }
    const userId = user.id
    const type = request.nextUrl.searchParams.get("type") // 'avatar' | null (게시글 이미지)
    const reqContentType = request.headers.get("content-type") || ""

    let fileBuffer: ArrayBuffer
    let isGif: boolean

    if (reqContentType.includes("application/json")) {
      // URL 재호스팅 모드 — 외부 이미지(OG·직접 URL)를 우리 Storage로 가져온다.
      let body: { imageUrl?: unknown }
      try {
        body = await request.json()
      } catch {
        return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 })
      }
      if (typeof body.imageUrl !== "string" || !body.imageUrl) {
        return NextResponse.json({ error: "imageUrl이 필요합니다." }, { status: 400 })
      }
      const fetched = await fetchExternalImage(body.imageUrl)
      fileBuffer = fetched.buffer
      isGif = fetched.isGif
    } else {
      // 파일 업로드 모드 (multipart/form-data)
      const formData = await request.formData()
      const file = formData.get("file") as File | null

      if (!file) {
        return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 })
      }
      // 파일 타입 검증 (client-declared MIME)
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "이미지 파일만 업로드할 수 있습니다." }, { status: 400 })
      }
      // 파일 크기 제한 (10MB - 변환 전 원본 기준)
      if (file.size > MAX_UPLOAD_SIZE) {
        return NextResponse.json(
          { error: "파일 크기는 10MB를 초과할 수 없습니다." },
          { status: 400 }
        )
      }
      fileBuffer = await file.arrayBuffer()
      isGif = file.type === "image/gif"
    }

    const url = await optimizeAndStore(fileBuffer, isGif, type, userId)
    return NextResponse.json({ url }, { status: 200 })
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof SsrfBlockedError) {
      return NextResponse.json({ error: "허용되지 않은 이미지 URL입니다." }, { status: 400 })
    }
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
