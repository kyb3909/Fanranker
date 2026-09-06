import { describe, it, expect } from "vitest"
import {
  hasSlugToken,
  teamSlugsFromMatchUrl,
  pickReportArticle,
  type ArticleMeta,
} from "@/lib/soccerway/report-article"

/**
 * 고정 시험지 = **2026-08-31 새벽 경기 실측**. 슬러그·발행시각 모두 soccerway 실응답이다.
 * 이 표가 통과하지 못하면 리포트가 다시 라운드업을 원문으로 삼는다.
 */

const ms = (iso: string) => Date.parse(iso)

/** 세 경기가 공유하던 주말 라운드업 — 실제로 이게 원문으로 쓰이고 있었다 */
const TRACKER: ArticleMeta = {
  id: "2ak4zcJr",
  slug: "football-tracker-live-updates-results-august-29-30-2026",
  title: "Football Tracker: Inter Milan and Monaco claim wins, Athletic Club cruise past Celta",
  publishedAtMs: ms("2026-08-29T05:01:00Z"),
}

it("accepts known match/news slug differences and rejects a later reverse fixture", () => {
  const kickoff = ms("2026-08-28T18:30:00Z")
  const article = {
    id: "report",
    title: "Bayern beat Stuttgart",
    slug: "bayern-stuttgart-bundesliga-report-august-28-2026",
    publishedAtMs: kickoff + 2 * 3600_000,
  }
  expect(pickReportArticle([article], ["bayern-munich", "vfb-stuttgart"], kickoff)).toBe(article)
  expect(
    pickReportArticle(
      [{ ...article, publishedAtMs: kickoff + 7 * 86400_000 }],
      ["bayern-munich", "vfb-stuttgart"],
      kickoff
    )
  ).toBeNull()
})

describe("teamSlugsFromMatchUrl", () => {
  it("팀 슬러그 뒤 8자 해시를 떼어낸다", () => {
    expect(
      teamSlugsFromMatchUrl(
        "https://www.soccerway.com/match/ipswich-thqhB2MB/manchester-united-ppjDR086/"
      )
    ).toEqual(["ipswich", "manchester-united"])
  })

  it("여러 마디 팀명도 그대로 살린다", () => {
    expect(
      teamSlugsFromMatchUrl(
        "https://www.soccerway.com/match/arsenal-hA1Zm19f/aston-villa-W00wmLO0/"
      )
    ).toEqual(["arsenal", "aston-villa"])
    expect(
      teamSlugsFromMatchUrl("https://www.soccerway.com/match/as-roma-zVqqL0ma/lecce-G8lYsMgU/")
    ).toEqual(["as-roma", "lecce"])
  })

  it("모양이 다르면 null — 억지로 짜맞추지 않는다", () => {
    expect(teamSlugsFromMatchUrl("https://www.soccerway.com/team/arsenal-hA1Zm19f/")).toBeNull()
    expect(teamSlugsFromMatchUrl("")).toBeNull()
  })
})

describe("hasSlugToken", () => {
  it("하이픈 경계로만 맞춘다 — 포함 관계는 남의 팀을 물어온다", () => {
    expect(hasSlugToken("soccer-serie-a-cagliari-inter-30-08-2026-report", "inter")).toBe(true)
    expect(hasSlugToken("soccer-champions-league-international-cup", "inter")).toBe(false)
    expect(hasSlugToken("como-1907-preview", "como")).toBe(true)
    expect(hasSlugToken("comoros-national-team-news", "como")).toBe(false)
  })
})

describe("pickReportArticle — 2026-08-31 새벽 실측", () => {
  it("맨유-입스위치: 0번 'Team of the Weekend' 말고 전용 리포트를 고른다", () => {
    const articles: ArticleMeta[] = [
      {
        id: "S6Ces4BT",
        slug: "soccer-team-of-the-weekend-august-29-30-2026-kylian-mbappe-lionel-messi-bruno-fernandes-star",
        title: "Team of the Weekend",
        publishedAtMs: ms("2026-08-31T12:27:00Z"),
      },
      TRACKER,
      {
        id: "6BWGJzgA",
        slug: "soccer-premier-league-manchester-united-ipswich-report-august-30",
        title: "Fernandes leads the way with hat-trick as Man Utd storm back to thrash Ipswich",
        publishedAtMs: ms("2026-08-30T17:39:00Z"),
      },
      {
        // 경기 이틀 전 프리뷰 — 양 팀이 다 나오지만 팀 슬러그(manchester-united)가 아니다
        id: "vi9wjRf2",
        slug: "who-s-missing-carlos-baleba-injured-ahead-of-man-united-s-clash-with-ipswich",
        title: "Who's Missing",
        publishedAtMs: ms("2026-08-28T14:54:00Z"),
      },
    ]
    const picked = pickReportArticle(
      articles,
      ["ipswich", "manchester-united"],
      ms("2026-08-30T15:30:00Z")
    )
    expect(picked?.id).toBe("6BWGJzgA")
  })

  it("나폴리-코모: 라운드업 대신 전용 리포트 (종전엔 리포트가 아예 안 나왔다)", () => {
    const articles: ArticleMeta[] = [
      TRACKER,
      {
        id: "htE2es66",
        slug: "soccer-serie-a-napoli-como-30-08-2026-report",
        title: "Douvikas nets winner as Como secure impressive away victory over Napoli",
        publishedAtMs: ms("2026-08-30T18:38:00Z"),
      },
      {
        // 같은 팀의 **다른 경기** 리포트 — 한쪽만 있어 떨어져야 한다
        id: "xA1FK9KU",
        slug: "soccer-serie-a-kevin-de-bruyne-inspires-napoli-to-late-double-over-genoa",
        title: "Kevin De Bruyne inspires Napoli to late double",
        publishedAtMs: ms("2026-08-22T21:04:00Z"),
      },
    ]
    const picked = pickReportArticle(articles, ["como", "napoli"], ms("2026-08-30T16:30:00Z"))
    expect(picked?.id).toBe("htE2es66")
  })

  it("칼리아리-인테르: 같은 팀의 지난 경기 리포트를 집지 않는다", () => {
    const articles: ArticleMeta[] = [
      TRACKER,
      {
        id: "4xTL0xrn",
        slug: "soccer-serie-a-cagliari-inter-30-08-2026-report",
        title: "Inter see off Cagliari to make it two wins from two in Serie A",
        publishedAtMs: ms("2026-08-30T20:46:00Z"),
      },
      {
        id: "QuwQCpyi",
        slug: "inter-monza-serie-a-match-report-22-08",
        title: "Champions Inter Milan thrash Monza",
        publishedAtMs: ms("2026-08-22T18:40:00Z"),
      },
    ]
    const picked = pickReportArticle(articles, ["cagliari", "inter"], ms("2026-08-30T18:45:00Z"))
    expect(picked?.id).toBe("4xTL0xrn")
  })

  it("모나코-마르세유: 통과했던 경기도 원문이 라운드업이 아니라 전용 리포트로 바뀐다", () => {
    const articles: ArticleMeta[] = [
      TRACKER,
      {
        id: "kNXm1a2b",
        slug: "soccer-ligue-1-monaco-marseille-30-08-2026-report",
        title: "Monaco prove too strong for Marseille",
        publishedAtMs: ms("2026-08-30T20:58:00Z"),
      },
    ]
    const picked = pickReportArticle(articles, ["marseille", "monaco"], ms("2026-08-30T18:45:00Z"))
    expect(picked?.id).toBe("kNXm1a2b")
  })

  it("킥오프 전 발행은 프리뷰다 — 양 팀 슬러그가 다 있어도 안 쓴다", () => {
    const preview: ArticleMeta = {
      id: "PREVIEW1",
      slug: "soccer-premier-league-aston-villa-arsenal-preview-31-08-2026",
      title: "Preview",
      publishedAtMs: ms("2026-08-31T09:00:00Z"),
    }
    expect(
      pickReportArticle([preview], ["arsenal", "aston-villa"], ms("2026-08-31T19:00:00Z"))
    ).toBeNull()
  })

  it("전용 리포트가 없으면 null — 라운드업으로 때우지 않는다", () => {
    expect(
      pickReportArticle([TRACKER], ["cagliari", "inter"], ms("2026-08-30T18:45:00Z"))
    ).toBeNull()
    expect(pickReportArticle([], ["cagliari", "inter"], 0)).toBeNull()
  })

  it("report 토큰이 우선, 같으면 먼저 발행된 것 (FT 직후 글이 그 경기 리포트다)", () => {
    const later: ArticleMeta = {
      id: "LATER",
      slug: "soccer-premier-league-manchester-united-ipswich-tactical-breakdown",
      title: "Tactical breakdown",
      publishedAtMs: ms("2026-08-31T11:29:00Z"),
    }
    const report: ArticleMeta = {
      id: "REPORT",
      slug: "soccer-premier-league-manchester-united-ipswich-report-august-30",
      title: "Report",
      publishedAtMs: ms("2026-08-30T17:39:00Z"),
    }
    // report 토큰 우선
    expect(
      pickReportArticle(
        [later, report],
        ["ipswich", "manchester-united"],
        ms("2026-08-30T15:30:00Z")
      )?.id
    ).toBe("REPORT")
    // 둘 다 report 토큰이 없으면 먼저 발행된 쪽
    const earlier: ArticleMeta = {
      ...later,
      id: "EARLIER",
      publishedAtMs: ms("2026-08-30T17:00:00Z"),
    }
    expect(
      pickReportArticle(
        [later, earlier],
        ["ipswich", "manchester-united"],
        ms("2026-08-30T15:30:00Z")
      )?.id
    ).toBe("EARLIER")
  })
})
