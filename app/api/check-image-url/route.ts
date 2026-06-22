import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, apiBadRequest } from "@/lib/api-error"

/**
 * 붙여넣은 임의 URL이 "이미지"인지 Content-Type 으로 확인.
 * 확장자 없는 이미지 링크(CDN 동적 URL 등)도 잡기 위함. (embed-paste 에서 호출)
 *
 * SSRF 완화: 사설/내부 호스트 차단(blocklist) + 타임아웃. 본문은 반환하지 않고
 * Content-Type 만 확인하므로 노출 범위가 작다. (DNS 재바인딩까지는 막지 못함)
 */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "") // ipv6 대괄호 제거
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "::1"
  )
    return true
  // IPv6 loopback/ULA/link-local (대략)
  if (h.includes(":") && /^f[cde]/.test(h)) return true
  // IPv4 literal — 사설/예약 대역
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true // link-local / cloud metadata
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  }
  return false
}

// 일부 이미지 호스트는 UA 없는 데이터센터 요청을 차단 → 브라우저 UA 로 위장
const FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
}

async function contentTypeOf(
  url: string
): Promise<{ ct: string; finalUrl: string; status: number } | null> {
  // HEAD 우선, 미지원이면 1바이트 Range GET 으로 재시도
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const res = await fetch(url, {
        method,
        redirect: "follow",
        headers: method === "GET" ? { ...FETCH_HEADERS, Range: "bytes=0-0" } : FETCH_HEADERS,
        signal: AbortSignal.timeout(4500),
      })
      const finalUrl = res.url || url
      try {
        if (isBlockedHost(new URL(finalUrl).hostname)) return null // 리다이렉트로 내부망 이동
      } catch {
        return null
      }
      const ct = (res.headers.get("content-type") || "").toLowerCase()
      if (ct) return { ct, finalUrl, status: res.status }
    } catch {
      // 다음 method 로 재시도
    }
  }
  return null
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
  if (isBlockedHost(parsed.hostname)) {
    return NextResponse.json({ isImage: false })
  }

  const result = await contentTypeOf(parsed.toString())
  if (result) {
    if (result.ct.startsWith("image/")) {
      return NextResponse.json({ isImage: true, url: result.finalUrl, contentType: result.ct })
    }
    if (result.ct.startsWith("video/")) {
      return NextResponse.json({ isVideo: true, url: result.finalUrl, contentType: result.ct })
    }
  }
  return NextResponse.json({ isImage: false })
}
