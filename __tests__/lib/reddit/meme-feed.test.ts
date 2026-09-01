import { describe, it, expect } from "vitest"
import { parseRedditMemeFeed, pickMemeCandidates, hasBlockedWord } from "@/lib/reddit/meme-feed"

/**
 * 고정 시험지 = r/soccercirclejerk 실피드 발췌 (2026-09-01 수집).
 * 이미지 글 1건 + 텍스트 글 1건 — 이 둘을 가르는 것이 이 모듈의 존재 이유다.
 */
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
  <author><name>/u/Ummagumma-</name></author>
  <content type="html">&lt;table&gt;&lt;tr&gt;&lt;td&gt;
    &lt;a href=&quot;https://www.reddit.com/r/soccercirclejerk/comments/1w46bdn/the_unbeaten_premier_league_giants_after_matchday/&quot;&gt;
    &lt;img src=&quot;https://preview.redd.it/gcmtmnqhivmh1.png?width=320&quot; alt=&quot;x&quot; /&gt;&lt;/a&gt;
    &lt;span&gt;&lt;a href=&quot;https://i.redd.it/gcmtmnqhivmh1.png&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt;
  &lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</content>
  <title>The unbeaten Premier League Giants after Matchday 2</title>
  <updated>2026-09-01T10:00:00+00:00</updated>
</entry>
<entry>
  <author><name>/u/someone</name></author>
  <content type="html">&lt;div&gt;&lt;a href=&quot;https://www.reddit.com/r/soccercirclejerk/comments/1w3vgsb/the_most_levelheaded_player_in_south_america/&quot;&gt;[comments]&lt;/a&gt;&lt;/div&gt;</content>
  <title>the most level-headed player in South America</title>
  <updated>2026-09-01T09:00:00+00:00</updated>
</entry>
</feed>`

const NOW = Date.parse("2026-09-01T12:00:00Z")
const base = {
  blockedWords: ["politic", "war", "death", "police"],
  seenPermalinks: new Set<string>(),
  nowMs: NOW,
  maxAgeMs: 48 * 3600_000,
  limit: 5,
}

describe("parseRedditMemeFeed", () => {
  const entries = parseRedditMemeFeed(FEED)

  it("엔트리를 읽고 이미지 글과 텍스트 글을 구분한다", () => {
    expect(entries).toHaveLength(2)
    expect(entries[0].imageUrl).toBe("https://i.redd.it/gcmtmnqhivmh1.png")
    expect(entries[1].imageUrl).toBeNull()
  })

  it("이중 이스케이프된 제목·링크를 제대로 푼다", () => {
    expect(entries[0].title).toBe("The unbeaten Premier League Giants after Matchday 2")
    expect(entries[0].permalink).toContain("/comments/1w46bdn/")
    expect(entries[0].id).toBe("1w46bdn")
    expect(entries[0].author).toBe("/u/Ummagumma-")
  })

  it("모양이 깨져도 터지지 않는다 (fail-open)", () => {
    expect(parseRedditMemeFeed("")).toEqual([])
    expect(parseRedditMemeFeed("<feed><entry><title>t</title></entry></feed>")).toEqual([])
  })
})

describe("pickMemeCandidates", () => {
  const entries = parseRedditMemeFeed(FEED)

  it("⚠️ 텍스트 글은 안 받는다 — 이 서브레딧의 텍스트는 반어라 번역하면 뜻이 뒤집힌다", () => {
    const picked = pickMemeCandidates(entries, base)
    expect(picked).toHaveLength(1)
    expect(picked[0].id).toBe("1w46bdn")
  })

  it("이미 담은 글은 다시 안 가져온다", () => {
    const seen = new Set([entries[0].permalink])
    expect(pickMemeCandidates(entries, { ...base, seenPermalinks: seen })).toEqual([])
  })

  it("소재가 정치·사건사고면 밈이라도 버린다", () => {
    const dirty = [{ ...entries[0], title: "Ukraine war meme" }]
    expect(pickMemeCandidates(dirty, base)).toEqual([])
  })

  it("오래된 밈은 안 가져온다 — 시의성이 전부다", () => {
    const old = [{ ...entries[0], updatedAtMs: NOW - 100 * 3600_000 }]
    expect(pickMemeCandidates(old, base)).toEqual([])
  })

  it("시각을 못 읽은 항목은 통과시킨다 — 피드 모양이 바뀌어 물량 0 이 되는 게 더 나쁘다", () => {
    const noTs = [{ ...entries[0], updatedAtMs: null }]
    expect(pickMemeCandidates(noTs, base)).toHaveLength(1)
  })

  it("회차 상한을 지킨다", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      ...entries[0],
      id: `x${i}`,
      permalink: `https://www.reddit.com/r/x/comments/x${i}/`,
    }))
    expect(pickMemeCandidates(many, { ...base, limit: 2 })).toHaveLength(2)
  })
})

describe("hasBlockedWord", () => {
  it("단어 경계로만 본다 — 부분일치로 멀쩡한 밈을 죽이지 않는다", () => {
    expect(hasBlockedWord("Ukraine war meme", ["war"])).toBe(true)
    // "war" 가 "Warriors"·"forward" 안에 있다고 걸리면 안 된다
    expect(hasBlockedWord("The forward was warming up", ["war"])).toBe(false)
    expect(hasBlockedWord("Golden State Warriors", ["war"])).toBe(false)
  })

  it("대소문자를 가리지 않는다", () => {
    expect(hasBlockedWord("TRUMP said", ["trump"])).toBe(true)
  })
})
