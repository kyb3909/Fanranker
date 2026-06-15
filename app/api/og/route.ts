import { lookup } from "node:dns/promises"
import { NextRequest, NextResponse } from "next/server"
import { apiError } from "@/lib/api-error"

export const runtime = "nodejs"

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

    // URL 유효성 검증 (scheme)
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return NextResponse.json({ error: "유효하지 않은 URL입니다." }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: "유효하지 않은 URL입니다." }, { status: 400 })
    }

    // HTML 페치 (타임아웃 5초)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    // SSRF 방지: 리다이렉트를 직접(redirect:"manual") 따라가며 매 홉마다 호스트를 실제 IP로
    //   resolve 해 사설/예약 대역이면 차단. 문자열 차단만으로는 DNS 리바인딩·리다이렉트로
    //   내부망(169.254.169.254 등)에 닿는 우회가 가능하다.
    let response: Response | null = null
    try {
      let target = parsedUrl
      for (let hops = 0; ; hops++) {
        if (hops > 4) {
          clearTimeout(timeout)
          return NextResponse.json({ error: "리다이렉트가 너무 많습니다." }, { status: 400 })
        }
        await assertPublicUrl(target)
        const res = await fetch(target.toString(), {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; GongnoriBot/1.0; +https://gongnori.fan)",
            Accept: "text/html",
          },
          redirect: "manual",
        })
        const loc = res.headers.get("location")
        if (res.status >= 300 && res.status < 400 && loc) {
          let next: URL
          try {
            next = new URL(loc, target)
          } catch {
            clearTimeout(timeout)
            return NextResponse.json({ error: "유효하지 않은 URL입니다." }, { status: 400 })
          }
          if (!["http:", "https:"].includes(next.protocol)) {
            clearTimeout(timeout)
            return NextResponse.json({ error: "허용되지 않은 URL입니다." }, { status: 400 })
          }
          target = next
          continue
        }
        response = res
        break
      }
    } catch (e) {
      clearTimeout(timeout)
      if (e instanceof SsrfBlockedError) {
        return NextResponse.json({ error: "허용되지 않은 URL입니다." }, { status: 400 })
      }
      throw e
    }
    clearTimeout(timeout)
    if (!response) {
      return NextResponse.json({ error: "응답을 가져올 수 없습니다." }, { status: 502 })
    }

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

class SsrfBlockedError extends Error {}

/** 호스트를 실제 IP로 resolve 해 사설/예약/링크로컬 대역이면 차단 (DNS 리바인딩 방지). */
async function assertPublicUrl(u: URL): Promise<void> {
  const hostname = u.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "metadata.google.internal" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new SsrfBlockedError()
  }
  let addrs: { address: string }[]
  try {
    addrs = await lookup(hostname, { all: true })
  } catch {
    throw new SsrfBlockedError() // resolve 실패 → 차단
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new SsrfBlockedError()
  }
}

function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const a = Number(v4[1])
    const b = Number(v4[2])
    if (a === 0 || a === 10 || a === 127) return true // 현재망 / 사설 / 루프백
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    if (a === 169 && b === 254) return true // 링크로컬 + 클라우드 메타데이터
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64.0.0/10
    return false
  }
  const v6 = ip.toLowerCase()
  if (v6 === "::1" || v6 === "::") return true // 루프백 / 미지정
  if (/^fe[89ab]/.test(v6)) return true // fe80::/10 링크로컬
  if (/^f[cd]/.test(v6)) return true // fc00::/7 ULA
  const mapped = v6.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) return isPrivateIp(mapped[1]) // IPv4-mapped
  return false
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
