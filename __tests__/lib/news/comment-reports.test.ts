import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * 독자 오류 제보 감지 (2026-08-07 운영자: "댓글 제보 자동 반영 — 검수 거친 다음에")
 *
 * 계약:
 * - 룰 필터는 recall 우선 — 오류 신호 없는 잡담·너무 짧은 댓글만 거른다.
 * - LLM 판정 실패(인프라)는 null — 판정이 아니므로 호출자는 기록하지 않는다.
 * - 판정 결과의 idx 는 입력 범위를 벗어나면 버린다 (환각 인덱스 가드).
 */

import {
  filterErrorReportCandidates,
  classifyErrorReports,
  ERROR_REPORT_HINT_RE,
} from "@/lib/news/comment-reports"

const c = (id: string, content: string) => ({
  id,
  post_id: `post-${id}`,
  user_id: `user-${id}`,
  content,
})

describe("filterErrorReportCandidates — 룰 필터", () => {
  it("오류 신호가 있는 댓글만 통과시킨다", () => {
    const out = filterErrorReportCandidates([
      c("1", "이거 클럽이 잘못됐어요. 레알이 아니라 라이프치히 잔류입니다"),
      c("2", "와 이적 미쳤다 ㅋㅋ"),
      c("3", "오보 아닌가요? 공식 발표 없던데"),
      c("4", "짧"),
    ])
    expect(out.map((o) => o.id)).toEqual(["1", "3"])
  })

  it("표기 지적('다른 선수')도 신호로 잡는다", () => {
    const out = filterErrorReportCandidates([
      c("1", "사진이 다른 선수인데요? 이 사람 마르티네스가 아니라 마르티넬리예요"),
    ])
    expect(out).toHaveLength(1)
  })

  it("단순 감상·응원은 신호가 아니다", () => {
    expect(ERROR_REPORT_HINT_RE.test("드디어 왔다 웰컴!!")).toBe(false)
    expect(ERROR_REPORT_HINT_RE.test("개꿀 소식이네")).toBe(false)
  })
})

describe("classifyErrorReports — LLM 판정", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", fetchMock)
    process.env.OPENAI_API_KEY = "test-key"
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("판정 결과를 idx 로 되돌린다 (범위 밖 idx 는 버림)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                results: [
                  { idx: 0, is_report: true, claim: "클럽이 틀렸다는 주장" },
                  { idx: 7, is_report: true, claim: "환각 인덱스" },
                ],
              }),
            },
          },
        ],
      }),
    })

    const out = await classifyErrorReports([
      { articleTitle: "제목", articleExcerpt: "본문", comment: "클럽 잘못됐어요" },
    ])

    expect(out).toEqual([{ idx: 0, isReport: true, claim: "클럽이 틀렸다는 주장" }])
  })

  it("OpenAI 실패는 null — 기록 없이 다음 회차 재시도", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    const out = await classifyErrorReports([
      { articleTitle: "제목", articleExcerpt: "본문", comment: "오보예요" },
    ])
    expect(out).toBeNull()
  })

  it("입력이 비면 LLM 을 호출하지 않는다", async () => {
    const out = await classifyErrorReports([])
    expect(out).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
