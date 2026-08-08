import { describe, expect, it } from "vitest"
import { chatParams, supportsSamplingParams } from "@/lib/llm/openai-params"

/**
 * 기대값은 전부 2026-08-09 실제 API 프로브 결과다 (근거는 lib/llm/openai-params.ts 주석).
 * 추측으로 고정하면 안 되는 계약이라 테스트에 남긴다.
 */
describe("supportsSamplingParams", () => {
  it("5세대는 샘플링 파라미터를 못 받는다 (terra 실측 400)", () => {
    expect(supportsSamplingParams("gpt-5.6-terra")).toBe(false)
    expect(supportsSamplingParams("gpt-5.1")).toBe(false)
  })

  it("4세대는 받는다", () => {
    expect(supportsSamplingParams("gpt-4o-mini")).toBe(true)
    expect(supportsSamplingParams("gpt-4.1-mini")).toBe(true)
    expect(supportsSamplingParams("gpt-4o")).toBe(true)
  })
})

describe("chatParams", () => {
  it("지원 모델은 값을 그대로 통과시킨다 — 오늘 동작하는 호출을 건드리지 않는다", () => {
    expect(chatParams("gpt-4o-mini", { temperature: 0.3, max_tokens: 600 })).toEqual({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 600,
    })
  })

  it("terra 는 temperature/top_p 를 뺀다 (실측 400 사유)", () => {
    const out = chatParams("gpt-5.6-terra", { temperature: 0.4, top_p: 0.9 })
    expect(out).toEqual({ model: "gpt-5.6-terra" })
  })

  it("terra 는 max_tokens 를 max_completion_tokens 로 바꾼다", () => {
    expect(chatParams("gpt-5.6-terra", { temperature: 0, max_tokens: 800 })).toEqual({
      model: "gpt-5.6-terra",
      max_completion_tokens: 800,
    })
  })

  it("출력 상한이 없으면 만들어내지 않는다", () => {
    expect(chatParams("gpt-5.6-terra")).toEqual({ model: "gpt-5.6-terra" })
  })

  it("모델만 바꿔도 호출부 수정이 필요 없다 (드리프트 불가 — 이 헬퍼의 존재 이유)", () => {
    const sampling = { temperature: 0.4, max_tokens: 1000 }
    expect(chatParams("gpt-4o-mini", sampling)).toHaveProperty("temperature")
    expect(chatParams("gpt-5.6-terra", sampling)).not.toHaveProperty("temperature")
  })
})
