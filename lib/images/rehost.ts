import { createServiceRoleClient } from "@/lib/supabase/server"
import { ssrfSafeFetch } from "@/lib/ssrf-guard"
import sharp from "sharp"

/**
 * 외부 이미지 재호스팅 코어 — /api/upload/image 와 뉴스 발행 파이프라인이 공유.
 * 외부 원본 핫링크는 CSP·핫링크 차단·원본 해상도(수 MB) 문제를 다 갖고 있어
 * 서버에서 WebP 1200px 로 줄여 우리 Storage 에 넣는 게 유일한 정답이다.
 */

/** 검증·다운로드 실패를 status 코드와 함께 전달하는 에러 */
export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

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

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024 // 10MB (변환 전 원본 기준)

/**
 * 매직 바이트 검증 → WebP 변환/리사이즈 → Supabase Storage 업로드 → 프록시 URL 반환.
 * 파일 업로드 모드와 URL 재호스팅 모드가 공유한다.
 */
export async function optimizeAndStore(
  fileBuffer: ArrayBuffer,
  isGif: boolean,
  type: string | null,
  userId: string
): Promise<string> {
  // 매직 바이트 검증 (MIME spoofing 방지)
  if (!validateImageMagicBytes(fileBuffer)) {
    throw new UploadError("유효하지 않은 이미지 파일입니다.", 400)
  }
  if (fileBuffer.byteLength > MAX_UPLOAD_SIZE) {
    throw new UploadError("파일 크기는 10MB를 초과할 수 없습니다.", 400)
  }

  // sharp로 WebP 변환 + 리사이즈
  const config = type === "avatar" ? IMAGE_CONFIG.avatar : IMAGE_CONFIG.post
  const sharpInput = isGif
    ? sharp(Buffer.from(fileBuffer), { animated: true, pages: -1 })
    : sharp(Buffer.from(fileBuffer))
  const optimizedBuffer = await sharpInput
    .resize(config.maxWidth, undefined, { withoutEnlargement: true, fit: "inside" })
    .webp({ quality: config.quality })
    .toBuffer()

  // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
  const supabase = createServiceRoleClient()

  // 파일명 생성 (항상 .webp)
  const timestamp = Date.now()
  const randomUUID = crypto.randomUUID().substring(0, 8)
  const baseName = `${timestamp}-${randomUUID}.webp`
  const fileName = type === "avatar" ? `avatars/${userId}/${baseName}` : `${userId}/${baseName}`

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("posts")
    .upload(fileName, optimizedBuffer, {
      contentType: "image/webp",
      upsert: false,
    })

  if (uploadError) {
    console.error("Supabase storage upload error:", uploadError)
    throw new UploadError("이미지 업로드에 실패했습니다.", 500)
  }

  // 프록시 URL 반환 (Supabase 도메인 노출 방지)
  return `/storage/posts/${uploadData.path}`
}

/**
 * 외부 이미지 URL을 SSRF 가드로 안전하게 가져와 ArrayBuffer + gif 여부를 반환.
 * 기사 OG 이미지·직접 붙여넣은 이미지 URL을 우리 Storage로 재호스팅할 때 사용.
 */
export async function fetchExternalImage(
  imageUrl: string
): Promise<{ buffer: ArrayBuffer; isGif: boolean }> {
  let parsed: URL
  try {
    parsed = new URL(imageUrl)
  } catch {
    throw new UploadError("유효하지 않은 이미지 URL입니다.", 400)
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new UploadError("유효하지 않은 이미지 URL입니다.", 400)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  let res: Response
  try {
    res = await ssrfSafeFetch(parsed, {
      signal: controller.signal,
      headers: {
        // OG 페치와 동일 UA — 이미지 CDN 도 안티봇으로 막을 수 있어 소셜 크롤러로 위장.
        "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        Accept: "image/*",
      },
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    throw new UploadError("이미지를 가져올 수 없습니다.", 400)
  }
  const contentType = res.headers.get("content-type") || ""
  if (!contentType.startsWith("image/")) {
    throw new UploadError("이미지 URL이 아닙니다.", 400)
  }
  const declaredSize = Number(res.headers.get("content-length") || 0)
  if (declaredSize > MAX_UPLOAD_SIZE) {
    throw new UploadError("이미지가 너무 큽니다.", 400)
  }
  const buffer = await res.arrayBuffer()
  if (buffer.byteLength > MAX_UPLOAD_SIZE) {
    throw new UploadError("이미지가 너무 큽니다.", 400)
  }
  return { buffer, isGif: contentType.includes("gif") }
}

/** 이미 우리 Storage에 있는 이미지인지 — 프록시 경로(/storage/) 또는 Supabase 도메인. */
export function isSelfHostedImageUrl(url: string): boolean {
  return url.startsWith("/storage/") || /:\/\/[^/]+\.supabase\.co\//.test(url)
}

/** 외부 이미지 URL 1개를 다운로드→최적화→Storage 업로드. 실패 시 UploadError throw. */
export async function rehostExternalImage(imageUrl: string, userId: string): Promise<string> {
  const { buffer, isGif } = await fetchExternalImage(imageUrl)
  return optimizeAndStore(buffer, isGif, null, userId)
}
