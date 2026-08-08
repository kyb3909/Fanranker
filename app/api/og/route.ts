import { NextRequest, NextResponse } from "next/server"
import { apiError } from "@/lib/api-error"
import { assertPublicUrl, SsrfBlockedError } from "@/lib/ssrf-guard"
import { decodeHtmlEntities } from "@/lib/decode-html-entities"
import { chatParams } from "@/lib/llm/openai-params"

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
    const wantSummary = request.nextUrl.searchParams.get("summarize") === "1"

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
            // 언론사 안티봇(DataDome 등)은 소셜 링크-프리뷰 크롤러를 화이트리스트한다.
            // 커스텀/브라우저 UA 는 403 으로 막히지만(as.com 등) facebookexternalhit 는
            // 통과 → 깨끗한 OG 수신. 사이트가 미리보기를 원하므로 의도에도 부합.
            "User-Agent":
              "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
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
    // 요약이 필요하면 본문까지 더 읽는다 (메타는 head 에 있지만 본문은 head 이후).
    const maxBytes = wantSummary ? 250 * 1024 : 50 * 1024

    while (html.length < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      // 요약 안 할 때는 </head> 이후 불필요
      if (!wantSummary && html.includes("</head>")) break
    }
    reader.cancel()

    // 메타태그 파싱
    const ogImage = extractMeta(html, "og:image")
    const twitterImage = extractMeta(html, "twitter:image")
    const ogTitle = extractMeta(html, "og:title")
    const ogDescription = extractMeta(html, "og:description")
    const ogSiteName = extractMeta(html, "og:site_name")

    // <title> 태그 폴백 (ogTitle 은 extractMeta 에서 이미 디코딩됨)
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    const pageTitle = ogTitle || (titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1].trim()) : "")

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
    // http og:image 는 CSP(img-src https:)에 막혀 렌더 자체가 안 됨 → https 로 승격
    if (absoluteImageUrl?.startsWith("http://")) {
      absoluteImageUrl = absoluteImageUrl.replace(/^http:\/\//, "https://")
    }

    // 본문 5줄 요약 (요청 시 + 저렴 모델). 실패해도 메타는 정상 반환.
    let summary: string[] | null = null
    if (wantSummary) {
      const bodyText = extractArticleText(html)
      if (bodyText.length > 200) {
        summary = await summarizeArticle(bodyText, pageTitle)
      }
    }

    return NextResponse.json(
      {
        image: absoluteImageUrl,
        title: pageTitle,
        description: ogDescription || "",
        siteName: ogSiteName || parsedUrl.hostname,
        url: parsedUrl.toString(),
        summary,
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
  if (propMatch) return decodeHtmlEntities(propMatch[1])

  // content="..." property="og:image" (순서 뒤집힌 경우)
  const reverseRegex = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${escapeRegex(property)}["']`,
    "i"
  )
  const reverseMatch = html.match(reverseRegex)
  if (reverseMatch) return decodeHtmlEntities(reverseMatch[1])

  // name="twitter:image" content="..."
  const nameRegex = new RegExp(
    `<meta[^>]*name=["']${escapeRegex(property)}["'][^>]*content=["']([^"']*)["']`,
    "i"
  )
  const nameMatch = html.match(nameRegex)
  if (nameMatch) return decodeHtmlEntities(nameMatch[1])

  return null
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** HTML 에서 기사 본문 텍스트를 대략 추출 (LLM 요약 입력용 — 완벽 추출 불필요). */
function extractArticleText(html: string): string {
  const h = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
  // 본문 컨테이너 우선 (네이버 _article_content/dic_area, 일반 article)
  const m =
    h.match(
      /<(?:div|section|article)[^>]*(?:id|class)=["'][^"']*(?:_article_content|dic_area|article_body|newsct_article|article-?body|post-?content|entry-?content)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|article)>/i
    ) || h.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  const scope = m ? m[1] : h
  return decodeHtmlEntities(scope.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000)
}

/** 기사 본문을 한국어 5줄로 요약 (gpt-4o-mini). 실패 시 null. */
async function summarizeArticle(text: string, title: string): Promise<string[] | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        ...chatParams("gpt-4o-mini", { temperature: 0.3, max_tokens: 600 }),
        messages: [
          {
            role: "system",
            content:
              '기사 본문을 한국어 5줄로 요약한다. 원문이 독일어·스페인어·영어 등 어떤 언어든 반드시 한국어로 번역해 요약한다(출력은 항상 한국어). 각 줄은 객관적 사실만, 뉴스 와이어체(~했다/~이다). 감상·평가·질문·추측·이모지 금지. JSON 으로만 응답: {"lines": ["...", "...", "...", "...", "..."]}',
          },
          { role: "user", content: `제목: ${title}\n\n본문:\n${text}` },
        ],
        response_format: { type: "json_object" },
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return null
    const parsed = JSON.parse(content) as { lines?: unknown }
    if (!Array.isArray(parsed.lines)) return null
    return parsed.lines
      .filter((l): l is string => typeof l === "string" && l.trim().length > 0)
      .slice(0, 5)
  } catch {
    return null
  }
}
