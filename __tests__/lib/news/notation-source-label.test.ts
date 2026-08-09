import { describe, expect, it } from "vitest"
import {
  buildSourceLabelMap,
  normalizeSourceLabel,
  sourceKey,
  type NotationEntry,
} from "@/lib/news/notation"

/**
 * 계약: 제목 대괄호 라벨만 대표 표기로 통일한다. 사전에 없으면 손대지 않고,
 * 짧은 약어는 아예 키로 만들지 않는다 (엉뚱한 치환 > 놓침).
 */

// 실제 사전 행과 같은 모양 (surfaces=도메인, romanized=도메인 또는 인물명)
const ROWS: Pick<NotationEntry, "preferred_ko" | "romanized" | "surfaces" | "hangul_alts">[] = [
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

/**
 * 2026-08-09: 스캐너가 레딧 원제의 대괄호를 그대로 옮겨 `[Tom Garry]` `[Mokbel]`
 * 같은 기자 성씨 영문이 제목에 나갔다. 독자에게 의미가 없고, `[Mokbel]` 의
 * source_url 은 bbc.com 이라 다른 기사의 `[BBC]` 와 같은 매체인데 이름이 갈렸다.
 * 도메인은 LLM 이 지어낼 수 없는 사실이므로 모르는 라벨보다 언제나 낫다.
 */
describe("normalizeSourceLabel — 원문 도메인 폴백", () => {
  it("사전에 없는 기자 성씨 영문은 도메인의 매체명으로 바꾼다", () => {
    expect(
      normalizeSourceLabel(
        "[Tom Garry] 맨시티 소식",
        MAP,
        "https://www.theguardian.com/football/2026/aug/06/x"
      )
    ).toBe("[가디언] 맨시티 소식")
  })

  it("⚠️ 사전에 있는 기자명은 보존한다 — 매체명보다 정보가 많고 운영자가 인정한 것", () => {
    const t = "[온스테인] 단독"
    expect(normalizeSourceLabel(t, MAP, "https://www.theguardian.com/x")).toBe(t)
  })

  it("도메인도 모르면 손대지 않는다 (모르면 두는 것이 fail-safe)", () => {
    const t = "[KSTA] 쾰른 소식"
    expect(normalizeSourceLabel(t, MAP, "https://www.ksta.de/x")).toBe(t)
    expect(normalizeSourceLabel(t, MAP, null)).toBe(t)
  })

  it("깨진 URL 이어도 죽지 않는다", () => {
    const t = "[Tom Garry] 소식"
    expect(normalizeSourceLabel(t, MAP, "not-a-url")).toBe(t)
  })

  it("라벨이 이미 사전 표기면 URL 과 무관하게 그대로", () => {
    expect(normalizeSourceLabel("[디 애슬레틱] 소식", MAP, "https://www.bbc.com/x")).toBe(
      "[디 애슬레틱] 소식"
    )
  })
})

/**
 * 드라이런에서 나온 개악 3종 회귀 방지 (2026-08-09).
 * 폴백의 목적은 "독자가 못 읽는 라벨" 제거지, 정보를 줄이는 게 아니다.
 */
describe("도메인 폴백이 정보를 줄이지 않는다", () => {
  const M = buildSourceLabelMap([
    {
      preferred_ko: "모레토",
      romanized: "Matteo Moretto",
      surfaces: ["moretto"],
      hangul_alts: null,
    },
    {
      preferred_ko: "야후 스포츠",
      romanized: "sports.yahoo.com",
      surfaces: ["sports.yahoo.com"],
      hangul_alts: null,
    },
    {
      preferred_ko: "텔레그래프",
      romanized: "telegraph.co.uk",
      surfaces: ["telegraph.co.uk"],
      hangul_alts: null,
    },
    {
      preferred_ko: "가디언",
      romanized: "theguardian.com",
      surfaces: ["theguardian.com"],
      hangul_alts: null,
    },
  ])

  it("⚠️ 3자 한글 이름도 키가 된다 — '모레토'가 하한 4자에 걸려 덮이면 안 된다", () => {
    expect(M.get("모레토")).toBe("모레토")
    expect(normalizeSourceLabel("[모레토] 소식", M, "https://sports.yahoo.com/x")).toBe(
      "[모레토] 소식"
    )
  })

  it("⚠️ 사전에 없어도 한글 라벨이면 손대지 않는다 — 기자명이 매체명보다 정보가 많다", () => {
    const t = "[루크 에드워즈] 뉴캐슬 소식"
    expect(normalizeSourceLabel(t, M, "https://www.telegraph.co.uk/x")).toBe(t)
  })

  it("로마자 라벨만 도메인으로 채운다 (원래 목적)", () => {
    expect(normalizeSourceLabel("[Tom Garry] 소식", M, "https://www.theguardian.com/x")).toBe(
      "[가디언] 소식"
    )
  })

  it("3자 이하 로마자 약어는 여전히 키가 아니다 ([AFC]→아스널 방지 회귀)", () => {
    const A = buildSourceLabelMap([
      {
        preferred_ko: "아스널",
        romanized: "Arsenal FC",
        surfaces: ["arsenal", "afc"],
        hangul_alts: null,
      },
    ])
    expect(A.has("afc")).toBe(false)
  })
})

/**
 * The Athletic 기사는 전부 `nytimes.com/athletic/...` 로 온다(실측 6건 전수).
 * 호스트만 보면 디 애슬레틱 기사가 뉴욕타임스로 나간다.
 */
describe("멀티브랜드 호스트 (nytimes.com/athletic)", () => {
  const M = buildSourceLabelMap([
    {
      preferred_ko: "디 애슬레틱",
      romanized: "theathletic.com",
      surfaces: ["theathletic.com", "nytimes.com/athletic"],
      hangul_alts: null,
    },
    {
      preferred_ko: "뉴욕타임스",
      romanized: "nytimes.com",
      surfaces: ["nytimes.com"],
      hangul_alts: null,
    },
  ])

  it("경로가 /athletic 이면 디 애슬레틱", () => {
    expect(
      normalizeSourceLabel(
        "[Jack Pitt-Brooke] 반 데 벤 재계약",
        M,
        "https://www.nytimes.com/athletic/6945026/2026/08/06/x/?utm=1"
      )
    ).toBe("[디 애슬레틱] 반 데 벤 재계약")
  })

  it("같은 호스트라도 다른 경로면 뉴욕타임스", () => {
    expect(normalizeSourceLabel("[Somebody] 기사", M, "https://www.nytimes.com/2026/08/06/x")).toBe(
      "[뉴욕타임스] 기사"
    )
  })
})

describe("도메인 유래 3자 키 (bbc.com → bbc)", () => {
  const M = buildSourceLabelMap([
    {
      preferred_ko: "BBC",
      romanized: "bbc.com",
      surfaces: ["bbc.com", "bbc.co.uk"],
      hangul_alts: null,
    },
    {
      preferred_ko: "아스널",
      romanized: "Arsenal FC",
      surfaces: ["arsenal", "afc"],
      hangul_alts: null,
    },
  ])

  it("기자 성씨 영문을 도메인의 매체로 바꾼다 (bbc.com 3자 키)", () => {
    expect(normalizeSourceLabel("[Mokbel] 맨유 소식", M, "https://www.bbc.com/sport/x")).toBe(
      "[BBC] 맨유 소식"
    )
  })

  it("⚠️ 팀 약어는 여전히 키가 아니다 — 위험한 건 도메인이 아니라 약어다", () => {
    expect(M.has("afc")).toBe(false)
  })
})
