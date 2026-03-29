import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"

/**
 * GET /api/stickers
 * 스티커 목록 조회
 * ?status=approved|pending  (default: approved)
 * ?board_slug=football
 * ?pack_id=uuid
 * ?creator_id=clerk_id
 * ?q=검색어
 * ?sort=popular|newest  (default: popular)
 * ?limit=50
 * ?offset=0
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const status = searchParams.get("status") || "approved"
    const boardSlug = searchParams.get("board_slug")
    const packId = searchParams.get("pack_id")
    const creatorId = searchParams.get("creator_id")
    const q = searchParams.get("q")
    const sort = searchParams.get("sort") || "popular"
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
    const offset = parseInt(searchParams.get("offset") || "0")

    const supabase = createServiceRoleClient()

    let query = supabase
      .from("stickers")
      .select("*")
      .eq("status", status)
      .range(offset, offset + limit - 1)

    if (boardSlug) {
      const safeBoardSlug = boardSlug.replace(/[^a-zA-Z0-9_-]/g, "")
      query = query.or(`board_slug.eq.${safeBoardSlug},board_slug.is.null`)
    }
    if (packId) query = query.eq("pack_id", packId)
    if (creatorId) query = query.eq("creator_id", creatorId)
    if (q) {
      const safeQ = q.replace(/[%_\\]/g, "\\$&").slice(0, 100)
      query = query.ilike("name", `%${safeQ}%`)
    }

    if (sort === "popular") {
      query = query.order("purchase_count", { ascending: false })
    } else {
      query = query.order("created_at", { ascending: false })
    }

    const { data: stickers, error } = await query
    if (error) return apiError("스티커 조회 실패", 500, error)

    // 로그인된 유저의 소유 스티커 확인
    const user = await currentUser().catch(() => null)
    let ownedIds: string[] = []
    if (user && stickers && stickers.length > 0) {
      const { data: owned } = await supabase
        .from("user_stickers")
        .select("sticker_id")
        .eq("user_id", user.id)
        .in(
          "sticker_id",
          stickers.map((s: { id: string }) => s.id)
        )
      ownedIds = (owned || []).map((o: { sticker_id: string }) => o.sticker_id)
    }

    return NextResponse.json({ stickers, ownedIds })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

/**
 * POST /api/stickers
 * 스티커 업로드 (pending 상태로 등록)
 * Body: FormData { file, name, board_slug?, tags? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const rateLimitResult = checkRateLimit(request, "STANDARD", user.id)
    if (rateLimitResult) return rateLimitResult

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const name = (formData.get("name") as string)?.trim()
    const boardSlug = formData.get("board_slug") as string | null
    const tagsRaw = formData.get("tags") as string | null

    if (!file) return apiBadRequest("파일이 필요합니다")
    if (!name || name.length < 1 || name.length > 50) return apiBadRequest("이름은 1~50자")
    if (!file.type.startsWith("image/")) return apiBadRequest("이미지 파일만 가능합니다")
    const isGif = file.type === "image/gif"
    const maxSize = isGif ? 10 * 1024 * 1024 : 5 * 1024 * 1024
    if (file.size > maxSize)
      return apiBadRequest(isGif ? "GIF 파일은 10MB 이하" : "파일 크기는 5MB 이하")

    // 이미지 → animated WebP 변환 (스티커 크기: 최대 512px)
    const sharp = (await import("sharp")).default
    const fileBuffer = await file.arrayBuffer()
    let optimizedBuffer: Buffer
    let contentType: string
    let ext: string

    if (isGif) {
      // GIF → animated WebP (512px, 고품질)
      optimizedBuffer = await sharp(Buffer.from(fileBuffer), { animated: true, pages: -1 })
        .resize(512, 512, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85, effort: 4 })
        .toBuffer()
      contentType = "image/webp"
      ext = "webp"
    } else {
      optimizedBuffer = await sharp(Buffer.from(fileBuffer))
        .resize(512, 512, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer()
      contentType = "image/webp"
      ext = "webp"
    }

    const supabase = createServiceRoleClient()

    // Storage 업로드
    const timestamp = Date.now()
    const randomId = crypto.randomUUID().substring(0, 8)
    const fileName = `stickers/${user.id}/${timestamp}-${randomId}.${ext}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("posts")
      .upload(fileName, optimizedBuffer, { contentType, upsert: false })

    if (uploadError) return apiError("업로드 실패", 500, uploadError)

    const { data: publicUrlData } = supabase.storage.from("posts").getPublicUrl(uploadData.path)

    // DB 등록
    const tags = tagsRaw
      ? tagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : []

    const { data: sticker, error: insertError } = await supabase
      .from("stickers")
      .insert({
        creator_id: user.id,
        name,
        image_url: publicUrlData.publicUrl,
        media_type: isGif ? "animated" : "image",
        board_slug: boardSlug || null,
        tags: tags.length > 0 ? tags : null,
      })
      .select()
      .single()

    if (insertError) return apiError("스티커 등록 실패", 500, insertError)

    // 크리에이터 자동 소유
    await supabase.from("user_stickers").insert({ user_id: user.id, sticker_id: sticker.id })

    return NextResponse.json({ sticker }, { status: 201 })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
