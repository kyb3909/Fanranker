import { describe, expect, it } from "vitest"
import {
  buildSourceLabelMap,
  normalizeSourceLabel,
  sourceKey,
  type SourceLabelRow,
} from "@/lib/news/source-label"

/**
 * 계약: 제목 대괄호 라벨만 대표 표기로 통일한다. 사전에 없으면 손대지 않고,
 * 짧은 약어는 아예 키로 만들지 않는다 (엉뚱한 치환 > 놓침).
 */

// 실제 사전 행과 같은 모양 (surfaces=도메인, romanized=도메인 또는 인물명)
const ROWS: SourceLabelRow[] = [
  {
    preferred_ko: "디 애슬레틱",
    romanized: "theathletic.com",
    surfaces: ["theathletic.com"],
    hangul_alts: null,
  },
  {
    preferred_ko: "스카이 스포츠",
    romanized: "skysports.com",
    surfaces: ["skysports.com", "sky sports news"],
    hangul_alts: null,
  },
  { preferred_ko: "가디언", romanized: "theguardian.com", surfaces: null, hangul_alts: null },
  { preferred_ko: "골닷컴", romanized: "goal.com", surfaces: ["goal.com"], hangul_alts: null },
  { preferred_ko: "BBC", romanized: "bbc.co.uk", surfaces: ["bbc.co.uk"], hangul_alts: null },
  {
    preferred_ko: "바르셀로나",
    romanized: "FC Barcelona",
    surfaces: ["fc barcelona", "barcelona", "barca"],
    hangul_alts: null,
  },
  { preferred_ko: "온스테인", romanized: "Ornstein", surfaces: ["ornstein"], hangul_alts: null },
  // 짧은 약어가 붙은 항목 — 키가 만들어지면 안 된다
  {
    preferred_ko: "아스널",
    romanized: "Arsenal FC",
    surfaces: ["arsenal", "afc"],
    hangul_alts: null,
  },
]

const MAP = buildSourceLabelMap(ROWS)

describe("normalizeSourceLabel", () => {
  it("영문 매체 라벨을 사전의 한글 대표 표기로 바꾼다", () => {
    expect(normalizeSourceLabel("[The Athletic] 아스널, 이적 합의", MAP)).toBe(
      "[디 애슬레틱] 아스널, 이적 합의"
    )
    expect(normalizeSourceLabel("[Sky Sports] 첼시 소식", MAP)).toBe("[스카이 스포츠] 첼시 소식")
    expect(normalizeSourceLabel("[The Guardian] 리버풀", MAP)).toBe("[가디언] 리버풀")
  })

  it("구단 공식 발표 라벨도 통일한다 (FC Barcelona ↔ FC 바르셀로나 혼용 실사고)", () => {
    expect(normalizeSourceLabel("[FC Barcelona] 공식 발표", MAP)).toBe("[바르셀로나] 공식 발표")
  })

  it("이미 대표 표기면 그대로 둔다 (불필요한 갱신 방지)", () => {
    const t = "[디 애슬레틱] 그대로"
    expect(normalizeSourceLabel(t, MAP)).toBe(t)
    expect(normalizeSourceLabel("[BBC] 그대로", MAP)).toBe("[BBC] 그대로")
  })

  it("사전에 없는 출처는 손대지 않는다 (모르면 두는 것이 fail-safe)", () => {
    expect(normalizeSourceLabel("[KSTA] 쾰른 소식", MAP)).toBe("[KSTA] 쾰른 소식")
    expect(normalizeSourceLabel("[샬케04] 공식", MAP)).toBe("[샬케04] 공식")
  })

  it("대괄호가 없으면 아무것도 하지 않는다", () => {
    expect(normalizeSourceLabel("아스널, 이적 합의", MAP)).toBe("아스널, 이적 합의")
  })

  it("대괄호는 맨 앞의 것만 본다 — 본문성 대괄호는 건드리지 않는다", () => {
    const t = "아스널 [The Athletic] 인용"
    expect(normalizeSourceLabel(t, MAP)).toBe(t)
  })

  it("⚠️ 3자 이하 약어는 키가 되지 않는다 — [AFC]가 아스널로 둔갑하면 안 된다", () => {
    expect(MAP.has("afc")).toBe(false)
    expect(normalizeSourceLabel("[AFC] 무언가", MAP)).toBe("[AFC] 무언가")
  })

  it("기자명도 같은 규칙으로 통일된다", () => {
    expect(normalizeSourceLabel("[Ornstein] 단독", MAP)).toBe("[온스테인] 단독")
  })
})

describe("sourceKey / buildSourceLabelMap", () => {
  it("대소문자·공백·구두점을 접어 같은 매체로 본다", () => {
    expect(sourceKey("The Athletic")).toBe(sourceKey("theathletic"))
    expect(sourceKey("Sky Sports")).toBe(sourceKey("SKYSPORTS"))
  })

  it("도메인에서 TLD를 떼어 몸통 키를 만든다 (theathletic.com → theathletic)", () => {
    expect(MAP.get("theathletic")).toBe("디 애슬레틱")
    expect(MAP.get("skysports")).toBe("스카이 스포츠")
    expect(MAP.get("goal")).toBe("골닷컴")
  })

  it("서로 다른 항목이 같은 키를 주장하면 먼저 온 항목이 이긴다", () => {
    const dup = buildSourceLabelMap([
      { preferred_ko: "먼저", romanized: null, surfaces: ["samename"], hangul_alts: null },
      { preferred_ko: "나중", romanized: null, surfaces: ["samename"], hangul_alts: null },
    ])
    expect(dup.get("samename")).toBe("먼저")
  })
})
