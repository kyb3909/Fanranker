import { describe, expect, it } from "vitest"
import {
  isPopularPoolAuthor,
  popularScore,
  rankPopularPosts,
  type PopularPostRow,
} from "@/lib/home/popular-posts"

const NOW = Date.parse("2026-09-03T00:00:00Z")
const H = 3600_000

function row(o: Partial<PopularPostRow> & { id: string }): PopularPostRow {
  return {
    title: "t",
    community_slug: "football",
    user_id: "user_a",
    image: null,
    video: null,
    vote_count: 0,
    comment_count: 0,
    created_at: new Date(NOW - 1 * H).toISOString(),
    last_comment_at: null,
    ...o,
  }
}

describe("인기 게시글 풀 — 작성자", () => {
  it("사람과 축구밈봇은 들고, 뉴스봇·중계불판·시드봇은 뺀다", () => {
    expect(isPopularPoolAuthor("user_2abc")).toBe(true)
    expect(isPopularPoolAuthor("user_bot_soccermeme")).toBe(true)
    expect(isPopularPoolAuthor("user_bot_soccer_kr")).toBe(false)
    expect(isPopularPoolAuthor("user_bot_matchthread")).toBe(false)
    expect(isPopularPoolAuthor("user_reddit_seed_1")).toBe(false)
  })

  it("rankPopularPosts 가 봇 행을 걸러낸다", () => {
    const ranked = rankPopularPosts(
      [row({ id: "news", user_id: "user_bot_soccer_kr", vote_count: 99 }), row({ id: "human" })],
      NOW
    )
    expect(ranked.map((r) => r.id)).toEqual(["human"])
  })
})

describe("인기 게시글 풀 — 점수", () => {
  it("추천·댓글이 신선도보다 앞선다 — 5일 된 글도 추천 3개면 방금 올라온 무반응 글을 이긴다", () => {
    const old = row({
      id: "old",
      vote_count: 3,
      created_at: new Date(NOW - 5 * 24 * H).toISOString(),
    })
    const fresh = row({ id: "fresh" })
    expect(rankPopularPosts([fresh, old], NOW).map((r) => r.id)).toEqual(["old", "fresh"])
  })

  it("무반응 새 글은 미디어·신선도로 3일 지난 무반응 글보다 앞선다 (빈 SNS 방지)", () => {
    const stale = row({ id: "stale", created_at: new Date(NOW - 3 * 24 * H).toISOString() })
    const meme = row({ id: "meme", user_id: "user_bot_soccermeme", image: "/storage/posts/x.jpeg" })
    expect(rankPopularPosts([stale, meme], NOW).map((r) => r.id)).toEqual(["meme", "stale"])
  })

  it("신선도 보너스는 72시간에 0 이 된다", () => {
    const base = row({ id: "a", created_at: new Date(NOW - 80 * H).toISOString() })
    expect(popularScore(base, NOW)).toBe(0)
    const twoDays = row({ id: "b", created_at: new Date(NOW - 48 * H).toISOString() })
    expect(popularScore(twoDays, NOW)).toBeCloseTo(2)
  })

  it("24시간 안에 댓글이 달린 글은 '지금 떠드는' 보너스를 받는다", () => {
    const quiet = row({ id: "quiet", comment_count: 2 })
    const talking = row({
      id: "talking",
      comment_count: 2,
      last_comment_at: new Date(NOW - 2 * H).toISOString(),
    })
    expect(popularScore(talking, NOW) - popularScore(quiet, NOW)).toBe(2)
  })

  it("동점이면 최신순", () => {
    const a = row({ id: "a", created_at: new Date(NOW - 100 * H).toISOString() })
    const b = row({ id: "b", created_at: new Date(NOW - 90 * H).toISOString() })
    expect(rankPopularPosts([a, b], NOW).map((r) => r.id)).toEqual(["b", "a"])
  })
})
