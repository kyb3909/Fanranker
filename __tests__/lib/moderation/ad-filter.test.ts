import { describe, it, expect } from "vitest"
import {
  runAdFilter,
  extractAllText,
  extractUrls,
  textSimilarity,
  type AdFilterInput,
} from "@/lib/moderation/ad-filter"

/**
 * 광고 룰 필터 — 여기서 잠그는 계약:
 *   · 정상 글(링크 없는 잡담, 오래된 계정의 뉴스 링크)은 무조치
 *   · 단독 신호로는 BLIND 에 도달하지 않는다 (블랙리스트 제외)
 *   · 결합 신호(신규계정+연락처 등)가 임계값을 넘는다
 * 오탐은 유저 신뢰를 태우고, 이 필터 위에 P2·P3 가 쌓이므로 여기가 기초다.
 */

function input(overrides: Partial<AdFilterInput>): AdFilterInput {
  return {
    text: "",
    authorAgeDays: 365,
    createdAt: new Date("2026-07-29T12:00:00Z"),
    otherPostsBySameAuthor: [],
    ...overrides,
  }
}

describe("정상 글은 무조치", () => {
  it("링크 없는 잡담", () => {
    const r = runAdFilter(input({ text: "오늘 아스날 경기 미쳤다 사카 폼 무엇" }))
    expect(r.action).toBe("NO_ACTION")
    expect(r.score).toBe(0)
  })

  it("오래된 계정의 뉴스 링크 1개", () => {
    const r = runAdFilter(
      input({ text: "로마노 오피셜 떴다 https://www.skysports.com/football/news/123" })
    )
    expect(r.action).toBe("NO_ACTION")
  })

  it("신규 계정이라도 링크 없으면 신호 없음", () => {
    const r = runAdFilter(input({ text: "가입인사드립니다", authorAgeDays: 0 }))
    expect(r.score).toBe(0)
  })

  it('"카톡 보내놨어" 같은 일상 대화는 연락처 패턴이 아니다', () => {
    const r = runAdFilter(input({ text: "어제 카톡 보내놨는데 답이 없네" }))
    expect(r.signals.find((s) => s.id === "contact")).toBeUndefined()
  })

  // ── 드라이런 실측 오탐 2건 (2026-07-29) — 재발 방지 ──

  it("트위터 임베드 여러 개는 링크 신호가 아니다 (커뮤 애그리게이터 글)", () => {
    const embeds = Array.from(
      { length: 17 },
      (_, i) => `https://x.com/user${i}/status/208098526651349838${i}`
    ).join(" ")
    const r = runAdFilter(input({ text: `호프 상황이 호불호 갈려서 ${embeds}`, authorAgeDays: 3 }))
    expect(r.signals).toEqual([])
  })

  it("트윗 상태 ID 속 숫자열은 전화번호가 아니다", () => {
    const r = runAdFilter(
      input({ text: "소식 https://x.com/yago/status/2072652480173769036 참고" })
    )
    expect(r.signals.find((s) => s.id === "contact")).toBeUndefined()
  })

  it("본문에 그대로 적힌 전화번호는 여전히 잡는다", () => {
    const r = runAdFilter(input({ text: "문의는 010-1234-5678 로 주세요" }))
    expect(r.signals.map((s) => s.id)).toEqual(["contact"])
  })
})

describe("단독 신호는 조치까지 못 간다", () => {
  it("단축 URL 하나만으로는 무조치 (기록만)", () => {
    const r = runAdFilter(input({ text: "이거 봐라 https://bit.ly/abc123" }))
    expect(r.signals.map((s) => s.id)).toEqual(["shortUrl"])
    expect(r.action).toBe("NO_ACTION")
  })

  it("신규 계정 + 일반 링크만으로는 무조치", () => {
    const r = runAdFilter(input({ text: "글 https://example.com/article", authorAgeDays: 2 }))
    expect(r.action).toBe("NO_ACTION")
  })
})

describe("결합 신호가 임계값을 넘는다", () => {
  it("신규계정 + 단축URL → VISIBILITY_DOWN + 큐", () => {
    const r = runAdFilter(input({ text: "혜택 정보 https://bit.ly/xx", authorAgeDays: 1 }))
    expect(r.action).toBe("VISIBILITY_DOWN")
    expect(r.enqueue).toBe(true)
  })

  it("신규계정 + 오픈채팅 링크 → BLIND", () => {
    const r = runAdFilter(
      input({
        text: "수익 인증방 초대 https://open.kakao.com/o/gAbCdEf",
        authorAgeDays: 0,
      })
    )
    expect(r.action).toBe("BLIND")
    expect(r.enqueue).toBe(true)
  })

  it("도배 + 링크 밀도 → BLIND", () => {
    const text = "최저가 https://a.example.com https://b.example.com"
    const others = [1, 2].map((m) => ({
      text,
      createdAt: new Date(`2026-07-29T12:0${m}:00Z`),
    }))
    const r = runAdFilter(input({ text, otherPostsBySameAuthor: others }))
    expect(r.signals.map((s) => s.id).sort()).toEqual(["linkDensity", "spamRepeat"])
    expect(r.action).toBe("BLIND")
  })

  it("점수는 1을 넘지 않는다", () => {
    const text = "카톡 아이디 profit77 추가 https://bit.ly/x https://open.kakao.com/o/abc"
    const r = runAdFilter(
      input({
        text,
        authorAgeDays: 0,
        otherPostsBySameAuthor: [
          { text, createdAt: new Date("2026-07-29T12:05:00Z") },
          { text, createdAt: new Date("2026-07-29T12:10:00Z") },
        ],
      })
    )
    expect(r.score).toBe(1)
    expect(r.action).toBe("BLIND")
  })
})

describe("도배 판정 경계", () => {
  const text = "무료 픽 공유합니다 지금 참여하세요"

  it("윈도우 밖의 같은 글은 세지 않는다", () => {
    const r = runAdFilter(
      input({
        text,
        otherPostsBySameAuthor: [
          { text, createdAt: new Date("2026-07-29T09:00:00Z") }, // 3시간 전
          { text, createdAt: new Date("2026-07-29T08:00:00Z") },
        ],
      })
    )
    expect(r.signals.find((s) => s.id === "spamRepeat")).toBeUndefined()
  })

  it("다른 내용의 연속 글은 도배가 아니다", () => {
    const r = runAdFilter(
      input({
        text: "오늘 경기 라인업 예상해봅니다",
        otherPostsBySameAuthor: [
          { text: "어제 경기 리뷰 남깁니다", createdAt: new Date("2026-07-29T12:05:00Z") },
          { text: "이적시장 소식 정리", createdAt: new Date("2026-07-29T12:10:00Z") },
        ],
      })
    )
    expect(r.signals.find((s) => s.id === "spamRepeat")).toBeUndefined()
  })
})

describe("textSimilarity", () => {
  it("같은 글 = 1, 무관한 글 ≈ 0", () => {
    expect(textSimilarity("무료 픽 공유합니다", "무료 픽 공유합니다")).toBe(1)
    expect(textSimilarity("오늘 아스날 경기", "이적시장 마감 임박")).toBeLessThan(0.1)
  })

  it("공백/대소문자 차이는 무시한다", () => {
    expect(textSimilarity("무료픽 공유 A", "무료 픽공유 a")).toBeGreaterThan(0.8)
  })
})

describe("추출 헬퍼", () => {
  it("extractAllText 는 임베드 attrs 의 URL 도 수거한다", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "본문" }] },
        { type: "embed", attrs: { src: "https://bit.ly/xyz" } },
      ],
    }
    const text = extractAllText(doc)
    expect(text).toContain("본문")
    expect(text).toContain("https://bit.ly/xyz")
  })

  it("extractUrls 는 후행 문장부호를 URL 에 붙이지 않는다", () => {
    expect(extractUrls("링크 (https://example.com/a) 참고")).toEqual(["https://example.com/a"])
  })
})
