import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createHash } from "node:crypto"

/**
 * 데스킹 학습 — 표기/사실 분리 (2026-08-07 운영자: "뭐가 문제였는지도 적으면서
 * 수정하면 더 도움이 될까?")
 *
 * 계약:
 * - 표기 교정(corrections)만 사전에 등재된다.
 * - 사실 정정(factual — 디오망데형 "바르셀로나"→"레알 마드리드")은 사전에 넣지 않고
 *   반환만 한다 (호출자가 audit 에 기록).
 * - factual 도 환각 가드(양쪽 텍스트 실재 문자열)를 통과해야 한다.
 * - 검수자 사유(operatorNote)는 LLM 입력에 검수자_사유 로 주입된다.
 * - OpenAI 실패 시 ran=false — 호출자는 학습 완료 해시를 남기면 안 된다.
 */

import {
  learnFromDeskEdit,
  deskEditTextHash,
  type DeskEditLearnResult,
} from "@/lib/news/learn-corrections"
import type { SupabaseClient } from "@supabase/supabase-js"

function makeSupabase() {
  const inserts: Record<string, unknown>[] = []
  return {
    inserts,
    client: {
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: async () => ({ data: [], error: null }), // 사전에 기존 항목 없음 → 신규 등재 경로
          }),
        }),
        insert: async (row: Record<string, unknown>) => {
          inserts.push(row)
          return { error: null }
        },
      }),
    } as unknown as SupabaseClient,
  }
}

const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
})

const fetchMock = vi.fn()

function mockLLM(payload: unknown) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
  })
}

const PARAMS = {
  postId: "post-1",
  originalTitle: "비니시우스 주니어, 바르셀로나와 재계약",
  originalContent: doc("비니시우스 주니어가 바르셀로나와 재계약했다."),
  finalTitle: "비니시우스 주니오르, 레알 마드리드와 재계약",
  finalContent: doc("비니시우스 주니오르가 레알 마드리드와 재계약했다."),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("fetch", fetchMock)
  process.env.OPENAI_API_KEY = "test-key"
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("learnFromDeskEdit — 표기/사실 분리", () => {
  it("corrections 는 사전에 등재하고, factual 은 등재 없이 반환한다", async () => {
    mockLLM({
      corrections: [{ wrong: "주니어", correct: "주니오르", category: "player" }],
      factual: [
        { wrong: "바르셀로나", correct: "레알 마드리드", kind: "club", summary: "클럽 오류" },
      ],
    })
    const { client, inserts } = makeSupabase()

    const res: DeskEditLearnResult = await learnFromDeskEdit(client, PARAMS)

    expect(res.ran).toBe(true)
    expect(res.learned).toHaveLength(1)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].category).toBe("player")
    expect(inserts[0].preferred_ko).toBe("주니오르")
    // 사실 정정은 사전 미등재 — 반환으로만
    expect(res.factual).toEqual([
      { wrong: "바르셀로나", correct: "레알 마드리드", kind: "club", summary: "클럽 오류" },
    ])
  })

  it("factual 도 환각 가드를 통과해야 한다 — 원본에 없는 wrong 은 버린다", async () => {
    mockLLM({
      corrections: [],
      factual: [{ wrong: "첼시", correct: "레알 마드리드", kind: "club", summary: "지어냄" }],
    })
    const { client } = makeSupabase()

    const res = await learnFromDeskEdit(client, PARAMS)

    expect(res.ran).toBe(true)
    expect(res.factual).toEqual([])
  })

  it("operatorNote 는 검수자_사유 로 LLM 입력에 주입된다", async () => {
    mockLLM({ corrections: [], factual: [] })
    const { client } = makeSupabase()

    await learnFromDeskEdit(client, { ...PARAMS, operatorNote: "클럽이 틀림" })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    const userMsg = body.messages[1].content as string
    expect(userMsg).toContain("검수자_사유")
    expect(userMsg).toContain("클럽이 틀림")
  })

  it("사유가 없으면 검수자_사유 키 자체를 보내지 않는다", async () => {
    mockLLM({ corrections: [], factual: [] })
    const { client } = makeSupabase()

    await learnFromDeskEdit(client, PARAMS)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.messages[1].content as string).not.toContain("검수자_사유")
  })

  it("OpenAI 실패 시 ran=false — 호출자가 완료 해시를 남기지 않게", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    const { client } = makeSupabase()

    const res = await learnFromDeskEdit(client, PARAMS)

    expect(res).toEqual({ learned: [], factual: [], ran: false })
  })

  it("diff 가 없으면 LLM 을 호출하지 않는다 (ran=false)", async () => {
    const { client } = makeSupabase()

    const res = await learnFromDeskEdit(client, {
      ...PARAMS,
      finalTitle: PARAMS.originalTitle,
      finalContent: PARAMS.originalContent,
    })

    expect(res.ran).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("deskEditTextHash — cron 해시 컨벤션 호환", () => {
  it("제목+문단 텍스트 norm → sha1 12자 (news-learn-edits cron 과 동일)", () => {
    const title = "제목 A"
    const content = doc("본문 B")
    // cron 의 계산: norm([title, ...문단].join("\n")) → sha1 hex 12자
    const expected = createHash("sha1").update("제목 A 본문 B", "utf8").digest("hex").slice(0, 12)
    expect(deskEditTextHash(title, content)).toBe(expected)
  })

  it("내용이 바뀌면 해시도 바뀐다", () => {
    expect(deskEditTextHash("제목", doc("v1"))).not.toBe(deskEditTextHash("제목", doc("v2")))
  })
})
