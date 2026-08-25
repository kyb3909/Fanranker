import { describe, it, expect } from "vitest"
import { wrongScore } from "@/lib/soccerway/score-gate"

/**
 * 스코어 게이트 (2026-08-25 실사고).
 *
 * 같은 경기(풀럼 2-3 첼시)를 3회 생성했더니 제목이
 *   "3-2 첼시 승" / "3-2 첼시 승" / **"3-3 무승부"** 로 갈렸다.
 * 세 번째는 **승패 자체가 틀린 리포트**인데 검증을 통과했다 — 숫자 게이트가 개별
 * 숫자("3"이 근거에 있나)만 보고 **조합**은 안 봤기 때문이다.
 *
 * 그래서 LLM 판단 이전에 결정론으로 막는다. 이 테스트가 그 폭을 지킨다.
 */

const rep = (title: string, ...paragraphs: string[]) => ({ title, paragraphs })

describe("wrongScore", () => {
  it("⭐승패가 뒤집히는 조합을 잡는다 (실사고: 2-3 인데 3-3)", () => {
    const r = rep("수적 동률 속 난타전, 풀럼 홈에서 첼시와 3-3 무승부")
    expect(wrongScore(r, "2-3")).toContain("스코어 불일치")
  })

  it("확정 스코어와 같으면 통과", () => {
    expect(wrongScore(rep("풀럼 2-3 첼시"), "2-3")).toBeNull()
  })

  it("원정팀 기준으로 뒤집어 쓴 것은 허용한다 — 승패가 같다", () => {
    // 기사가 "첼시 3-2 승리" 처럼 쓰는 건 흔하고, 사실 오류가 아니다
    expect(wrongScore(rep("첼시, 풀럼 원정서 3-2 승리"), "2-3")).toBeNull()
  })

  it("🚫 본문의 중간 스코어는 건드리지 않는다 — 사실이라 막으면 오탐", () => {
    // "전반은 1-1 이었다" 는 참일 수 있다. 독자가 승패를 읽는 자리는 제목이므로 좁게 막는다.
    const r = rep("첼시, 풀럼 원정서 3-2 승리", "전반은 1-1 이었다.")
    expect(wrongScore(r, "2-3")).toBeNull()
  })

  it("제목의 틀린 스코어는 잡는다", () => {
    expect(wrongScore(rep("풀럼 4-2 첼시"), "2-3")).toContain("4-2")
  })

  it("콜론 표기(2:3)도 같은 것으로 본다", () => {
    expect(wrongScore(rep("풀럼 2:3 첼시"), "2-3")).toBeNull()
  })

  it("스코어가 아예 없으면 통과 (모든 리포트가 스코어를 쓰진 않는다)", () => {
    expect(wrongScore(rep("치열했던 한 판", "양 팀 모두 최선을 다했다."), "2-3")).toBeNull()
  })

  it("🚫 분 표기는 스코어로 오인하지 않는다", () => {
    // "전반 41분", "99분 페널티킥" 같은 건 하이픈으로 이어지지 않는다
    expect(wrongScore(rep("소보슬라이 전반 41분 극장골"), "2-2")).toBeNull()
  })

  it("확정 스코어 형식이 깨졌으면 판단하지 않는다", () => {
    expect(wrongScore(rep("풀럼 9-9 첼시"), "unknown")).toBeNull()
  })
})
