import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiBadRequest, apiError } from "@/lib/api-error"
import { chatParams } from "@/lib/llm/openai-params"

export const dynamic = "force-dynamic"

/**
 * 아이돌 갤러리 등록/삭제 — admin 전권 (기본값 규칙: requireAdminApi).
 *
 * POST { urls: string[], tag? } — X 트윗 URL 을 /api/oembed 로 풀어 사진 메타만 저장.
 *   이미지 다운로드·재호스팅 없음 — X CDN 참조만. 사진 없는 트윗은 등록 거부.
 *   등록 전 LLM 비전이 "인물 사진인가"를 사진별로 판정 — 아래 judgeIdolPhotos.
 * DELETE { id } — 항목 제거.
 */

const X_STATUS_RE = /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/\w+\/status(?:es)?\/\d+/i

/**
 * 사진이 인물(아이돌) 사진인지 LLM 비전 판정 (운영자 요청 2026-08-14).
 *
 * 홈마 계정에는 공지·굿즈·풍경·음식도 올라온다 — 트윗 링크만 믿고 실으면 갤러리에
 * 엉뚱한 사진이 섞인다. 등록 시점에 사진별로 한 번만 판정한다 (표시 시점 아님 — 비용 0 유지).
 * 실패는 통과(fail-open): 판정은 보조 장치고 최종 큐레이션 책임은 등록하는 운영자에게 있다.
 * 반환: urls 와 같은 길이의 boolean 배열 (true = 인물 사진).
 */
async function judgeIdolPhotos(urls: string[]): Promise<boolean[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || urls.length === 0) return urls.map(() => true)
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        // chatParams 필수 — 모델 세대별 파라미터 차이를 흡수 (lib/llm/openai-params)
        ...chatParams("gpt-4o-mini", { temperature: 0, max_tokens: 300 }),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'K-pop 팬 갤러리의 사진 검수원이다. 각 이미지가 "실존 인물이 주 피사체인 사진"인지 이미지 순서대로 판정하라. ' +
              "인물 직찍·무대·공항·행사 사진 = true. 풍경·사물·굿즈·음식·동물·텍스트 공지·스케줄표·일러스트/팬아트·인물이 식별되지 않는 사진 = false. " +
              'JSON 으로만 답하라: {"verdicts":[true,false,...]} — 반드시 이미지 개수와 같은 길이.',
          },
          {
            role: "user",
            content: urls.map((u) => ({
              type: "image_url",
              // detail low — 인물/비인물 판별에는 저해상도로 충분, 비용 최소화
              image_url: { url: u, detail: "low" },
            })),
          },
        ],
      }),
    })
    if (!res.ok) return urls.map(() => true)
    const d = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const parsed = JSON.parse(d.choices?.[0]?.message?.content ?? "{}") as {
      verdicts?: unknown[]
    }
    if (!Array.isArray(parsed.verdicts) || parsed.verdicts.length !== urls.length) {
      return urls.map(() => true)
    }
    return parsed.verdicts.map(Boolean)
  } catch {
    return urls.map(() => true)
  }
}

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
      const allPhotos = (d.media ?? []).filter((m) => m.type === "photo" && m.url)
      if (allPhotos.length === 0) {
        results.push({ url, ok: false, reason: "사진이 없는 트윗입니다" })
        continue
      }
      // 인물 사진 판정 — 풍경·공지·굿즈 컷은 여기서 걸러진다
      const verdicts = await judgeIdolPhotos(allPhotos.map((m) => m.thumbnail_url || m.url!))
      const photos = allPhotos.filter((_, i) => verdicts[i])
      if (photos.length === 0) {
        results.push({
          url,
          ok: false,
          reason: "인물 사진이 아닌 것으로 판정됨 (풍경/공지/굿즈 등)",
        })
        continue
      }
      const droppedCount = allPhotos.length - photos.length
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
        results.push({
          url,
          ok: true,
          ...(droppedCount > 0
            ? { reason: `사진 ${allPhotos.length}장 중 ${droppedCount}장 제외 (인물 아님 판정)` }
            : {}),
        })
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
