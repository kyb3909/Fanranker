import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { assignmentContentHash } from "@/lib/news/assignment-desk"

/**
 * 어사인먼트 데스크 cron — shadow 계약을 잠근다.
 *   · feature flag 없이는 LLM 을 한 번도 부르지 않는다
 *   · news_reservoir / news_candidates 에 **절대 쓰지 않는다** (쓰기 시도 시 테스트 폭발)
 *   · 같은 (후보, 내용, 프롬프트 버전)은 두 번 판정하지 않는다
 *   · 호출 실패는 판정이 아니라 retry_wait / dead_letter 로 남는다
 */

vi.mock("@/lib/cron/log-run", () => ({
  withCronLog: (_name: string, handler: (request: Request) => Promise<Response>) => handler,
}))

interface CandidateRow {
  candidate_id: string
  state: string
}
interface ReservoirRow {
  id: string
  draft: { title?: string; content?: unknown } | null
  urls: { source?: string | null } | null
}
interface PriorRow {
  candidate_id: string
  content_hash: string
  status: string
}

let candidateRows: CandidateRow[] = []
let reservoirRows: ReservoirRow[] = []
let priorRows: PriorRow[] = []
let inserted: Record<string, unknown>[] = []

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === "news_candidates") {
        return {
          select: () => ({
            gte: () => ({
              order: () => ({ limit: async () => ({ data: candidateRows, error: null }) }),
            }),
          }),
          // shadow 는 후보 상태를 바꾸지 않는다 — 회귀하면 여기서 터진다
          update: () => {
            throw new Error("shadow 는 news_candidates 를 쓰지 않는다")
          },
        }
      }
      if (table === "news_reservoir") {
        return {
          select: () => ({ in: async () => ({ data: reservoirRows, error: null }) }),
          update: () => {
            throw new Error("shadow 는 news_reservoir 를 쓰지 않는다")
          },
          insert: () => {
            throw new Error("shadow 는 news_reservoir 를 쓰지 않는다")
          },
        }
      }
      if (table === "news_assignments") {
        return {
          select: () => ({ eq: () => ({ in: async () => ({ data: priorRows, error: null }) }) }),
          insert: async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
            inserted.push(...(Array.isArray(rows) ? rows : [rows]))
            return { error: null }
          },
        }
      }
      throw new Error(`예상치 못한 테이블: ${table}`)
    },
  }),
}))

const LONG_BODY =
  "아스날이 에미레이트 스타디움에서 열린 프리미어리그 경기에서 리버풀을 2-0으로 이겼다. 전반 23분 사카가 선제골을 넣었고 후반 78분 마르티넬리가 추가골을 기록했다. 아스날은 이 승리로 승점 3점을 확보했다."

function doc(text: string) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }
}

function seed(id: string, title: string, text = LONG_BODY, source = "https://bbc.com/a") {
  candidateRows.push({ candidate_id: id, state: "drafted" })
  reservoirRows.push({ id, draft: { title, content: doc(text) }, urls: { source } })
  return { id, title, text, source }
}

const VALID_VERDICT = {
  desk: "match",
  priority: 70,
  risk: "low",
  format: "standard",
  required_checks: ["image_required"],
  deadline_minutes: 360,
  decision: "assign",
  reason_codes: ["big_club"],
}

function stubLlm(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => payload,
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const OK_PAYLOAD = {
  choices: [{ message: { content: JSON.stringify(VALID_VERDICT) } }],
  usage: { prompt_tokens: 800, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 0 } },
}

async function call(path = "http://localhost/api/cron/news-assignment-desk") {
  const { GET } = await import("@/app/api/cron/news-assignment-desk/route")
  const { NextRequest } = await import("next/server")
  return GET(
    new NextRequest(path, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  )
}

describe("GET /api/cron/news-assignment-desk", () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.CRON_SECRET = "test-secret"
    process.env.NEWS_ASSIGNMENT_DESK = "shadow"
    process.env.OPENAI_API_KEY = "test-key"
    candidateRows = []
    reservoirRows = []
    priorRows = []
    inserted = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("feature flag 없이는 LLM 을 부르지도, 원장에 쓰지도 않는다 (기본 정지)", async () => {
    delete process.env.NEWS_ASSIGNMENT_DESK
    seed("a", "아스날, 리버풀 격파")
    const fetchMock = stubLlm(OK_PAYLOAD)

    const body = await (await call()).json()

    expect(body.skipped).toContain("정지")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(inserted).toHaveLength(0)
  })

  it("flag 가 'on' 이어도 동작하지 않는다 — 실집행 전환은 별도 커밋에서만 열린다", async () => {
    process.env.NEWS_ASSIGNMENT_DESK = "on"
    seed("a", "아스날, 리버풀 격파")
    const fetchMock = stubLlm(OK_PAYLOAD)

    const body = await (await call()).json()

    expect(body.skipped).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("OPENAI_API_KEY 가 없으면 조용히 0건이 아니라 500 으로 실패한다", async () => {
    delete process.env.OPENAI_API_KEY
    seed("a", "아스날, 리버풀 격파")

    const res = await call()

    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain("OPENAI_API_KEY")
  })

  it("정상 후보는 LLM 판정을 status=ok 로 적재한다 (reservoir 는 건드리지 않는다)", async () => {
    seed("a", "아스날, 리버풀 격파")
    const fetchMock = stubLlm(OK_PAYLOAD)

    const body = await (await call()).json()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(body.settled).toBe(1)
    expect(body.persisted).toBe(1)
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      candidate_id: "a",
      outcome: "assign",
      status: "ok",
      desk: "match",
      model: "gpt-4o-mini",
    })
    expect(inserted[0].estimated_cost_usd).toBeGreaterThan(0)
  })

  it("규칙으로 답이 정해진 후보는 LLM 을 부르지 않는다 (호출 절감)", async () => {
    seed("a", "아스날 위민, WSL 개막전 승리")
    const fetchMock = stubLlm(OK_PAYLOAD)

    const body = await (await call()).json()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(body.ruleCalls).toBe(1)
    expect(body.llmCalls).toBe(0)
    expect(inserted[0]).toMatchObject({
      outcome: "reject",
      model: "rule:v2",
      estimated_cost_usd: 0,
    })
  })

  it("같은 소식의 재탕은 LLM 없이 중복으로 접는다 (v2 — 회차 안 제목 누적)", async () => {
    seed("a", "뉴캐슬, 아스날과 브루노 기마랑이스 7500만 파운드 이적 협상")
    seed("b", "[Lee Ryder] 뉴캐슬, 아스날과 브루노 기마랑이스 7500만 파운드 협상 논의")
    const fetchMock = stubLlm(OK_PAYLOAD)

    const body = await (await call()).json()

    // 첫 건만 LLM, 두 번째는 규칙으로 중복 처리 → 호출 1회 절감
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(body.ruleCalls).toBe(1)
    const dup = inserted.find((r) => r.outcome === "duplicate")
    expect(dup).toMatchObject({ candidate_id: "b", model: "rule:v2", status: "ok" })
    expect(dup?.reason_codes).toEqual(["duplicate_recent"])
  })

  it("같은 (후보, 내용, 프롬프트 버전)이 이미 종착이면 다시 판정하지 않는다", async () => {
    const seeded = seed("a", "아스날, 리버풀 격파")
    priorRows = [
      {
        candidate_id: "a",
        content_hash: assignmentContentHash({
          title: seeded.title,
          body: seeded.text,
          sourceUrl: seeded.source,
        }),
        status: "ok",
      },
    ]
    const fetchMock = stubLlm(OK_PAYLOAD)

    const body = await (await call()).json()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(body.assessed).toBe(0)
    expect(body.skipCounts.already_assessed).toBe(1)
  })

  it("dead_letter 로 끝난 후보도 다시 부르지 않는다", async () => {
    const seeded = seed("a", "아스날, 리버풀 격파")
    priorRows = [
      {
        candidate_id: "a",
        content_hash: assignmentContentHash({
          title: seeded.title,
          body: seeded.text,
          sourceUrl: seeded.source,
        }),
        status: "dead_letter",
      },
    ]
    const fetchMock = stubLlm(OK_PAYLOAD)

    await call()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("일시 실패는 retry_wait 로 남고 사유를 보존한다", async () => {
    seed("a", "아스날, 리버풀 격파")
    stubLlm({}, { ok: false, status: 429 })

    const body = await (await call()).json()

    expect(body.retryWait).toBe(1)
    expect(body.settled).toBe(0)
    expect(inserted[0]).toMatchObject({
      outcome: "llm_error",
      status: "retry_wait",
      attempt: 1,
      desk: null,
    })
    expect(inserted[0].error).toContain("429")
  })

  it("재시도 상한을 넘긴 실패는 dead_letter 로 내린다", async () => {
    const seeded = seed("a", "아스날, 리버풀 격파")
    const hash = assignmentContentHash({
      title: seeded.title,
      body: seeded.text,
      sourceUrl: seeded.source,
    })
    priorRows = [
      { candidate_id: "a", content_hash: hash, status: "retry_wait" },
      { candidate_id: "a", content_hash: hash, status: "retry_wait" },
    ]
    stubLlm({}, { ok: false, status: 503 })

    const body = await (await call()).json()

    expect(body.deadLetter).toBe(1)
    expect(inserted[0]).toMatchObject({ status: "dead_letter", attempt: 3 })
  })

  it("인증 오류는 재시도 없이 즉시 dead_letter (예산 낭비 방지)", async () => {
    seed("a", "아스날, 리버풀 격파")
    stubLlm({}, { ok: false, status: 401 })

    const body = await (await call()).json()

    expect(body.deadLetter).toBe(1)
    expect(inserted[0]).toMatchObject({ status: "dead_letter", attempt: 1 })
  })

  it("dry=1 은 판정만 하고 적재하지 않는다", async () => {
    seed("a", "아스날, 리버풀 격파")
    stubLlm(OK_PAYLOAD)

    const body = await (await call("http://localhost/api/cron/news-assignment-desk?dry=1")).json()

    expect(body.dry).toBe(true)
    expect(body.assessed).toBe(1)
    expect(body.persisted).toBe(0)
    expect(inserted).toHaveLength(0)
  })

  it("reservoir 행이 없는 후보는 사유와 함께 건너뛴다 (무기록 탈락 금지)", async () => {
    candidateRows.push({ candidate_id: "ghost", state: "drafted" })
    stubLlm(OK_PAYLOAD)

    const body = await (await call()).json()

    expect(body.skipCounts.reservoir_row_missing).toBe(1)
    expect(inserted).toHaveLength(0)
  })

  it("CRON_SECRET 없는 요청은 401", async () => {
    const { GET } = await import("@/app/api/cron/news-assignment-desk/route")
    const { NextRequest } = await import("next/server")
    const res = await GET(new NextRequest("http://localhost/api/cron/news-assignment-desk"))
    expect(res.status).toBe(401)
  })
})
