import { describe, it, expect } from "vitest"
import {
  resolveTeam,
  judgeMatchPage,
  mappingInputHash,
  kickoffUtcDate,
  type TeamDictionaryRow,
} from "@/lib/soccerway/match-mapping"

/**
 * 매핑 술어 — 동일성 판정 규칙을 잠근다 (실록 단계 2).
 * 핵심 계약: fail-closed (모호하면 proposed 가 아니라 ambiguous),
 * 홈/원정 스왑은 자동 수정하지 않고 flip 신호만 남긴다 (I-3b).
 */

const villa: TeamDictionaryRow = {
  soccerway_team_id: "W00wmLO0",
  slug: "aston-villa",
  name_en: "Aston Villa",
  name_kr: "애스턴 빌라",
  aliases_kr: ["아스톤 빌라"],
  status: "proposed",
}
const bayern: TeamDictionaryRow = {
  soccerway_team_id: "nVp0wiqd",
  slug: "bayern-munich",
  name_en: "Bayern Munich",
  name_kr: "바이에른 뮌헨",
  aliases_kr: ["바이에른"],
  status: "proposed",
}
const dictionary = [villa, bayern]

const page = {
  candidates: [
    {
      homeEn: "Bayern Munich",
      awayEn: "Aston Villa",
      dateIso: "2026-08-07",
      month: 8,
      day: 7,
    },
  ],
  tournament: "Club Friendly 2026",
  canonicalUrl: "https://www.soccerway.com/match/aston-villa-W00wmLO0/bayern-munich-nVp0wiqd/",
  canonicalTeamIds: ["W00wmLO0", "nVp0wiqd"],
}

describe("resolveTeam", () => {
  it("대표 표기·alias 정확 일치만 (퍼지 금지)", () => {
    expect(resolveTeam("애스턴 빌라", dictionary)).toBe(villa)
    expect(resolveTeam("아스톤 빌라", dictionary)).toBe(villa)
    expect(resolveTeam(" 바이에른 ", dictionary)).toBe(bayern)
    expect(resolveTeam("빌라", dictionary)).toBeNull()
    expect(resolveTeam("", dictionary)).toBeNull()
  })

  it("rejected 행은 해석에서 제외", () => {
    const rejected = [{ ...villa, status: "rejected" }]
    expect(resolveTeam("애스턴 빌라", rejected)).toBeNull()
  })
})

describe("judgeMatchPage", () => {
  const game = { match_time: "2026-08-07T18:30:00Z" }

  it("팀 집합 일치 + 날짜 일치 → proposed. betman 홈=빌라인데 페이지 홈=뮌헨 → flip=true", () => {
    const v = judgeMatchPage(game, villa, bayern, page)
    expect(v.outcome).toBe("proposed")
    expect(v.homeAwayFlip).toBe(true)
  })

  it("betman 홈/원정이 페이지와 같으면 flip=false", () => {
    const v = judgeMatchPage(game, bayern, villa, page)
    expect(v.outcome).toBe("proposed")
    expect(v.homeAwayFlip).toBe(false)
  })

  it("킥오프가 KST 자정 넘어 다음날(UTC 기준 ±1일)이어도 허용", () => {
    // 유럽 저녁 경기 = KST 다음날 새벽 — 날짜 1일 차이는 같은 경기
    const v = judgeMatchPage({ match_time: "2026-08-08T03:30:00+09:00" }, villa, bayern, page)
    expect(v.outcome).toBe("proposed")
  })

  it("날짜가 2일 이상 어긋나면 ambiguous (같은 쌍의 다른 경기 — fail-closed)", () => {
    const v = judgeMatchPage({ match_time: "2026-08-10T18:30:00Z" }, villa, bayern, page)
    expect(v.outcome).toBe("ambiguous")
    expect(v.reason).toContain("날짜 불일치")
  })

  it("canonical 해시가 해석 팀과 다르면 ambiguous (리다이렉트가 딴 곳으로 감)", () => {
    const v = judgeMatchPage(game, villa, bayern, {
      ...page,
      canonicalTeamIds: ["W00wmLO0", "XXXXXXXX"],
    })
    expect(v.outcome).toBe("ambiguous")
    expect(v.reason).toContain("canonical 팀 불일치")
  })

  it("페이지 표시명이 사전 name_en 과 다르면 flip=null (판정 보류 — 검수에서 사람이 확인)", () => {
    const v = judgeMatchPage(game, villa, bayern, {
      ...page,
      candidates: [{ ...page.candidates[0], homeEn: "FC Bayern München" }],
    })
    expect(v.outcome).toBe("proposed")
    expect(v.homeAwayFlip).toBeNull()
  })

  describe("2연전 목록 템플릿 (연도 추론)", () => {
    const fener: TeamDictionaryRow = {
      soccerway_team_id: "MsbmracL",
      slug: "fenerbahce",
      name_en: "Fenerbahce",
      name_kr: "페네르바흐체SK",
      aliases_kr: ["페네르바흐체"],
      status: "proposed",
    }
    const sturm: TeamDictionaryRow = {
      soccerway_team_id: "zsktjfsD",
      slug: "sturm-graz",
      name_en: "Sturm Graz",
      name_kr: "슈투름 그라츠",
      aliases_kr: [],
      status: "proposed",
    }
    const twoLegPage = {
      candidates: [
        { homeEn: "Fenerbahce", awayEn: "Sturm Graz", dateIso: null, month: 8, day: 5 },
        { homeEn: "Sturm Graz", awayEn: "Fenerbahce", dateIso: null, month: 8, day: 11 },
      ],
      tournament: "EUROPE: Champions League - Qualification - Semi-finals",
      canonicalUrl: "https://www.soccerway.com/match/fenerbahce-MsbmracL/sturm-graz-zsktjfsD/",
      canonicalTeamIds: ["MsbmracL", "zsktjfsD"],
    }

    it("2차전 킥오프 → 2차전 레그로 확정, 레그 순서(슈투름 홈)로 flip 판정", () => {
      // betman 홈=슈투름이면 flip=false
      const v = judgeMatchPage(
        { match_time: "2026-08-12T04:00:00+09:00" }, // KST 새벽 = UTC 8/11 저녁
        sturm,
        fener,
        twoLegPage
      )
      expect(v.outcome).toBe("proposed")
      expect(v.matched?.dateIso).toBe("2026-08-11")
      expect(v.homeAwayFlip).toBe(false)
    })

    it("1차전 킥오프인데 betman 홈이 원정팀이면 flip=true", () => {
      const v = judgeMatchPage({ match_time: "2026-08-05T19:00:00Z" }, sturm, fener, twoLegPage)
      expect(v.outcome).toBe("proposed")
      expect(v.matched?.dateIso).toBe("2026-08-05")
      expect(v.homeAwayFlip).toBe(true)
    })

    it("어느 레그와도 ±1일이 아니면 ambiguous", () => {
      const v = judgeMatchPage({ match_time: "2026-08-20T19:00:00Z" }, fener, sturm, twoLegPage)
      expect(v.outcome).toBe("ambiguous")
      expect(v.reason).toContain("날짜 불일치")
    })

    it("연말 경계: 12월 킥오프에 01.01. 후보는 다음 해로 해석된다", () => {
      const winterPage = {
        ...twoLegPage,
        candidates: [
          { homeEn: "Fenerbahce", awayEn: "Sturm Graz", dateIso: null, month: 1, day: 1 },
        ],
      }
      const v = judgeMatchPage({ match_time: "2026-12-31T20:00:00Z" }, fener, sturm, winterPage)
      expect(v.outcome).toBe("proposed")
      expect(v.matched?.dateIso).toBe("2027-01-01")
    })
  })
})

describe("mappingInputHash", () => {
  const game = {
    home_team_name: "애스턴 빌라",
    away_team_name: "바이에른 뮌헨",
    match_time: "2026-08-07T18:30:00Z",
  }

  it("사전 등재로 해석 결과가 바뀌면 해시도 바뀐다 (재평가 문이 열림)", () => {
    const before = mappingInputHash(game, null, null)
    const after = mappingInputHash(game, "W00wmLO0", "nVp0wiqd")
    expect(before).not.toBe(after)
    // 같은 입력은 항상 같은 해시 (멱등 키)
    expect(mappingInputHash(game, "W00wmLO0", "nVp0wiqd")).toBe(after)
  })
})

describe("kickoffUtcDate", () => {
  it("timestamptz → UTC 날짜", () => {
    expect(kickoffUtcDate("2026-08-08T03:30:00+09:00")).toBe("2026-08-07")
    expect(kickoffUtcDate("2026-08-07T18:30:00Z")).toBe("2026-08-07")
  })
})
