import { describe, it, expect } from "vitest"
import { buildAliasIndex, canonicalizePlayer, type AliasRow } from "@/lib/saga/canonical"

/**
 * 성씨 승격 — "선수 모든 이름은 선수 사전 등록 이름 기준" (2026-08-30 운영자).
 *
 * 실사고: 사전에 'Gakpo'(성씨-only)와 'Cody Gakpo'(풀네임)가 공존하자, 성씨-only
 * 항목이 exact 히트를 먹고 bySurname 을 자기 자신과의 충돌로 오염시켜, "gakpo"
 * 보도가 cody-gakpo 사가에 못 합류하고 동성이인 보호에 걸렸다.
 */

const GAKPO: AliasRow[] = [
  { romanized: "Gakpo", preferred_ko: "각포", surfaces: ["gakpo"] },
  { romanized: "Cody Gakpo", preferred_ko: "코디 각포", surfaces: ["cody gakpo", "코디 각포"] },
]

describe("canonicalizePlayer — 성씨 승격", () => {
  it("성씨-only 히트는 그 성의 풀네임이 유일하면 풀네임으로 승격한다", () => {
    const index = buildAliasIndex(GAKPO)
    const c = canonicalizePlayer("Gakpo", index)
    expect(c).toEqual({ key: "cody-gakpo", ko: "코디 각포", matched: true })
  })

  it("풀네임 히트는 그대로 — 승격 대상이 아니다", () => {
    const index = buildAliasIndex(GAKPO)
    const c = canonicalizePlayer("Cody Gakpo", index)
    expect(c).toEqual({ key: "cody-gakpo", ko: "코디 각포", matched: true })
  })

  it("동성이인(풀네임 2명)이면 승격하지 않는다 — 성씨-only 항목 그대로", () => {
    const index = buildAliasIndex([
      { romanized: "Diomande", preferred_ko: "디오망데", surfaces: [] },
      { romanized: "Yan Diomande", preferred_ko: "얀 디오망데", surfaces: [] },
      { romanized: "Ousmane Diomande", preferred_ko: "우스만 디오망데", surfaces: [] },
    ])
    const c = canonicalizePlayer("diomande", index)
    // 승격 없음 — create.ts 의 동성이인 게이트(클럽 맥락)가 판정한다
    expect(c).toEqual({ key: "diomande", ko: "디오망데", matched: true })
  })

  it("성씨-only 항목만 있고 풀네임이 없으면 그대로 쓴다", () => {
    const index = buildAliasIndex([{ romanized: "Gakpo", preferred_ko: "각포", surfaces: [] }])
    const c = canonicalizePlayer("gakpo", index)
    expect(c).toEqual({ key: "gakpo", ko: "각포", matched: true })
  })

  it("종전 성(姓) 폴백 유지 — 사전 미등재 성씨 입력도 풀네임이 유일하면 병합", () => {
    const index = buildAliasIndex([
      { romanized: "Jordan Henderson", preferred_ko: "조던 헨더슨", surfaces: [] },
    ])
    const c = canonicalizePlayer("Henderson", index)
    expect(c).toEqual({ key: "jordan-henderson", ko: "조던 헨더슨", matched: true })
  })

  it("사전에 아예 없는 이름은 미매칭으로 그대로 돌려준다", () => {
    const index = buildAliasIndex(GAKPO)
    const c = canonicalizePlayer("Totally Unknown", index)
    expect(c).toEqual({ key: "totally-unknown", ko: null, matched: false })
  })
})
