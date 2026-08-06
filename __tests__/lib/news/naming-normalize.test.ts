import { describe, it, expect } from "vitest"
import {
  buildNamingPairs,
  applyNamingPairs,
  applyNamingPairsToTipTap,
} from "@/lib/news/naming-normalize"

/**
 * 발행 시점 선수 표기 전방 교정 — '코디 갓포' 실사고(2026-08-07)의 재발 방지선.
 * 사전에 갓포→코디 각포가 등재돼 있었는데도 옛 표기 그대로 발행된 구멍을 막는다.
 */

const DICT = [
  { preferred_ko: "코디 각포", hangul_alts: ["코디 갓포", "갓포"] },
  { preferred_ko: "각포", hangul_alts: ["가크포"] },
  { preferred_ko: "손흥민", hangul_alts: ["손"] }, // 1자 alt — 오폭 방지로 제외돼야 함
  { preferred_ko: "비니시우스 주니오르", hangul_alts: ["비니시우스 주니어"] },
]

describe("buildNamingPairs", () => {
  it("긴 표기 우선 정렬 — '코디 갓포'가 '갓포'보다 먼저", () => {
    const pairs = buildNamingPairs(DICT)
    const froms = pairs.map(([f]) => f)
    expect(froms.indexOf("코디 갓포")).toBeLessThan(froms.indexOf("갓포"))
  })

  it("2자 미만 alt 는 제외 (일반 단어 오폭 방지)", () => {
    const pairs = buildNamingPairs(DICT)
    expect(pairs.find(([f]) => f === "손")).toBeUndefined()
  })

  it("다른 항목의 대표 표기와 같은 alt 는 제외", () => {
    const pairs = buildNamingPairs([
      { preferred_ko: "각포", hangul_alts: [] },
      // '각포'를 alt 로 주장하는 항목 — 이미 대표 표기인 이름은 치환 금지
      { preferred_ko: "코디 각포", hangul_alts: ["각포"] },
    ])
    expect(pairs.find(([f]) => f === "각포")).toBeUndefined()
  })
})

describe("applyNamingPairs — 실사고 재현", () => {
  const pairs = buildNamingPairs(DICT)

  it("'코디 갓포'는 이중 치환 없이 '코디 각포'가 된다", () => {
    expect(applyNamingPairs("토트넘, 리버풀 공격수 코디 갓포 영입 관심", pairs)).toBe(
      "토트넘, 리버풀 공격수 코디 각포 영입 관심"
    )
  })

  it("성 단독 '갓포'도 대표 표기로", () => {
    expect(applyNamingPairs("갓포는 이번 시즌", pairs)).toBe("코디 각포는 이번 시즌")
  })

  it("음차 변형(가크포·주니어)도 잡는다", () => {
    expect(applyNamingPairs("가크포와 비니시우스 주니어", pairs)).toBe("각포와 비니시우스 주니오르")
  })

  it("정표기는 건드리지 않는다", () => {
    const text = "코디 각포가 두 골을 넣었다"
    expect(applyNamingPairs(text, pairs)).toBe(text)
  })
})

describe("applyNamingPairsToTipTap", () => {
  it("text 노드만 치환, 구조·attrs(URL 등)는 보존", () => {
    const pairs = buildNamingPairs(DICT)
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "코디 갓포 영입설" }],
        },
        { type: "image", attrs: { src: "https://x.com/갓포.jpg" } },
      ],
    }
    const out = applyNamingPairsToTipTap(doc, pairs) as typeof doc
    expect(out.content[0].content?.[0].text).toBe("코디 각포 영입설")
    expect(out.content[1].attrs?.src).toBe("https://x.com/갓포.jpg")
  })
})
