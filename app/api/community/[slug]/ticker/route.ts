import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"
import {
  postsToTickerItems,
  tickerRootOf,
  TICKER_BOT_BY_ROOT,
  TICKER_WINDOW_MS,
} from "@/lib/ticker/from-posts"

/**
 * GET /api/community/[slug]/ticker
 *
 * Response matches the TickerItem interface in news-ticker.tsx:
 *   { items: [{ id, tag, text, href? , detail? }] }
 *
 * ## 공급원이 둘이다 (2026-09-02)
 *
 * 1. **오늘의 떡밥** — 종목에 뉴스봇이 있으면(`TICKER_BOT_BY_ROOT`) 그 봇의 발행 글.
 *    떡밥 피드(`lib/feed/cardnews.ts`)와 같은 규칙: 24h 창 · 순수 최신순 · 한국 매체 제외.
 *    항목은 `href` 로 **우리 글 페이지**에 연결된다 — 토론은 거기 있다.
 *    운영자(2026-09-02): "티커는 오늘의 떡밥 컨텐츠를 활용하는 걸로 대체".
 *
 * 2. **레거시 `news_ticker_items`** — 봇이 없는 종목만. Vultr 크롤러가 GPT 요약으로 채운다.
 *    축구는 이제 이 표를 읽지 않는다. 같은 소식을 두 번 요약하고, 클릭이 밖으로 새던 구조였다.
 *
 * 팀 게시판은 종목 루트를 본다 (2026-08-25 운영자: "팀 게시판은 그냥 축구 게시판에 있는
 * 티커 보여주면 될 것 같은데"). 루트는 `categories.parent_slug` 로 푼다.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const supabase = createServiceRoleClient()

    // ── 1) 떡밥 경로 — 종목 루트에 뉴스봇이 있으면 여기서 끝난다 ──────────────
    const { data: cat } = await supabase
      .from("categories")
      .select("parent_slug")
      .eq("slug", slug)
      .maybeSingle()
    const root = tickerRootOf(slug, cat?.parent_slug)
    const botUserId = TICKER_BOT_BY_ROOT[root]
    if (botUserId) {
      const { data: posts, error: postsError } = await supabase
        .from("posts")
        .select("id, title, source_url, created_at")
        .eq("user_id", botUserId)
        .eq("community_slug", root)
        .is("deleted_at", null)
        .gte("created_at", new Date(Date.now() - TICKER_WINDOW_MS).toISOString())
        .order("created_at", { ascending: false })
        // 한국 매체 제외로 몇 건 빠질 수 있어 넉넉히 뽑고 매핑에서 20으로 자른다
        .limit(40)
      if (postsError) {
        apiError("Ticker posts query error", 500, postsError)
        return NextResponse.json({ items: [] })
      }
      return NextResponse.json(
        { items: postsToTickerItems(posts ?? []) },
        { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } }
      )
    }

    // ── 2) 레거시 경로 — 봇 없는 종목 ─────────────────────────────────────────
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const COLUMNS =
      "id, headline_kr, summary_kr, category, importance, ticker_tag, external_url, link_url, thumbnail_url, media_type, score, num_comments, posted_at, source_id, author, original_title"

    const fetchFor = (s: string) =>
      supabase
        .from("news_ticker_items")
        .select(COLUMNS)
        .eq("community_slug", s)
        .gte("posted_at", cutoff)
        .order("importance", { ascending: false })
        .order("posted_at", { ascending: false })
        .limit(20)

    let { data: rows, error } = await fetchFor(slug)

    /**
     * 팀 게시판은 자기 티커가 없으면 **상위 종목 티커를 그대로 보여준다**
     * (2026-08-25 운영자: "팀 게시판은 그냥 축구 게시판에 있는 티커 보여주면 될 것 같은데").
     *
     * ⚠️ 외부 감사 지적 — 아스날 게시판 티커가 "실시간 소식을 불러오는 중…" 에서 멈춰
     *    있었다. 로딩이 아니라 **빈 결과**였다: 티커는 종목 단위로만 쌓이는데
     *    (`community_slug='football'`), 화면은 빈 배열을 로딩과 같은 꼴로 그렸다.
     *    그래서 영원히 불러오는 중처럼 보였다.
     *
     * ⚠️ 목업 폴백에 기대지 않는다. 클라이언트에 `COMMUNITY_TICKER_ITEMS` 라는 가짜
     *    데이터가 있는데 거기엔 팀 슬러그가 없어서 어차피 안 걸렸고, 걸렸다면 더 나빴다 —
     *    지어낸 소식을 실시간인 척 띄우는 것이기 때문이다.
     */
    if (!error && (rows?.length ?? 0) === 0) {
      // 루트는 위에서 이미 풀었다 — 팀 게시판이면 root !== slug
      if (root !== slug) {
        const up = await fetchFor(root)
        if (!up.error && (up.data?.length ?? 0) > 0) rows = up.data
      }
    }

    if (error) {
      // Graceful degradation: capture to Sentry but return empty items
      apiError("Ticker query error", 500, error)
      return NextResponse.json({ items: [] })
    }

    // Extract display-friendly source name from URL domain
    function extractSourceName(url: string | null): string | null {
      if (!url) return null
      try {
        const host = new URL(url).hostname.replace(/^www\./, "")
        // Known domain → friendly name
        const DOMAIN_NAMES: Record<string, string> = {
          "variety.com": "Variety",
          "hollywoodreporter.com": "Hollywood Reporter",
          "deadline.com": "Deadline",
          "indiewire.com": "IndieWire",
          "inverse.com": "Inverse",
          "nytimes.com": "NY Times",
          "bbc.com": "BBC",
          "bbc.co.uk": "BBC",
          "theguardian.com": "The Guardian",
          "espn.com": "ESPN",
          "marca.com": "Marca",
          "goal.com": "Goal",
          "skysports.com": "Sky Sports",
          "theathletic.com": "The Athletic",
          "chelseafc.com": "Chelsea FC",
          "reuters.com": "Reuters",
          "apnews.com": "AP News",
          "ign.com": "IGN",
          "imdb.com": "IMDb",
          "rottentomatoes.com": "Rotten Tomatoes",
          "youtube.com": "YouTube",
          "youtu.be": "YouTube",
        }
        if (DOMAIN_NAMES[host]) return DOMAIN_NAMES[host]
        // i.redd.it, preview.redd.it → skip (not a real source)
        if (host.endsWith("redd.it") || host.endsWith("imgur.com")) return null
        // Fallback: capitalize domain without TLD
        const name = host.split(".")[0]
        return name.charAt(0).toUpperCase() + name.slice(1)
      } catch {
        return null
      }
    }

    // Subreddit display names (fallback)
    const SUBREDDIT_NAMES: Record<string, string> = {
      "reddit-soccer": "r/soccer",
      "reddit-movies": "r/movies",
    }

    // Map DB rows → frontend TickerItem format
    const items = (rows || []).map((row) => ({
      id: `ticker-${row.id}`,
      tag: row.ticker_tag as "live" | "breaking" | "result",
      text: row.headline_kr,
      detail: {
        summary: row.summary_kr ? row.summary_kr.split("\n") : [],
        source: extractSourceName(row.link_url) || SUBREDDIT_NAMES[row.source_id] || row.source_id,
        sourceUrl: row.link_url || row.external_url,
        redditUrl: row.external_url,
        thumbnailUrl: row.thumbnail_url || null,
        mediaType: row.media_type || null,
        participants: row.num_comments || 0,
        score: row.score || 0,
        category: row.category,
        importance: row.importance,
        postedAt: row.posted_at,
        originalTitle: row.original_title,
      },
    }))

    return NextResponse.json(
      { items },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
        },
      }
    )
  } catch (error) {
    // Graceful degradation: return empty items instead of error response
    // but still capture to Sentry via apiError side-effect
    apiError("Ticker API error", 500, error)
    return NextResponse.json({ items: [] })
  }
}
