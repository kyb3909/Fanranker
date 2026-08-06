import { describe, it, expect } from "vitest"
import {
  buildMatchUrl,
  parseMatchPage,
  extractTeamIdsFromMatchUrl,
} from "@/lib/soccerway/match-page"

/**
 * Soccerway 경기 페이지 파서 — 2026-08-07 실측 HTML 메타를 픽스처로 잠근다.
 * 템플릿 2종 실측:
 *  A. 단일 경기 (빌라-뮌헨 친선): description 에 연도 포함 날짜 + 대회 + "홈 v 원정"
 *  B. 경기 목록 (페네르-슈투름 UCL 예선 2연전): "DD.MM. 홈 (CC) - 원정 (CC)," 반복, 연도 없음,
 *     대회는 og:description — .1 파서가 이 템플릿을 몰라 전부 dead_letter 가 났던 실사고의 재발 방지선
 * 이 테스트가 깨지면 soccerway 마크업 변경 — shadow 원장의 fetch_error 급증과 함께 파서 개정 신호.
 */

const SINGLE_MATCH_HTML = `
<head>
<title>Bayern Munich v Aston Villa live scores &amp; match info | Soccerway</title>
<meta name="description" content="On 07/08/2026 stay tuned with Club Friendly 2026 for Bayern Munich v Aston Villa live scores, lineups &amp; H2H stats. Follow Soccerway for more soccer stats.">
<link rel="canonical" href="https://www.soccerway.com/match/aston-villa-W00wmLO0/bayern-munich-nVp0wiqd/">
</head>`

const TWO_LEG_HTML = `
<head>
<title>Fenerbahce v Sturm Graz live scores &amp; match info | Soccerway</title>
<meta name="description" content="Stay tuned with 05.08. Fenerbahce (TUR) - Sturm Graz (AUT), 11.08. Sturm Graz (AUT) - Fenerbahce (TUR) live scores, lineups &amp; H2H stats. Follow Soccerway for more soccer stats.">
<meta property="og:description" content="EUROPE: Champions League - Qualification - Semi-finals">
<link rel="canonical" href="https://www.soccerway.com/match/fenerbahce-MsbmracL/sturm-graz-zsktjfsD/">
</head>`

describe("parseMatchPage — 템플릿 A (단일 경기)", () => {
  it("연도 포함 날짜·대회·홈/원정(서술 순서)·canonical 해시", () => {
    const page = parseMatchPage(SINGLE_MATCH_HTML)
    expect(page).not.toBeNull()
    expect(page!.candidates).toHaveLength(1)
    // description 서술이 홈 v 원정 — canonical URL 순서(빌라 먼저)와 다르다는 게 핵심 실측
    expect(page!.candidates[0]).toEqual({
      homeEn: "Bayern Munich",
      awayEn: "Aston Villa",
      dateIso: "2026-08-07",
      month: 8,
      day: 7,
    })
    expect(page!.tournament).toBe("Club Friendly 2026")
    expect(page!.canonicalTeamIds.sort()).toEqual(["W00wmLO0", "nVp0wiqd"].sort())
  })
})

describe("parseMatchPage — 템플릿 B (2연전 목록)", () => {
  it("레그별 홈/원정+날짜(연도 없음), 국가 코드 제거, 대회는 og:description", () => {
    const page = parseMatchPage(TWO_LEG_HTML)
    expect(page).not.toBeNull()
    expect(page!.candidates).toEqual([
      { homeEn: "Fenerbahce", awayEn: "Sturm Graz", dateIso: null, month: 8, day: 5 },
      { homeEn: "Sturm Graz", awayEn: "Fenerbahce", dateIso: null, month: 8, day: 11 },
    ])
    expect(page!.tournament).toBe("EUROPE: Champions League - Qualification - Semi-finals")
    expect(page!.canonicalTeamIds.sort()).toEqual(["MsbmracL", "zsktjfsD"].sort())
  })
})

describe("parseMatchPage — 무효 입력", () => {
  it("title 없는 404 껍데기 → null", () => {
    expect(parseMatchPage("<html><head></head><body>not found</body></html>")).toBeNull()
  })

  it("title 만 있고 description 없음 → null (날짜 없이는 판정 불가)", () => {
    expect(parseMatchPage("<title>A v B live scores | Soccerway</title>")).toBeNull()
  })

  it("description 이 두 템플릿 모두 아니면 → null (새 템플릿 등장 신호)", () => {
    expect(
      parseMatchPage(
        '<title>A v B live scores | Soccerway</title><meta name="description" content="Some new wording here.">'
      )
    ).toBeNull()
  })
})

describe("buildMatchUrl / extractTeamIdsFromMatchUrl", () => {
  it("slug-해시로 URL 구성 (순서는 soccerway 가 canonical 로 접으므로 무관)", () => {
    const url = buildMatchUrl(
      { slug: "aston-villa", soccerwayTeamId: "W00wmLO0" },
      { slug: "bayern-munich", soccerwayTeamId: "nVp0wiqd" }
    )
    expect(url).toBe("https://www.soccerway.com/match/aston-villa-W00wmLO0/bayern-munich-nVp0wiqd/")
    expect(extractTeamIdsFromMatchUrl(url)).toEqual(["W00wmLO0", "nVp0wiqd"])
  })

  it("슬러그에 하이픈이 여러 개여도 마지막 8자 해시만 뽑는다", () => {
    expect(
      extractTeamIdsFromMatchUrl(
        "https://www.soccerway.com/match/royale-union-sg-407h8Ird/h-beer-sheva-EXAD1YZP/"
      )
    ).toEqual(["407h8Ird", "EXAD1YZP"])
  })
})
