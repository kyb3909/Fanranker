import { NextRequest, NextResponse } from "next/server"
import { apiError } from "@/lib/api-error"

/**
 * GET /api/og?url=...
 *
 * URL에서 OG 이미지를 추출하여 반환
 * - og:image 메타태그 우선
 * - twitter:image 폴백
 */
export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get("url")
    if (!url) {
      return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 })
    }

    // URL 유효성 검증
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return NextResponse.json({ error: "유효하지 않은 URL입니다." }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: "유효하지 않은 URL입니다." }, { status: 400 })
    }

    // SSRF 방지: private/reserved IP 및 localhost 차단
    const hostname = parsedUrl.hostname.toLowerCase()
    const BLOCKED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "metadata.google.internal"]
    if (
      BLOCKED_HOSTS.includes(hostname) ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(hostname)
    ) {
      return NextResponse.json({ error: "허용되지 않은 URL입니다." }, { status: 400 })
    }

    // HTML 페치 (타임아웃 5초)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GongnoriBot/1.0; +https://gongnori.fan)",
        Accept: "text/html",
      },
      redirect: "follow",
    })
    clearTimeout(timeout)

    if (!response.ok) {
      return NextResponse.json({ error: "페이지를 가져올 수 없습니다." }, { status: 400 })
    }

    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("text/html")) {
      return NextResponse.json({ error: "HTML 페이지가 아닙니다." }, { status: 400 })
    }

    // 처음 50KB만 읽기 (메타태그는 보통 상단에 있음)
    const reader = response.body?.getReader()
    if (!reader) {
      return NextResponse.json({ error: "응답을 읽을 수 없습니다." }, { status: 500 })
    }

    let html = ""
    const decoder = new TextDecoder()
    const maxBytes = 50 * 1024

    while (html.length < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      // </head> 이후는 불필요
      if (html.includes("</head>")) break
    }
    reader.cancel()

    // 메타태그 파싱
    const ogImage = extractMeta(html, "og:image")
    const twitterImage = extractMeta(html, "twitter:image")
    const ogTitle = extractMeta(html, "og:title")
    const ogDescription = extractMeta(html, "og:description")
    const ogSiteName = extractMeta(html, "og:site_name")

    // <title> 태그 폴백
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    const pageTitle = ogTitle || titleMatch?.[1]?.trim() || ""

    const imageUrl = ogImage || twitterImage || null

    // 상대 경로 → 절대 경로 변환
    let absoluteImageUrl = imageUrl
    if (imageUrl && !imageUrl.startsWith("http")) {
      try {
        absoluteImageUrl = new URL(imageUrl, parsedUrl.origin).toString()
      } catch {
        absoluteImageUrl = null
      }
    }

    return NextResponse.json(
      {
        image: absoluteImageUrl,
        title: pageTitle,
        description: ogDescription || "",
        siteName: ogSiteName || parsedUrl.hostname,
        url: parsedUrl.toString(),
      },
      {
        headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
      }
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json({ error: "요청 시간이 초과되었습니다." }, { status: 408 })
    }
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

function extractMeta(html: string, property: string): string | null {
  // property="og:image" content="..."
  const propRegex = new RegExp(
    `<meta[^>]*property=["']${escapeRegex(property)}["'][^>]*content=["']([^"']*)["']`,
    "i"
  )
  const propMatch = html.match(propRegex)
  if (propMatch) return propMatch[1]

  // content="..." property="og:image" (순서 뒤집힌 경우)
  const reverseRegex = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${escapeRegex(property)}["']`,
    "i"
  )
  const reverseMatch = html.match(reverseRegex)
  if (reverseMatch) return reverseMatch[1]

  // name="twitter:image" content="..."
  const nameRegex = new RegExp(
    `<meta[^>]*name=["']${escapeRegex(property)}["'][^>]*content=["']([^"']*)["']`,
    "i"
  )
  const nameMatch = html.match(nameRegex)
  if (nameMatch) return nameMatch[1]

  return null
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
