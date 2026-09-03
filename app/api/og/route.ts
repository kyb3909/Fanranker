import { NextRequest, NextResponse } from "next/server"
import { apiError, checkRateLimit } from "@/lib/api-error"
import { currentUser } from "@clerk/nextjs/server"
import { timingSafeEqual } from "crypto"
import { assertPublicUrl, SsrfBlockedError } from "@/lib/ssrf-guard"
import { decodeHtmlEntities } from "@/lib/decode-html-entities"
import { chatParams } from "@/lib/llm/openai-params"
import { logUsage, logUsageFailure } from "@/lib/llm/usage-log"

export const runtime = "nodejs"

/** `Authorization: Bearer <CRON_SECRET>` — lib/cron-auth 와 같은 비교(타이밍 안전). 비밀이 없으면 항상 false */
function isInternalCaller(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const a = Buffer.from(request.headers.get("authorization") || "")
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * GET /api/og?url=...
 *
 * URL에서 OG 이미지를 추출하여 반환
 * - og:image 메타태그 우선
 * - twitter:image 폴백
 *
 * ## ⚠️ 문을 두 겹으로 나눈 이유 (2026-09-02 감사)
 * 이 라우트는 **바깥 URL 을 가져와 LLM 에 넣는다**(`summarize=1`). 그런데 인증도
 * 레이트리밋도 없어서, 저장소 전체에서 **외부인이 우리 OpenAI 비용을 발생시킬 수 있는
 * 유일한 지점**이었다. 응답에 CDN 캐시(`s-maxage=3600`)가 붙어 있지만 캐시 키가 URL 이라
 * URL 만 바꾸면 무한히 우회된다.
 *
 * 그렇다고 라우트 전체를 막으면 안 된다 — 메타 추출은 에디터가 링크를 붙일 때마다 부르는
 * 가벼운 경로다. 그래서 **비용이 드는 쪽에만** 문을 건다:
 *   · 메타 추출  → 레이트리밋만 (STANDARD)
 *   · LLM 요약   → 로그인 필수 + STRICT(10/분). 유일한 호출부가 글쓰기 에디터라
 *                  (`hooks/use-write-og.ts:25`) 로그인 요구가 정상 사용을 막지 않는다.
 *
 * ⚠️ 레이트리밋은 인메모리라 인스턴스별로 독립이다(`lib/rate-limit.ts`). 전역 한도가
 *    아니므로 완전한 방어가 아니지만, 무제한과는 다르다. 전역화는 별건.
 */
export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get("url")
    if (!url) {
      return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 })
    }
    const wantSummary = request.nextUrl.searchParams.get("summarize") === "1"

    // 내부 호출(VPS 뉴스 스캐너 — scripts/vps-news-scanner)은 CRON_SECRET 으로 신원을 밝힌다.
    // 2026-09-02 잠금(a89c4dc3)이 "유일한 호출부는 글쓰기 에디터"라고 봤지만 스캐너도 이 경로를
    // summarize=1 로 불렀고, 401 을 받자 `{}` 로 떨어져 **이미지까지** 잃었다 — 초안 사진
    // 44/83(9/1) → 6/69(9/2) → 0/10(9/3), 전부 구단 카드로 발행. 메타·이미지는 비로그인
    // 공개 경로와 비용이 같으므로 401 이 아니라 **요약만 뺀다**. LLM 은 여전히 로그인·비밀 뒤.
    const internal = isInternalCaller(request)
    const limited = checkRateLimit(request, wantSummary && !internal ? "STRICT" : "STANDARD")
    if (limited) return limited
    const summarize = wantSummary && (internal || !!(await currentUser()))

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
    // 기사 게시 시각 — 스캐너가 "레딧엔 방금 올라왔지만 기사는 3주 전"인 재탕을 거른다
    // (2026-09-03 애스턴 빌라-PSG 슈퍼컵 recap: 8/13 경기가 9/3 에 다시 발행됐다).
    const publishedAt = extractPublishedAt(html, parsedUrl)

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
    if (summarize) {
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
        publishedAt,
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

/**
 * 기사 게시 시각 (ISO) — `article:published_time` → JSON-LD `datePublished` → URL 경로의
 * /YYYY/MM/DD/ 순. 어느 것도 없으면 null (판정하지 않는다 — 스캐너가 "모름"으로 통과시킨다).
 */
function extractPublishedAt(html: string, url: URL): string | null {
  const candidates: (string | null)[] = [
    extractMeta(html, "article:published_time"),
    html.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1] ?? null,
  ]
  const pathDate = url.pathname.match(/\/(20\d{2})\/(\d{1,2})\/(\d{1,2})\//)
  if (pathDate)
    candidates.push(
      `${pathDate[1]}-${pathDate[2].padStart(2, "0")}-${pathDate[3].padStart(2, "0")}T12:00:00Z`
    )
  for (const c of candidates) {
    if (!c) continue
    const t = Date.parse(c)
    if (Number.isFinite(t) && t > Date.parse("2000-01-01") && t < Date.now() + 86400_000) {
      return new Date(t).toISOString()
    }
  }
  return null
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

/** 기사 본문을 한국어 5줄로 요약 (gpt-5.6-luna). 실패 시 null. */
async function summarizeArticle(text: string, title: string): Promise<string[] | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  try {
    const llmStartedAt = Date.now()
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        ...chatParams("gpt-5.6-luna", { temperature: 0.3, max_tokens: 600 }),
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
    if (!res.ok) {
      logUsageFailure("og-image", "gpt-5.6-luna", `http_${res.status}`, Date.now() - llmStartedAt)
      return null
    }
    const data = await res.json()
    logUsage("og-image", "gpt-5.6-luna", data, Date.now() - llmStartedAt)
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
