import { describe, it, expect } from "vitest"
import { discoverTeamsForGame, type TeamDictionaryRow } from "@/lib/soccerway/match-mapping"
import { parseTeamSearchResults } from "@/lib/soccerway/team-search"
import type { MatchPageFetchResult } from "@/lib/soccerway/match-page"

/**
 * 팀 자동 발견 — "검색이 후보를 내고, 경기 페이지 날짜 대조가 등재를 결정한다"
 * (2026-08-07 운영자: "매핑하는 에이전트 구현해줘"). 실전 첫 스윕에서 19팀
 * 자동 발견·12경기 매핑에 성공한 로직의 회귀 방지선.
 */

const gimpo: TeamDictionaryRow = {
  soccerway_team_id: "AAAAAAA1",
  slug: "gimpo-fc",
  name_en: "Gimpo FC",
  name_kr: "김포FC",
  aliases_kr: [],
  status: "proposed",
}

const game = {
  id: "g1",
  home_team_name: "김포FC",
  away_team_name: "충북청주 프로축구단",
  match_time: "2026-08-07T10:30:00Z",
  league_code: "K리그2",
}

/** 페이지 HTML 픽스처 — 후보 해시가 canonical 에 박히도록 동적 생성 */
function pageFor(homeHash: string, awayHash: string, date = "07/08/2026"): MatchPageFetchResult {
  return {
    httpStatus: 200,
    finalUrl: `https://www.soccerway.com/match/a-${homeHash}/b-${awayHash}/`,
    html: `<title>Gimpo FC v Cheongju live scores | Soccerway</title>
<meta name="description" content="On ${date} stay tuned with K League 2 2026 for Gimpo FC v Cheongju live scores, lineups.">
<link rel="canonical" href="https://www.soccerway.com/match/a-${homeHash}/b-${awayHash}/">`,
  }
}

const notFound: MatchPageFetchResult = { httpStatus: 404, finalUrl: "", html: null }

function makeInput(overrides: Partial<Parameters<typeof discoverTeamsForGame>[0]>) {
  return {
    game,
    home: gimpo,
    away: null,
    searcher: async () => [],
    proposer: async () => ["cheongju"],
    fetcher: async () => notFound,
    pageCache: new Map(),
    candidateMemo: new Map(),
    paceMs: 0,
    ...overrides,
  }
}

describe("discoverTeamsForGame", () => {
  it("검색 1후보 + 경기 페이지 날짜 일치 → 그 팀만 발견 (등재 대상)", async () => {
    const r = await discoverTeamsForGame(
      makeInput({
        searcher: async () => [
          {
            soccerwayTeamId: "BBBBBBB2",
            slug: "cheongju",
            nameEn: "Cheongju",
            country: "South Korea",
          },
        ],
        fetcher: async () => pageFor("AAAAAAA1", "BBBBBBB2"),
      })
    )
    expect(r).not.toBeNull()
    expect(r!.discovered.map((t) => t.soccerway_team_id)).toEqual(["BBBBBBB2"])
    expect(r!.discovered[0].name_kr).toBe("충북청주 프로축구단")
    expect(r!.judgement.outcome).toBe("proposed")
  })

  it("후보 2팀이 모두 날짜 일치 → 모호 — 등재하지 않는다 (fail-closed)", async () => {
    const r = await discoverTeamsForGame(
      makeInput({
        searcher: async () => [
          {
            soccerwayTeamId: "BBBBBBB2",
            slug: "cheongju",
            nameEn: "Cheongju",
            country: "South Korea",
          },
          {
            soccerwayTeamId: "CCCCCCC3",
            slug: "cheongju-city",
            nameEn: "Cheongju City",
            country: "South Korea",
          },
        ],
        // 어느 조합이든 날짜가 맞는 페이지가 나옴 → 단일 확정 불가
        fetcher: async (url: string) =>
          url.includes("CCCCCCC3")
            ? pageFor("AAAAAAA1", "CCCCCCC3")
            : pageFor("AAAAAAA1", "BBBBBBB2"),
      })
    )
    expect(r).toBeNull()
  })

  it("페이지 날짜가 킥오프와 다르면 그 후보는 탈락 → 남는 조합 없으면 null", async () => {
    const r = await discoverTeamsForGame(
      makeInput({
        searcher: async () => [
          {
            soccerwayTeamId: "BBBBBBB2",
            slug: "cheongju",
            nameEn: "Cheongju",
            country: "South Korea",
          },
        ],
        fetcher: async () => pageFor("AAAAAAA1", "BBBBBBB2", "20/08/2026"),
      })
    )
    expect(r).toBeNull()
  })

  it("리그 국가 힌트와 다른 나라 팀은 후보에서 제외", async () => {
    const r = await discoverTeamsForGame(
      makeInput({
        searcher: async () => [
          {
            soccerwayTeamId: "DDDDDDD4",
            slug: "cheongju-jp",
            nameEn: "Cheongju JP",
            country: "Japan",
          },
        ],
        fetcher: async () => pageFor("AAAAAAA1", "DDDDDDD4"),
      })
    )
    expect(r).toBeNull()
  })
})

describe("parseTeamSearchResults", () => {
  it("남자 축구 팀만 통과 — 여자팀·선수·타 종목 제외 (여자축구 정책)", () => {
    const raw = [
      {
        id: "x0hNfcgA",
        url: "jeonbuk",
        name: "Jeonbuk",
        type: { name: "Team" },
        sport: { name: "Soccer" },
        gender: { name: "Men" },
        defaultCountry: { name: "South Korea" },
      },
      {
        id: "SEgauyij",
        url: "hwacheon-kspo",
        name: "Hwacheon W",
        type: { name: "Team" },
        sport: { name: "Soccer" },
        gender: { name: "Women" },
        defaultCountry: { name: "South Korea" },
      },
      {
        id: "vgOOdZbd",
        url: "messi-lionel",
        name: "Messi Lionel",
        type: { name: "Player" },
        sport: { name: "Soccer" },
        gender: { name: "Men" },
      },
      {
        id: "ZZZZZZZ9",
        url: "some-nba",
        name: "Basket",
        type: { name: "Team" },
        sport: { name: "Basketball" },
        gender: { name: "Men" },
      },
    ]
    const out = parseTeamSearchResults(raw)
    expect(out).toEqual([
      { soccerwayTeamId: "x0hNfcgA", slug: "jeonbuk", nameEn: "Jeonbuk", country: "South Korea" },
    ])
  })

  it("배열 아님·필드 결손은 빈 결과", () => {
    expect(parseTeamSearchResults(null)).toEqual([])
    expect(
      parseTeamSearchResults([
        { id: "짧음", url: "x", name: "X", type: { name: "Team" }, sport: { name: "Soccer" } },
      ])
    ).toEqual([])
  })
})
