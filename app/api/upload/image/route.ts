import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError } from "@/lib/api-error"
import sharp from "sharp"

/** Validate file content via magic bytes to prevent MIME spoofing */
function validateImageMagicBytes(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 4) return false

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true
  // GIF: 47 49 46 38 (GIF8)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true
  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return true
  // AVIF/HEIF: ....ftyp
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  )
    return true
  // BMP: 42 4D
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return true

  return false
}

// 이미지 최적화 설정
const IMAGE_CONFIG = {
  post: { maxWidth: 1200, quality: 80 },
  avatar: { maxWidth: 256, quality: 85 },
} as const

/**
 * POST /api/upload/image
 * 이미지를 WebP로 변환 후 Supabase Storage에 업로드
 *
 * Body: FormData with 'file' field
 * Query: ?type=avatar (아바타) | 없으면 게시글 이미지
 *
 * Returns: { url: string }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
    }

    const userId = user.id

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const type = request.nextUrl.searchParams.get("type") // 'avatar' | null (게시글 이미지)

    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 })
    }

    // 파일 타입 검증 (client-declared MIME)
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "이미지 파일만 업로드할 수 있습니다." }, { status: 400 })
    }

    // 매직 바이트 검증 (MIME spoofing 방지)
    const fileBuffer = await file.arrayBuffer()
    if (!validateImageMagicBytes(fileBuffer)) {
      return NextResponse.json({ error: "유효하지 않은 이미지 파일입니다." }, { status: 400 })
    }

    // 파일 크기 제한 (10MB - 변환 전 원본 기준)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: "파일 크기는 10MB를 초과할 수 없습니다." }, { status: 400 })
    }

    // sharp로 WebP 변환 + 리사이즈
    const config = type === "avatar" ? IMAGE_CONFIG.avatar : IMAGE_CONFIG.post
    const optimizedBuffer = await sharp(Buffer.from(fileBuffer))
      .resize(config.maxWidth, undefined, { withoutEnlargement: true, fit: "inside" })
      .webp({ quality: config.quality })
      .toBuffer()

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const supabase = createServiceRoleClient()

    // 파일명 생성 (항상 .webp)
    const timestamp = Date.now()
    const randomUUID = crypto.randomUUID().substring(0, 8)
    const baseName = `${timestamp}-${randomUUID}.webp`
    const fileName = type === "avatar" ? `avatars/${userId}/${baseName}` : `${userId}/${baseName}`

    // Supabase Storage에 업로드
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("posts")
      .upload(fileName, optimizedBuffer, {
        contentType: "image/webp",
        upsert: false,
      })

    if (uploadError) {
      console.error("Supabase storage upload error:", uploadError)
      return NextResponse.json(
        { error: "이미지 업로드에 실패했습니다.", detail: uploadError.message },
        { status: 500 }
      )
    }

    // Public URL 가져오기
    const { data: publicUrlData } = supabase.storage.from("posts").getPublicUrl(uploadData.path)

    return NextResponse.json({ url: publicUrlData.publicUrl }, { status: 200 })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
