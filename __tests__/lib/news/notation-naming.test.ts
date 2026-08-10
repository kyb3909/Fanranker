import { describe, it, expect } from "vitest"
import { buildNamingPairs, applyNamingPairs, applyNamingPairsToTipTap } from "@/lib/news/notation"

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

/**
 * 2026-08-09 운영자 결정 "네이버 우선" — 치환 대상이 인물뿐이었던 탓에 구단명이
 * 기사마다 흔들렸다. 실측: 아스날 36건 vs 아스널 10건(사전·네이버 모두 '아스널').
 * 같은 팀이 기사마다 다른 이름으로 나오면 독자는 매체로 안 본다.
 */
describe("구단명 치환 (네이버 우선 정책)", () => {
  const TEAMS = [
    { preferred_ko: "아스널", hangul_alts: ["아스날"] },
    { preferred_ko: "토트넘", hangul_alts: ["토트넘 홋스퍼"] },
    { preferred_ko: "크리스털 팰리스", hangul_alts: ["크리스탈 팰리스"] },
  ]

  it("흔들린 구단 표기를 대표 표기로 모은다", () => {
    const pairs = buildNamingPairs(TEAMS)
    expect(applyNamingPairs("아스날이 크리스탈 팰리스를 꺾었다", pairs)).toBe(
      "아스널이 크리스털 팰리스를 꺾었다"
    )
  })

  it("⚠️ 더 긴 정식명은 본문에서 줄이지 않는다 — 인용문을 건드리기 때문", () => {
    const pairs = buildNamingPairs(TEAMS)
    // 실측: CEO 발언 "'뉴캐슬 유나이티드 2.0'" 이 "'뉴캐슬 2.0'" 으로 바뀌었다.
    // 길이 통일은 위치가 고정된 제목 라벨의 몫이다 (source label).
    expect(applyNamingPairs("토트넘 홋스퍼, 토날리 영입", pairs)).toBe("토트넘 홋스퍼, 토날리 영입")
  })

  it("⚠️ 한글 없는 alt 는 치환 쌍이 되지 않는다 — 본문의 'Goal' 이 '골닷컴'이 되면 안 된다", () => {
    const pairs = buildNamingPairs([{ preferred_ko: "골닷컴", hangul_alts: ["Goal"] }])
    expect(pairs).toEqual([])
    expect(applyNamingPairs("Goal of the season", pairs)).toBe("Goal of the season")
  })
})

/**
 * 2026-08-10 실사고 — 성씨 별칭이 다른 사람 이름을 오염시켰다.
 * 네이버 시드가 shortName 을 별칭으로 넣은 탓에 '제임스'→'다니엘 제임스' 치환이 생겼고,
 * 골키퍼 **제임스 트래포드**가 '다니엘 제임스 트래포드'가 될 뻔했다(리즈 윙어와 섞임).
 * 성씨는 여러 사람이 공유하므로 길이 변형은 어느 방향이든 치환하지 않는다.
 */
describe("길이 변형 치환 금지 (양방향)", () => {
  it("⚠️ 성씨 별칭이 다른 사람 이름을 건드리지 않는다", () => {
    const pairs = buildNamingPairs([
      { preferred_ko: "다니엘 제임스", hangul_alts: ["제임스"] },
      { preferred_ko: "벤자민 노벨 멘디", hangul_alts: ["멘디"] },
    ])
    expect(pairs).toEqual([])
    expect(applyNamingPairs("제임스 트래포드, 리즈 이적", pairs)).toBe("제임스 트래포드, 리즈 이적")
    expect(applyNamingPairs("벤자민 멘디 비판", pairs)).toBe("벤자민 멘디 비판")
  })

  it("더 긴 정식명도 여전히 치환하지 않는다 (회귀)", () => {
    const pairs = buildNamingPairs([{ preferred_ko: "뉴캐슬", hangul_alts: ["뉴캐슬 유나이티드"] }])
    expect(pairs).toEqual([])
  })

  it("철자가 다른 진짜 오표기는 그대로 교정된다 (회귀)", () => {
    const pairs = buildNamingPairs([
      { preferred_ko: "코디 각포", hangul_alts: ["코디 갓포", "갓포"] },
      { preferred_ko: "캐릭", hangul_alts: ["카릭"] },
    ])
    expect(applyNamingPairs("코디 갓포와 카릭", pairs)).toBe("코디 각포와 캐릭")
  })
})
