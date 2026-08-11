import { describe, it, expect, vi } from "vitest"
import { createVsPollFromDraft, VS_DAILY_QUOTA } from "@/lib/news/vs-issue"

/**
 * VS 폴 관심도 게이트 + 일 쿼터 회귀 잠금 (2026-08-12).
 *
 * 왜 잠그나: 이 게이트는 "무엇이 사용자에게 보이는가"를 조용히 바꾼다. 꺼지는 방향의
 * 사고(폴이 전부 안 붙음)는 에러도 로그도 안 남기고 그냥 조용해서, 실측 드라이런을
 * 다시 돌리기 전엔 아무도 모른다. 특히 **검수자가 켠 폴을 게이트가 뒤집지 않는다**는
 * 규칙은 사람 손을 무력화하는 종류의 회귀라 반드시 고정한다.
 */

const BIG_CLUB_TITLE = "아스날 감독 거취 논란, 팬덤 두 쪽으로"
const NO_NAME_TITLE = "요르단 축구 협회장, FIFA와 인판티노 협박 혐의 제기"

function makeSupabase({ todayCount = 0 }: { todayCount?: number } = {}) {
  const inserted: Record<string, unknown>[] = []
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    maybeSingle: async () => ({ data: null }),
    insert: async (row: Record<string, unknown>) => {
      inserted.push(row)
      return { error: null }
    },
    // 쿼터 COUNT 질의는 빌더를 그대로 await 한다
    then: (resolve: (v: { count: number }) => unknown) => resolve({ count: todayCount }),
  })
  return { supabase: { from: () => builder } as never, inserted }
}

const proposal = {
  question: "감독을 바꿔야 하나?",
  option_a: "바꿔야 한다",
  option_b: "더 지켜보자",
  summary: ["a", "b", "c"],
  confidence: 0.9,
}

async function run(
  title: string,
  opts: { todayCount?: number; decision?: { enabled?: boolean } | null } = {}
) {
  const { supabase, inserted } = makeSupabase({ todayCount: opts.todayCount })
  await createVsPollFromDraft(supabase, "post-1", title, proposal, opts.decision)
  return inserted[0]
}

describe("VS 폴 게이트", () => {
  it("빅클럽 기사 + 쿼터 여유 → 켜진 채 발행", async () => {
    expect((await run(BIG_CLUB_TITLE))?.is_active).toBe(true)
  })

  it("관심도 미달(무명 주체) → 꺼진 채 저장 — 삭제가 아니라 비노출", async () => {
    const row = await run(NO_NAME_TITLE)
    expect(row?.is_active).toBe(false)
    // 기각 데이터로도 쓰이므로 행 자체는 남아야 한다
    expect(row).toBeDefined()
  })

  it("일 쿼터를 다 쓰면 빅클럽이라도 꺼진다", async () => {
    expect((await run(BIG_CLUB_TITLE, { todayCount: VS_DAILY_QUOTA }))?.is_active).toBe(false)
  })

  it("쿼터 직전 한 자리는 통과한다 (경계)", async () => {
    expect((await run(BIG_CLUB_TITLE, { todayCount: VS_DAILY_QUOTA - 1 }))?.is_active).toBe(true)
  })

  it("검수자가 켰으면 관심도·쿼터가 뒤집지 못한다 (사람이 이긴다)", async () => {
    const row = await run(NO_NAME_TITLE, {
      todayCount: VS_DAILY_QUOTA + 10,
      decision: { enabled: true },
    })
    expect(row?.is_active).toBe(true)
  })

  it("검수자가 껐으면 빅클럽이라도 꺼진다", async () => {
    expect((await run(BIG_CLUB_TITLE, { decision: { enabled: false } }))?.is_active).toBe(false)
  })

  it("confidence 미달이면 빅클럽·쿼터 여유여도 꺼진다", async () => {
    const { supabase, inserted } = makeSupabase()
    await createVsPollFromDraft(
      supabase,
      "post-1",
      BIG_CLUB_TITLE,
      { ...proposal, confidence: 0.5 },
      null
    )
    expect(inserted[0]?.is_active).toBe(false)
  })

  it("저장 실패해도 throw 하지 않는다 (발행은 무사해야 한다)", async () => {
    const bad = {
      from: () => ({
        select: () => bad.from(),
        eq: () => bad.from(),
        gte: () => bad.from(),
        maybeSingle: async () => ({ data: null }),
        insert: async () => ({ error: { message: "boom" } }),
        then: (r: (v: { count: number }) => unknown) => r({ count: 0 }),
      }),
    }
    vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(
      createVsPollFromDraft(bad as never, "post-1", BIG_CLUB_TITLE, proposal, null)
    ).resolves.toBeUndefined()
  })
})
