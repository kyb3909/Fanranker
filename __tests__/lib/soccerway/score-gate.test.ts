import { describe, it, expect } from "vitest"
import { wrongScore } from "@/lib/soccerway/score-gate"

const rep = (title: string) => ({ title, paragraphs: ["본문"] })

/**
 * 이 게이트는 두 번의 실사고에서 나왔다.
 *  1차 — 풀럼 2-3 첼시를 3회 생성했더니 "3-2 첼시 승" / "3-2" / **"3-3 무승부"** 로 갈렸다.
 *  2차 — 오사수나 0-0 레반테에 **"3-0 승리…멀티골 활약"** 이 저장됐다. 득점 장면 셋이
 *        전부 지어낸 것이었고, 같은 사이트 MoTM 투표판은 0-0 이라고 적고 있었다.
 *
 * ⚠️ 2차 때 게이트는 **이미 배포돼 있었다.** 그런데 스코어를 넘겨주는 배선이 끊겨
 *    `finalScore` 가 늘 null 이었고, 게이트는 한 번도 돌지 않았다. 그래서 이 테스트는
 *    게이트 로직만 지킨다 — 배선은 lineup-lookup 의 타입이 지킨다.
 */
describe("wrongScore", () => {
  it("⭐승패가 뒤집히는 조합을 막는다 (1차 실사고)", () => {
    expect(wrongScore(rep("풀럼, 첼시와 3-3 무승부"), "2-3")).toContain("3-3")
  })

  it("⭐없는 골을 지어낸 제목을 막는다 (2차 실사고)", () => {
    expect(wrongScore(rep("오사수나, 레반테에 3-0 승리…멀티골"), "0-0")).toContain("3-0")
  })

  it("원정팀 기준 뒤집힘은 허용한다 — 승패가 같으므로 사실 오류가 아니다", () => {
    expect(wrongScore(rep("풀럼, 첼시에 3-2 패배"), "2-3")).toBeNull()
    expect(wrongScore(rep("릴OSC, 앙제SCO 원정 2-0 승리"), "0-2")).toBeNull()
  })

  it("스코어가 안 적힌 제목은 통과", () => {
    expect(wrongScore(rep("수적 열세 극복한 아틀레티코, 비야레알과 무승부"), "2-2")).toBeNull()
  })

  it("⚠️본문은 안 본다 — '전반은 1-1이었다'는 사실이라 막으면 오히려 정상 리포트가 죽는다", () => {
    const r = { title: "첼시 3-2 승", paragraphs: ["전반은 1-1 이었다"] }
    expect(wrongScore(r, "3-2")).toBeNull()
  })

  it("확정 스코어 형식이 깨졌으면 판단하지 않는다", () => {
    expect(wrongScore(rep("3-0 승리"), "?")).toBeNull()
  })
})
