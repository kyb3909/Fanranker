import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiBadRequest, apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"

/**
 * 아이돌 갤러리 등록/삭제 — admin 전권 (기본값 규칙: requireAdminApi).
 *
 * POST { urls: string[], tag? } — X 트윗 URL 을 /api/oembed 로 풀어 사진 메타만 저장.
 *   이미지 다운로드·재호스팅 없음 — X CDN 참조만. 사진 없는 트윗은 등록 거부.
 * DELETE { id } — 항목 제거.
 */

const X_STATUS_RE = /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/\w+\/status(?:es)?\/\d+/i

const PostSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(20),
  tag: z.string().trim().max(40).optional(),
})

const DeleteSchema = z.object({ id: z.string().uuid() })

interface OembedMedia {
  type?: string
  url?: string
  thumbnail_url?: string
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (isErrorResponse(auth)) return auth
  const { userId, supabase } = auth

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return apiBadRequest("잘못된 요청 본문입니다.")
  }
  const parsed = PostSchema.safeParse(raw)
  if (!parsed.success) {
    return apiBadRequest(parsed.error.issues[0]?.message ?? "잘못된 입력입니다.")
  }
  const { urls, tag } = parsed.data

  const origin = request.nextUrl.origin
  const results: { url: string; ok: boolean; reason?: string }[] = []

  for (const url of urls) {
    if (!X_STATUS_RE.test(url)) {
      results.push({ url, ok: false, reason: "X 트윗 URL 이 아닙니다" })
      continue
    }
    try {
      // 자기 자신의 oembed 프록시 재사용 — X 미디어 구조화 + embed_cache 캐시 동참
      const res = await fetch(`${origin}/api/oembed?url=${encodeURIComponent(url)}`, {
        headers: { "User-Agent": "gongnori-gallery/1.0" },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) {
        results.push({ url, ok: false, reason: `oembed ${res.status}` })
        continue
      }
      const d = (await res.json()) as { author_name?: string; media?: OembedMedia[] }
      const photos = (d.media ?? []).filter((m) => m.type === "photo" && m.url)
      if (photos.length === 0) {
        results.push({ url, ok: false, reason: "사진이 없는 트윗입니다" })
        continue
      }
      // author_name 은 "표시명 (@핸들)" 형식 — 출처 표기용으로 분리 저장
      const nameRaw = d.author_name ?? ""
      const handleMatch = nameRaw.match(/\(@([A-Za-z0-9_]+)\)\s*$/)
      const { error } = await supabase.from("gallery_items").upsert(
        {
          tweet_url: url,
          author_name: handleMatch ? nameRaw.replace(/\s*\(@[A-Za-z0-9_]+\)\s*$/, "") : nameRaw,
          author_handle: handleMatch ? `@${handleMatch[1]}` : null,
          media: photos.map((m) => ({
            type: "photo",
            url: m.url,
            thumbnail_url: m.thumbnail_url ?? null,
          })),
          ...(tag ? { tag } : {}),
          created_by: userId,
        },
        { onConflict: "tweet_url" }
      )
      if (error) {
        results.push({ url, ok: false, reason: error.message })
      } else {
        results.push({ url, ok: true })
      }
    } catch (e) {
      results.push({ url, ok: false, reason: e instanceof Error ? e.message : "fetch 실패" })
    }
  }

  const registered = results.filter((r) => r.ok).length
  return NextResponse.json({ registered, results })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminApi()
  if (isErrorResponse(auth)) return auth
  const { supabase } = auth

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return apiBadRequest("잘못된 요청 본문입니다.")
  }
  const parsed = DeleteSchema.safeParse(raw)
  if (!parsed.success) return apiBadRequest("id(uuid)가 필요합니다.")

  const { error } = await supabase.from("gallery_items").delete().eq("id", parsed.data.id)
  if (error) return apiError("삭제에 실패했습니다.", 500, error)
  return NextResponse.json({ ok: true })
}
