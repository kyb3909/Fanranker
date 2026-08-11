import { describe, expect, it } from "vitest"
import { drawCards, MAJOR_ARCANA_COUNT, type Rng } from "@/lib/tarot/draw"
import { checkSafety } from "@/lib/tarot/safety"
import { splitExpressionTag, buildUserPrompt } from "@/lib/tarot/prompt"
import { parseExpression, inferExpression } from "@/lib/tarot/expression"

/**
 * 축구 타로 코어 — 서버가 지켜야 할 계약.
 *
 * 가장 중요한 건 **카드를 서버가 확정한다**는 것이다. 중복이 나오거나 클라이언트가
 * 결과를 만들 수 있으면 "점"이 아니라 장난감이 된다.
 * 안전 가드는 이 사이트 특유의 요구(도박 유도 차단)까지 포함한다 — 무료 포인트
 * 예측 서비스가 사행성 조언을 하면 카카오 심사 소명과 정면으로 부딪힌다.
 */

/** 결정론 RNG — 0,0.1,0.2… 순환. 같은 입력이면 같은 판이 나와야 테스트가 성립한다 */
function seqRng(values: number[]): Rng {
  let i = 0
  return () => values[i++ % values.length]
}

describe("drawCards — 서버 확정 추출", () => {
  it("스프레드 장수만큼 뽑는다", () => {
    expect(drawCards("one")).toHaveLength(1)
    expect(drawCards("three")).toHaveLength(3)
  })

  it("한 판에 같은 카드가 두 번 나오지 않는다 (비복원)", () => {
    // 200회 반복 — 중복은 확률적으로만 드러난다
    for (let i = 0; i < 200; i++) {
      const cards = drawCards("three")
      expect(new Set(cards.map((c) => c.arcanaNumber)).size).toBe(3)
    }
  })

  it("arcana 는 0..21 범위 안이다", () => {
    for (let i = 0; i < 100; i++) {
      for (const c of drawCards("three")) {
        expect(c.arcanaNumber).toBeGreaterThanOrEqual(0)
        expect(c.arcanaNumber).toBeLessThan(MAJOR_ARCANA_COUNT)
      }
    }
  })

  it("position 은 0부터 순서대로 매겨진다", () => {
    expect(drawCards("three").map((c) => c.position)).toEqual([0, 1, 2])
  })

  it("reversalsEnabled=false 면 전부 정방향", () => {
    for (const c of drawCards("three", false)) expect(c.reversed).toBe(false)
  })

  it("역방향은 확률로 갈린다 — rng 주입으로 결정론 확인", () => {
    // ⚠️ rng 는 인덱스 추출(count회) → 역방향 판정(count회) 순으로 소비된다.
    //    두 용도가 같은 스트림을 쓰므로 값을 번갈아 주면 어느 쪽에 어떤 값이 가는지
    //    헷갈린다(첫 작성 때 실제로 틀렸다). 상수로 주면 의도가 명확하다.
    expect(drawCards("three", true, seqRng([0.9])).every((c) => !c.reversed)).toBe(true)
    expect(drawCards("three", true, seqRng([0.1])).every((c) => c.reversed)).toBe(true)
  })
})

describe("checkSafety — 이중 방어의 첫 층", () => {
  it("평범한 축구 질문은 통과", () => {
    expect(checkSafety("오늘 아스날 이길까요?")).toBe("ok")
    expect(checkSafety("이 이적설 성사될까요?")).toBe("ok")
    expect(checkSafety(null)).toBe("ok")
  })

  it("위기 신호는 crisis 로 잡는다", () => {
    expect(checkSafety("죽고 싶어요")).toBe("crisis")
    expect(checkSafety("자살하고 싶다")).toBe("crisis")
  })

  it("도박 유도는 gambling 으로 잡는다 — 이 사이트 특유의 가드", () => {
    expect(checkSafety("이번주 토토 뭐 찍어야 돼?")).toBe("gambling")
    expect(checkSafety("10만원 걸어도 될까요?")).toBe("gambling")
    expect(checkSafety("적중 픽 좀 알려줘")).toBe("gambling")
  })

  it("위기가 도박보다 우선한다 — 순서가 뒤집히면 위기 질문이 도박 안내로 답해진다", () => {
    expect(checkSafety("돈 다 잃고 죽고 싶어요")).toBe("crisis")
  })
})

describe("프롬프트 — 근거 주입", () => {
  it("뽑힌 카드의 이름·방향·의미가 전부 주입된다 (모델이 창작할 여지를 없앤다)", () => {
    const prompt = buildUserPrompt({
      question: "오늘 이길까요?",
      spreadId: "one",
      cards: [{ position: 0, arcanaNumber: 0, reversed: true }],
    })
    expect(prompt).toContain("오늘 이길까요?")
    expect(prompt).toContain("바보")
    expect(prompt).toContain("역방향")
    expect(prompt).toContain("무모함") // 역방향 키워드
    expect(prompt).toContain("바꾸지 말 것")
  })

  it("정방향이면 정방향 의미가 들어간다", () => {
    const prompt = buildUserPrompt({
      question: "q",
      spreadId: "one",
      cards: [{ position: 0, arcanaNumber: 0, reversed: false }],
    })
    expect(prompt).toContain("정방향")
    expect(prompt).toContain("새로운 시작")
  })
})

describe("표정 태그", () => {
  it("첫 줄의 [표정: X] 를 떼어내고 본문만 남긴다", () => {
    const [tag, body] = splitExpressionTag("[표정: 미소]\n### 핵심 · 바보\n내용")
    expect(tag).toBe("미소")
    expect(body.startsWith("###")).toBe(true)
  })

  it("태그가 없으면 본문을 그대로 돌려준다 (형식 위반에도 안 깨진다)", () => {
    const [tag, body] = splitExpressionTag("### 핵심\n내용")
    expect(tag).toBeNull()
    expect(body).toContain("### 핵심")
  })

  it("한국어 표정 이름이 슬롯으로 변환된다", () => {
    expect(parseExpression("미소")).toBe("smile")
    expect(parseExpression("focused")).toBe("focused")
    expect(parseExpression("모르는값")).toBeNull()
  })

  it("모델 태그가 없어도 판 구성으로 표정이 정해진다 (폴백)", () => {
    const allUpright = [0, 1, 2].map((position) => ({
      position,
      arcanaNumber: position,
      reversed: false,
    }))
    const allReversed = allUpright.map((c) => ({ ...c, reversed: true }))
    expect(inferExpression(allUpright)).toBe("smile")
    expect(inferExpression(allReversed)).toBe("worried")
  })
})
