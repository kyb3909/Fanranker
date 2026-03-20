import { NextRequest, NextResponse } from "next/server"
import {
  isAllowedResolvedImageHost,
  isProbablyDirectImageUrl,
  needsOembedImageResolve,
} from "@/lib/image-paste-url"
import { checkRateLimit, apiBadRequest } from "@/lib/api-error"

function extractImgSrcFromHtml(html: string): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return m?.[1] ?? null
}

function extractOgImageFromHtml(html: string): string | null {
  const m =
    html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  const u = m?.[1]?.trim()
  return u && /^https:\/\//.test(u) ? u : null
}

async function resolveImgurViaPageFetch(pageUrl: string): Promise<string | null> {
  const res = await fetch(pageUrl, {
    headers: {
      Accept: "text/html",
      "User-Agent": "Mozilla/5.0 (compatible; CommunityEmbed/1.0)",
    },
    redirect: "follow",
    next: { revalidate: 3600 },
  })
  if (!res.ok) return null
  const html = await res.text()
  const og = extractOgImageFromHtml(html)
  if (og && isAllowedResolvedImageHost(og)) return og
  const fromImg = extractImgSrcFromHtml(html)
  if (fromImg && isAllowedResolvedImageHost(fromImg)) return fromImg
  return null
}

function pickImageUrlFromOembed(data: Record<string, unknown>): string | null {
  const th = data.thumbnail_url
  if (typeof th === "string" && /^https:\/\//.test(th)) return th
  const u = data.url
  if (typeof u === "string" && /^https:\/\//.test(u)) {
    if (/\.(gif|jpe?g|webp|png)(\?|$)/i.test(u)) return u
  }
  const html = data.html
  if (typeof html === "string") {
    const fromHtml = extractImgSrcFromHtml(html)
    if (fromHtml && /^https:\/\//.test(fromHtml)) return fromHtml
  }
  return null
}

/** 입력 URL이 우리가 fetch할 수 있는 호스트인지 (SSRF 완화) */
function inputHostAllowed(url: URL): boolean {
  const h = url.hostname.toLowerCase()
  if (h === "imgur.com" || h.endsWith(".imgur.com")) return true
  if (h === "giphy.com" || h.endsWith(".giphy.com")) return true
  return false
}

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, "STANDARD")
  if (limited) return limited

  const raw = request.nextUrl.searchParams.get("url")?.trim()
  if (!raw) return apiBadRequest("url이 필요합니다.")

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return apiBadRequest("잘못된 URL입니다.")
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return apiBadRequest("허용되지 않은 URL입니다.")
  }

  if (!inputHostAllowed(parsed)) {
    return apiBadRequest("지원하지 않는 이미지 출처입니다.")
  }

  const canonical = parsed.toString()

  if (parsed.hostname.toLowerCase() === "i.imgur.com" && isProbablyDirectImageUrl(canonical)) {
    return NextResponse.json({ url: canonical })
  }

  if (!needsOembedImageResolve(canonical)) {
    return apiBadRequest("이 URL은 여기서 변환할 수 없습니다.")
  }

  try {
    const isImgur = parsed.hostname.toLowerCase().includes("imgur.com")
    const isGiphy = parsed.hostname.toLowerCase().includes("giphy.com")

    if (isImgur && parsed.hostname.toLowerCase() !== "i.imgur.com") {
      const oembedRes = await fetch(
        `https://api.imgur.com/oembed.json?url=${encodeURIComponent(canonical)}`,
        { headers: { Accept: "application/json" }, next: { revalidate: 3600 } }
      )
      if (oembedRes.ok) {
        const data = (await oembedRes.json()) as Record<string, unknown>
        const resolved = pickImageUrlFromOembed(data)
        if (resolved && isAllowedResolvedImageHost(resolved)) {
          return NextResponse.json({ url: resolved })
        }
      }
      const fromPage = await resolveImgurViaPageFetch(canonical)
      if (fromPage) return NextResponse.json({ url: fromPage })
      return NextResponse.json(
        { error: "Imgur 이미지 주소를 확인할 수 없습니다." },
        { status: 422 }
      )
    }

    if (isGiphy) {
      const res = await fetch(
        `https://giphy.com/services/oembed?url=${encodeURIComponent(canonical)}`,
        { headers: { Accept: "application/json" }, next: { revalidate: 3600 } }
      )
      if (!res.ok) {
        return NextResponse.json(
          { error: "Giphy 미리보기를 가져오지 못했습니다." },
          { status: 422 }
        )
      }
      const data = (await res.json()) as Record<string, unknown>
      const resolved = pickImageUrlFromOembed(data)
      if (!resolved || !isAllowedResolvedImageHost(resolved)) {
        return NextResponse.json(
          { error: "Giphy 이미지 주소를 확인할 수 없습니다." },
          { status: 422 }
        )
      }
      return NextResponse.json({ url: resolved })
    }

    return NextResponse.json({ error: "지원하지 않는 URL입니다." }, { status: 422 })
  } catch {
    return NextResponse.json({ error: "이미지 URL 변환 중 오류가 발생했습니다." }, { status: 500 })
  }
}
