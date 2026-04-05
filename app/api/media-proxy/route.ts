import { NextRequest, NextResponse } from "next/server"
import { apiBadRequest, checkRateLimit } from "@/lib/api-error"

export const runtime = "nodejs"

function isAllowedMediaHost(url: URL) {
  const host = url.hostname.toLowerCase()
  return (
    url.protocol === "https:" &&
    (host === "video.twimg.com" ||
      host.endsWith(".cdninstagram.com") ||
      host.endsWith(".fbcdn.net"))
  )
}

async function proxyMedia(request: NextRequest, method: "GET" | "HEAD") {
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

  if (!isAllowedMediaHost(parsed)) {
    return apiBadRequest("지원하지 않는 미디어 출처입니다.")
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      method,
      headers: {
        ...(request.headers.get("range") ? { Range: request.headers.get("range")! } : {}),
        "User-Agent": "Mozilla/5.0 (compatible; CommunityMediaProxy/1.0)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })

    // 50MB 초과 응답 차단
    const contentLength = upstream.headers.get("content-length")
    if (contentLength && parseInt(contentLength, 10) > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "파일이 너무 큽니다." }, { status: 413 })
    }

    const headers = new Headers()
    const passHeaders = [
      "content-type",
      "content-length",
      "accept-ranges",
      "content-range",
      "cache-control",
      "etag",
      "last-modified",
    ]

    for (const key of passHeaders) {
      const value = upstream.headers.get(key)
      if (value) headers.set(key, value)
    }

    headers.set("Content-Disposition", "inline")

    return new NextResponse(method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers,
    })
  } catch {
    return NextResponse.json({ error: "미디어를 불러오지 못했습니다." }, { status: 502 })
  }
}

export async function GET(request: NextRequest) {
  return proxyMedia(request, "GET")
}

export async function HEAD(request: NextRequest) {
  return proxyMedia(request, "HEAD")
}
