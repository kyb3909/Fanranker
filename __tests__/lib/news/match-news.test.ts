import { describe, it, expect } from "vitest"
import {
  readArticle,
  boundParagraphs,
  parseNewsIndex,
  collectMatchNews,
  MATCH_NEWS_SOURCES,
} from "@/scripts/vps-news-scanner/match-news.mjs"

describe("match news source capture", () => {
  it("retains complete questions and quotes past the old 2800 character cut", () => {
    const intro = "The match had several important moments for both sides. ".repeat(55)
    const quote = 'Why did you change? "We changed because our midfield needed support."'
    const article = readArticle(
      `<main><p>${intro}</p><h2>Why the change?</h2><p>${quote}</p></main>`
    )
    expect(article.text).toContain(quote)
    expect(article.text).toContain("Why the change?")
    expect(boundParagraphs("first paragraph\nThis whole quoted paragraph is too long", 20)).toBe(
      "first paragraph"
    )
  })
  it("does not treat a related-card article as the article body", () => {
    const body = "This is the actual interview with the full explanation. ".repeat(10)
    expect(
      readArticle(`<main><p>${body}</p><article><p>Related link</p></article></main>`).text
    ).toContain(body.trim())
  })
  it("extracts public rich text hydration without executing script code", () => {
    const quote = "We changed the system because the opponent pressed our full backs."
    const doc = {
      nodeType: "document",
      content: [{ nodeType: "paragraph", content: [{ nodeType: "text", value: quote }] }],
    }
    const flight = `a:${JSON.stringify(["$", "Article", null, { body: doc }])}\n`
    const html = `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`
    expect(readArticle(html).text).toBe(quote)
  })
  it("reads CDATA RSS titles and rejects unrelated paths on club indexes", () => {
    const feed = MATCH_NEWS_SOURCES.find((s) => s.key === "bbc")!
    const xml =
      '<rss><item><title><![CDATA[Coach: "We need balance"]]></title><link>https://bbc.co.uk/sport/story</link><pubDate>Sun, 13 Sep 2026 20:00:00 GMT</pubDate></item></rss>'
    expect(parseNewsIndex(xml, feed)[0].title).toBe('Coach: "We need balance"')
    const club = MATCH_NEWS_SOURCES.find((s) => s.key === "manutd")!
    expect(
      parseNewsIndex(
        '<a href="/en/news/category/press-conference">Press Conference</a><a href="https://evil.example/en/news/fake-article">Coach: hello</a>',
        club
      )
    ).toEqual([])
  })
  it("visits active clubs only, reports source failures and keeps the collection cap", async () => {
    const requested: string[] = []
    const fakeFetch = async (url: string) => {
      requested.push(url)
      if (url.includes("bbci")) throw new Error("temporary outage")
      return new Response(
        '<main><a href="/en/news/coach-speaks-after-the-away-draw">Coach: We need balance</a></main>'
      )
    }
    const result = await collectMatchNews({
      matches: [
        { id: "match", aliases: ["Manchester United"], match_time: "2026-09-13T15:30:00Z" },
      ],
      fetcher: fakeFetch as typeof fetch,
      now: Date.parse("2026-09-14T04:00:00Z"),
    })
    expect(requested.some((u) => u.includes("manutd"))).toBe(true)
    expect(requested.some((u) => u.includes("chelsea"))).toBe(false)
    expect(result.posts).toHaveLength(1)
    expect(result.posts[0].match_ids).toEqual(["match"])
    expect(result.diagnostics.some((d) => d.error)).toBe(true)
  })
})
