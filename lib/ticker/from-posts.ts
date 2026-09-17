import { isKoreanSource, stripSourcePrefix } from "@/lib/feed/source-rules"

/**
 * 게시판 티커 공급원 = **오늘의 떡밥** (2026-09-02 운영자: "티커는 오늘의 떡밥 컨텐츠를
 * 활용하는 걸로 대체"). **순수 모듈** — 라우트는 조회만 하고 판단은 여기서 한다.
 *
 * ## 종전
 * Vultr 의 레거시 크롤러가 레딧·네이버 글을 GPT 로 요약해 `news_ticker_items` 에 넣고,
 * 티커는 그 표를 읽었다. 떡밥(뉴스봇 발행 글)과 **같은 소식을 두 번 요약**하는 구조였고,
 * 티커 쪽 요약은 우리 글로 이어지지 않아 클릭이 밖(원문)으로 새나갔다.
 *
 * ## 지금
 * 떡밥과 같은 규칙 — 뉴스봇 계정 글, 24시간 창, 순수 최신순, 한국 매체 제외
 * (`lib/feed/cardnews.ts` 의 `fetchCardNews` 와 같은 조건. 단 거기의 "사진 없는 글 제외"는
 * 안 따른다 — 카드는 그림이 있어야 하지만 한 줄 티커는 제목이면 된다).
 * 클릭은 **우리 글 페이지**로 간다. 토론은 거기 있다.
 *
 * ⚠️ 팀 게시판은 상위 종목의 떡밥을 그대로 본다 (2026-08-25 운영자: "팀 게시판은 그냥
 *    축구 게시판에 있는 티커 보여주면 될 것 같은데"). 팀별로 자르지 않는다.
 */

/** 종목 루트 슬러그 → 그 종목의 뉴스봇 계정. 없는 종목은 레거시 티커 표를 그대로 쓴다. */
export const TICKER_BOT_BY_ROOT: Record<string, string> = {
  football: "user_bot_soccer_kr",
}

/** 떡밥 자격 시간창 — cardnews 와 같은 24h */
export const TICKER_WINDOW_MS = 24 * 3600 * 1000

/**
 * 게시판 슬러그 → 종목 루트. 종목 자신이면 자기, 팀 게시판이면 부모.
 * 부모를 모르면(카테고리 조회 실패) 자기 자신 — 그러면 매핑이 없어 레거시로 떨어진다.
 */
export function tickerRootOf(slug: string, parentSlug: string | null | undefined): string {
  return parentSlug && parentSlug !== slug ? parentSlug : slug
}

export interface TickerPostRow {
  id: string
  title: string
  source_url: string | null
  source_name?: string | null
  comment_count?: number | null
  created_at: string
}

export interface TickerPostSummaryRow {
  post_id: string
  lines: string[]
  kind: "news" | "interview"
  source_name: string | null
}

export interface TickerItemFromPost {
  id: string
  /** 스트립에는 안 그려진다(타입 계약용). 떡밥은 전부 속보 취급 */
  tag: "breaking"
  text: string
  /** 우리 글 페이지 — 요약이 없으면 여기로 이동, 있으면 모달의 "글 보기" 링크 */
  href: string
  /** 모달 댓글이 붙는 글. 댓글은 posts 의 comments 그대로다 (그림자 스레드 금지) */
  postId: string
  /** 세 줄 요약 (2026-09-18). 있으면 스트립 클릭이 모달을 연다 */
  detail?: {
    summary: string[]
    kind: "news" | "interview"
    source: string
    sourceUrl: string
    participants: number
    postedAt: string
  }
}

/**
 * 봇 글 → 티커 항목. 입력은 **이미 24h·최신순·봇 계정으로 걸러진** 행이어야 한다
 * (그건 DB 쿼리 몫). 여기서는 한국 매체 제외와 제목 정리만 한다.
 *
 * `[출처]` 프리픽스는 뗀다 — 한 줄 스트립에 "[로마노]" 가 앞에 붙으면 제목이 잘린다.
 * 출처는 모달·글 페이지에 그대로 있다.
 */
export function postsToTickerItems(
  rows: TickerPostRow[],
  limit = 20,
  summaries: TickerPostSummaryRow[] = []
): TickerItemFromPost[] {
  const byPost = new Map(summaries.map((s) => [String(s.post_id), s]))
  const out: TickerItemFromPost[] = []
  for (const r of rows) {
    if (isKoreanSource(r.source_url)) continue
    const { source, title } = stripSourcePrefix(r.title ?? "")
    if (!title) continue
    const item: TickerItemFromPost = {
      id: `post-${r.id}`,
      tag: "breaking",
      text: title,
      href: `/post/${r.id}`,
      postId: String(r.id),
    }
    const s = byPost.get(String(r.id))
    if (s && Array.isArray(s.lines) && s.lines.length >= 2) {
      item.detail = {
        summary: s.lines,
        kind: s.kind === "interview" ? "interview" : "news",
        source: s.source_name || r.source_name || source || "원문",
        sourceUrl: r.source_url ?? "",
        participants: r.comment_count ?? 0,
        postedAt: r.created_at,
      }
    }
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}
