import { describe, expect, it, afterEach, vi } from "vitest"
import {
  ASSIGNMENT_MAX_ATTEMPTS,
  ASSIGNMENT_PROMPT_VERSION,
  ASSIGNMENT_RULE_MODEL,
  assignmentContentHash,
  classifyAssignmentFailure,
  estimateAssignmentCostUsd,
  parseAssignmentVerdict,
  preAssign,
  requestAssignment,
  supportsTemperature,
  type AssignmentInput,
} from "@/lib/news/assignment-desk"

/**
 * 어사인먼트 데스크(shadow)가 지켜야 할 계약을 잠근다.
 * 핵심은 하나 — **"판정"과 "호출 실패"가 절대 같은 결과로 접히지 않는다.**
 */

const LONG_BODY =
  "아스날이 에미레이트 스타디움에서 열린 프리미어리그 경기에서 리버풀을 2-0으로 이겼다. 전반 23분 사카가 선제골을 넣었고 후반 78분 마르티넬리가 추가골을 기록했다. 아스날은 이 승리로 승점 3점을 확보했다."

function input(overrides: Partial<AssignmentInput> = {}): AssignmentInput {
  return {
    candidateId: "hermes-reddit-1",
    title: "아스날, 리버풀 2-0 격파",
    body: LONG_BODY,
    sourceUrl: "https://bbc.com/sport/football/1",
    ...overrides,
  }
}

const VALID_VERDICT = {
  desk: "match",
  priority: 72,
  risk: "low",
  format: "standard",
  required_checks: ["image_required"],
  deadline_minutes: 360,
  decision: "assign",
  reason_codes: ["big_club", "match_report"],
}

describe("assignmentContentHash", () => {
  it("공백 차이만 있는 초안은 같은 내용으로 본다 (불필요한 재호출 방지)", () => {
    const a = assignmentContentHash({ title: "제목", body: "본문  텍스트", sourceUrl: "u" })
    const b = assignmentContentHash({ title: " 제목 ", body: "본문 텍스트", sourceUrl: "u" })
    expect(a).toBe(b)
  })

  it("본문이 실제로 바뀌면 해시가 바뀐다 (재평가가 열려야 한다)", () => {
    const a = assignmentContentHash({ title: "제목", body: "본문", sourceUrl: "u" })
    const b = assignmentContentHash({ title: "제목", body: "본문 수정", sourceUrl: "u" })
    expect(a).not.toBe(b)
  })

  it("같은 제목·본문이라도 출처가 다르면 다른 후보다", () => {
    const a = assignmentContentHash({ title: "제목", body: "본문", sourceUrl: "a" })
    const b = assignmentContentHash({ title: "제목", body: "본문", sourceUrl: "b" })
    expect(a).not.toBe(b)
  })
})

describe("preAssign — 결정론 선판정", () => {
  it("여자 축구는 LLM 없이 반려한다 (운영자 확정 정책)", () => {
    const verdict = preAssign(input({ title: "아스날 위민, WSL 개막전 승리" }))
    expect(verdict?.decision).toBe("reject")
    expect(verdict?.reason_codes).toEqual(["womens_football"])
    expect(verdict?.model).toBe(ASSIGNMENT_RULE_MODEL)
    expect(verdict?.prompt_version).toBe(ASSIGNMENT_PROMPT_VERSION)
  })

  it("개인 블로그·뉴스레터 출처는 반려가 아니라 보류다 (사람 검수로)", () => {
    const verdict = preAssign(input({ sourceUrl: "https://someone.substack.com/p/x" }))
    expect(verdict?.decision).toBe("hold")
    expect(verdict?.reason_codes).toEqual(["personal_blog"])
  })

  it("무내용 초안은 보류한다", () => {
    const verdict = preAssign(input({ body: "짧은 한 줄." }))
    expect(verdict?.decision).toBe("hold")
    expect(verdict?.reason_codes).toEqual(["content_free"])
  })

  it("정상 후보는 규칙으로 끝내지 않고 LLM 에 넘긴다", () => {
    expect(preAssign(input())).toBeNull()
  })

  it("먼저 본 제목과 비슷하면 LLM 없이 중복으로 접는다 (v2 — 1건씩 호출하면 LLM 은 못 잡는다)", () => {
    const seen = ["[Lee Ryder] 뉴캐슬, 아스날과 브루노 기마랑이스 7500만 파운드 이적 논의"]
    const verdict = preAssign(
      input({ title: "[Chronicle Live] 뉴캐슬, 아스날과 브루노 기마랑이스 7500만 파운드 협상" }),
      seen
    )

    expect(verdict?.decision).toBe("duplicate")
    expect(verdict?.reason_codes).toEqual(["duplicate_recent"])
    expect(verdict?.model).toBe(ASSIGNMENT_RULE_MODEL)
  })

  it("먼저 본 제목과 무관하면 중복이 아니다", () => {
    const verdict = preAssign(input({ title: "토트넘, 미키 무어 임대 이적 추진" }), [
      "뉴캐슬, 브루노 기마랑이스 7500만 파운드 협상",
    ])
    expect(verdict).toBeNull()
  })

  it("여자 축구가 중복보다 우선한다 (같은 소식 둘이어도 사유는 정책 반려다)", () => {
    const verdict = preAssign(input({ title: "바르셀로나 여자팀, 맨체스터 시티와 친선전" }), [
      "바르셀로나 여자팀, 맨체스터 시티와 친선전 확정",
    ])
    expect(verdict?.reason_codes).toEqual(["womens_football"])
  })
})

describe("parseAssignmentVerdict — 계약 검증", () => {
  it("정상 응답을 판정으로 옮긴다", () => {
    const result = parseAssignmentVerdict(VALID_VERDICT, "gpt-4o-mini")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.verdict.desk).toBe("match")
    expect(result.verdict.decision).toBe("assign")
    expect(result.verdict.model).toBe("gpt-4o-mini")
  })

  it.each([
    ["desk", { desk: "esports" }],
    ["risk", { risk: "extreme" }],
    ["format", { format: "longform" }],
    ["decision", { decision: "publish" }],
  ])("%s 값이 계약 밖이면 기본값으로 메우지 않고 실패시킨다", (_field, override) => {
    const result = parseAssignmentVerdict({ ...VALID_VERDICT, ...override }, "gpt-4o-mini")
    expect(result.ok).toBe(false)
  })

  it("priority 범위를 벗어나면 실패한다", () => {
    expect(parseAssignmentVerdict({ ...VALID_VERDICT, priority: 140 }, "m").ok).toBe(false)
    expect(parseAssignmentVerdict({ ...VALID_VERDICT, priority: -1 }, "m").ok).toBe(false)
  })

  it("deadline_minutes 가 24시간을 넘으면 실패한다 (만료가 먼저 온다)", () => {
    expect(parseAssignmentVerdict({ ...VALID_VERDICT, deadline_minutes: 5000 }, "m").ok).toBe(false)
  })

  it("모르는 reason_code 는 버리되 남은 게 있으면 통과시키고 dropped 로 보고한다", () => {
    const result = parseAssignmentVerdict(
      { ...VALID_VERDICT, reason_codes: ["big_club", "vibes"], required_checks: ["astrology"] },
      "gpt-4o-mini"
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.verdict.reason_codes).toEqual(["big_club"])
    expect(result.verdict.required_checks).toEqual([])
    expect(result.dropped).toEqual({
      checks: ["astrology"],
      reasonCodes: ["vibes"],
      mismatched: [],
    })
  })

  it("사유가 하나도 안 남으면 실패한다 — 이유 모를 판정은 침묵 실패다", () => {
    const result = parseAssignmentVerdict({ ...VALID_VERDICT, reason_codes: ["vibes"] }, "m")
    expect(result.ok).toBe(false)
  })

  // v5 — v2 에서 결정↔사유 강제 매칭을 걸었다가 멀쩡한 판정 12~13%를 잃었다.
  // 모델은 이 코드들을 반려 사유가 아니라 기사 종류 서술로 쓴다. 관측만 하고 살린다.
  it("결정과 어긋나는 사유는 버리지 않고 mismatched 로 세기만 한다", () => {
    const result = parseAssignmentVerdict(
      { ...VALID_VERDICT, decision: "assign", reason_codes: ["big_club", "admin_notice"] },
      "gpt-4o-mini"
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.verdict.reason_codes).toEqual(["big_club", "admin_notice"])
    expect(result.dropped.mismatched).toEqual(["admin_notice"])
  })

  it("사유가 서술뿐이어도 판정을 살린다 — 실제 실패 원문 회귀", () => {
    // {"decision":"hold","reason_codes":["non_football"]} — 2026-08-05 실측
    const result = parseAssignmentVerdict(
      { ...VALID_VERDICT, decision: "hold", format: "hold", reason_codes: ["non_football"] },
      "gpt-4o-mini"
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.verdict.decision).toBe("hold")
    expect(result.dropped.mismatched).toEqual(["non_football"])
  })

  it("기대와 맞는 사유는 mismatched 에 안 들어간다", () => {
    const result = parseAssignmentVerdict(
      { ...VALID_VERDICT, decision: "assign", priority: 25, reason_codes: ["low_interest"] },
      "gpt-4o-mini"
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dropped.mismatched).toEqual([])
  })

  it("보류는 배정 근거를 함께 쓸 수 있다 (빅클럽인데 출처가 불명한 경우)", () => {
    const result = parseAssignmentVerdict(
      {
        ...VALID_VERDICT,
        decision: "hold",
        format: "hold",
        reason_codes: ["big_club", "unclear_source"],
      },
      "gpt-4o-mini"
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.verdict.reason_codes).toEqual(["big_club", "unclear_source"])
    expect(result.dropped.mismatched).toEqual([])
  })

  it("객체가 아닌 응답은 실패한다", () => {
    expect(parseAssignmentVerdict(null, "m").ok).toBe(false)
    expect(parseAssignmentVerdict("assign", "m").ok).toBe(false)
  })
})

describe("classifyAssignmentFailure — 재시도 대기와 영구 실패 구분", () => {
  it("인증·요청 형식 오류(4xx)는 즉시 dead_letter — 다시 보내도 같은 답이다", () => {
    expect(classifyAssignmentFailure({ kind: "http", httpStatus: 401, attempt: 1 })).toBe(
      "dead_letter"
    )
    expect(classifyAssignmentFailure({ kind: "http", httpStatus: 400, attempt: 1 })).toBe(
      "dead_letter"
    )
  })

  it("429·408·5xx 는 시간이 해결하므로 retry_wait", () => {
    expect(classifyAssignmentFailure({ kind: "http", httpStatus: 429, attempt: 1 })).toBe(
      "retry_wait"
    )
    expect(classifyAssignmentFailure({ kind: "http", httpStatus: 408, attempt: 1 })).toBe(
      "retry_wait"
    )
    expect(classifyAssignmentFailure({ kind: "http", httpStatus: 503, attempt: 1 })).toBe(
      "retry_wait"
    )
  })

  it("네트워크·파싱·계약 실패는 재시도 대상이다", () => {
    expect(classifyAssignmentFailure({ kind: "network", attempt: 1 })).toBe("retry_wait")
    expect(classifyAssignmentFailure({ kind: "parse", attempt: 1 })).toBe("retry_wait")
    expect(classifyAssignmentFailure({ kind: "contract", attempt: 1 })).toBe("retry_wait")
  })

  it("계약 위반은 더 빨리 접는다 — temperature 0 이라 다시 물어도 같은 답이다", () => {
    expect(classifyAssignmentFailure({ kind: "contract", attempt: 2 })).toBe("dead_letter")
    // 같은 회차수라도 네트워크 실패는 아직 재시도 가치가 있다
    expect(classifyAssignmentFailure({ kind: "network", attempt: 2 })).toBe("retry_wait")
  })

  it("재시도 상한에 닿으면 dead_letter 로 내린다 (무한 재시도 금지)", () => {
    expect(classifyAssignmentFailure({ kind: "network", attempt: ASSIGNMENT_MAX_ATTEMPTS })).toBe(
      "dead_letter"
    )
    expect(
      classifyAssignmentFailure({ kind: "http", httpStatus: 503, attempt: ASSIGNMENT_MAX_ATTEMPTS })
    ).toBe("dead_letter")
  })
})

describe("estimateAssignmentCostUsd", () => {
  it("캐시된 입력 토큰은 할인 요율로 계산한다 (input 의 부분집합이라 이중 계상 금지)", () => {
    const full = estimateAssignmentCostUsd("gpt-4o-mini", {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cachedTokens: 0,
    })
    const cached = estimateAssignmentCostUsd("gpt-4o-mini", {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cachedTokens: 1_000_000,
    })
    expect(full).toBe(0.15)
    expect(cached).toBe(0.075)
  })

  it("결정론 규칙 판정은 호출이 없으므로 0 이다", () => {
    expect(
      estimateAssignmentCostUsd(ASSIGNMENT_RULE_MODEL, {
        inputTokens: null,
        outputTokens: null,
        cachedTokens: null,
      })
    ).toBe(0)
  })

  it("요율표에 없는 모델은 0 이 아니라 null — 모르는 비용을 0 으로 적지 않는다", () => {
    expect(
      estimateAssignmentCostUsd("gpt-9-unknown", {
        inputTokens: 1000,
        outputTokens: 1000,
        cachedTokens: 0,
      })
    ).toBeNull()
  })
})

describe("supportsTemperature", () => {
  it("GPT-5 계열에는 temperature 를 보내지 않는다 (400 → fail-closed 전건 반려 방지)", () => {
    expect(supportsTemperature("gpt-5.6-terra")).toBe(false)
    expect(supportsTemperature("gpt-5-mini")).toBe(false)
  })

  it("4 계열은 temperature 를 받는다", () => {
    expect(supportsTemperature("gpt-4o-mini")).toBe(true)
    expect(supportsTemperature("gpt-4.1-mini")).toBe(true)
  })
})

describe("requestAssignment", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubResponse(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => payload,
    })
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  const okPayload = {
    choices: [{ message: { content: JSON.stringify(VALID_VERDICT) } }],
    usage: {
      prompt_tokens: 900,
      completion_tokens: 60,
      prompt_tokens_details: { cached_tokens: 0 },
    },
  }

  it("정상 응답이면 판정과 사용량·지연을 함께 돌려준다", async () => {
    stubResponse(okPayload)

    const result = await requestAssignment(input(), { apiKey: "k" })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.verdict.decision).toBe("assign")
    expect(result.usage).toEqual({ inputTokens: 900, outputTokens: 60, cachedTokens: 0 })
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it("HTTP 실패는 llm_error 이고 상태 코드를 보존한다 ('배정 가치 없음'이 아니다)", async () => {
    stubResponse({}, { ok: false, status: 429 })

    const result = await requestAssignment(input(), { apiKey: "k" })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.outcome).toBe("llm_error")
    expect(result.kind).toBe("http")
    expect(result.httpStatus).toBe(429)
  })

  it("JSON 이 깨지면 invalid_output 이다 (호출은 성공했다)", async () => {
    stubResponse({ choices: [{ message: { content: "{ not json" } }], usage: {} })

    const result = await requestAssignment(input(), { apiKey: "k" })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.outcome).toBe("invalid_output")
    expect(result.kind).toBe("parse")
  })

  it("계약을 못 지킨 응답도 invalid_output 이고 사용량은 남는다 (비용은 이미 썼다)", async () => {
    stubResponse({
      choices: [{ message: { content: JSON.stringify({ ...VALID_VERDICT, desk: "esports" }) } }],
      usage: { prompt_tokens: 800, completion_tokens: 40 },
    })

    const result = await requestAssignment(input(), { apiKey: "k" })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.outcome).toBe("invalid_output")
    expect(result.kind).toBe("contract")
    expect(result.usage.inputTokens).toBe(800)
    // 모델 원문을 안 남기면 다음 프롬프트 수정이 추측이 된다 (v4 에서 실제로 그랬다)
    expect(result.raw).toContain("esports")
  })

  it("네트워크 예외는 llm_error/network 로 분류한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")))

    const result = await requestAssignment(input(), { apiKey: "k" })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.outcome).toBe("llm_error")
    expect(result.kind).toBe("network")
  })

  it("GPT-5 계열 모델에는 temperature 를 실어 보내지 않는다", async () => {
    const fetchMock = stubResponse(okPayload)

    await requestAssignment(input(), { apiKey: "k", model: "gpt-5.6-terra" })

    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)
    expect(body).not.toHaveProperty("temperature")
    expect(body.model).toBe("gpt-5.6-terra")
  })
})
