import { describe, expect, it } from "vitest"
import { findAliasPoisoning, type NotationEntry } from "@/lib/news/notation"

/**
 * 사전 오염 탐지 — alt 가 '오표기'가 아니라 **다른 사람**인 경우.
 *
 * 2026-08-11 운영자가 발행 기사에서 "레온"을 발견했다(정: 하파엘 레앙). 파이프라인이
 * 못 고친 게 아니라 **사전이 레앙을 레온으로 바꾸고 있었다**:
 *   `preferred_ko: "레온"(D.Leon) / hangul_alts: ["라파엘 레앙"]`
 * 이름만으로 네이버를 세던 시절(레온 45,133 vs 레앙 5,209)의 화석이다.
 *
 * 아래 표본은 전부 **실제 사전에서 나온 값**이다. 오염 5건은 그날 걷어냈고,
 * 정상 12건은 그대로 두기로 확인한 음차 변형이다. 임계값을 만질 때 이 표를 먼저 돌려라 —
 * 세 번 헛짚고 나서야 갈리는 규칙을 찾았다.
 */

function entry(id: string, preferred: string, alts: string[] = []): NotationEntry {
  return {
    id,
    category: "player",
    preferred_ko: preferred,
    romanized: "",
    surfaces: [],
    hangul_alts: alts,
  }
}

describe("findAliasPoisoning — 오염(다른 사람)만 잡고 음차 변형은 통과", () => {
  it("레앙 사고를 재현해 잡는다 — 진짜 주인이 사전에 있으면 탐지된다", () => {
    const dict = [
      entry("player_fpl_p239", "레온", ["라파엘 레앙"]), // 오염된 행
      entry("player_leao_r", "하파엘 레앙"), // 진짜 주인
    ]
    const found = findAliasPoisoning(dict)
    expect(found).toHaveLength(1)
    expect(found[0].entryId).toBe("player_fpl_p239")
    expect(found[0].alt).toBe("라파엘 레앙")
    expect(found[0].reason).toContain("하파엘 레앙")
  })

  it("감독을 선수 항목이 흡수한 경우도 잡는다", () => {
    const dict = [
      entry("player_fpl_p391", "엔소", ["엔조 마레스카"]),
      entry("coach_maresca", "엔조 마레스카"),
    ]
    expect(findAliasPoisoning(dict)).toHaveLength(1)
  })

  it("음차 변형은 잡지 않는다 — 무리뉴 계열이 오탐이면 감시가 무시당한다", () => {
    // 실측: '조세 무리뉴'는 성씨 단독 항목 '무리뉴'와 0.714 로, 임계 0.8 미만이다
    const dict = [
      entry("coach_mourinho_j", "주제 무리뉴", ["조세 무리뉴", "호세 무리뉴", "조세 모리냐"]),
      entry("coach_mourinho_surname", "무리뉴"),
      entry("coach_carrick", "캐릭", ["카릭"]),
      entry("player_gakpo", "각포", ["가크포"]),
      entry("player_dubravka", "두브라프카", ["두브라브카"]),
      entry("player_savinho", "사비뉴", ["사빈호"]),
    ]
    expect(findAliasPoisoning(dict)).toEqual([])
  })

  it("길이 변형은 다툼이 아니다 — 성↔풀네임은 통과", () => {
    const dict = [
      entry("player_leao_r", "하파엘 레앙", ["레앙"]),
      entry("media_plettenberg", "플레텐베르크", ["플로리안 플레텐베르크"]),
    ]
    expect(findAliasPoisoning(dict)).toEqual([])
  })

  it("진짜 주인이 사전에 없으면 침묵한다 — 좁지만 오탐 없는 그물", () => {
    // '데코'(바르사 디렉터)는 미등재라 잡히지 않는다. 알려진 한계다.
    const dict = [entry("player_fpl_p478", "안드레아스", ["데코"])]
    expect(findAliasPoisoning(dict)).toEqual([])
  })

  it("자기 항목을 더 닮은 alt 는 통과 — 더 닮은 '남'이 있어야 오염이다", () => {
    const dict = [
      entry("a", "빅토르 무뇨스", ["빅터 무뇨즈"]),
      entry("b", "빅토르 무뇨스 주니어"), // 비슷하지만 자기 항목이 더 가깝다
    ]
    expect(findAliasPoisoning(dict)).toEqual([])
  })

  it("alts 가 비어도 안전하다", () => {
    expect(findAliasPoisoning([entry("a", "손흥민"), entry("b", "이강인", [])])).toEqual([])
  })
})
