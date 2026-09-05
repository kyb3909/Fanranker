import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  summary: vi.fn(),
  lineup: vi.fn(),
  soccerway: vi.fn(),
  store: vi.fn(),
  stored: null as unknown,
}))
vi.mock("@/lib/match/get-match", () => ({ getMatchByGameId: m.summary }))
vi.mock("@/lib/match/sibling-ids", () => ({ getSiblingGameIds: async () => ["fixture-uuid"] }))
vi.mock("@/lib/lfa/match", () => ({ getLfaMatchInfo: vi.fn() }))
vi.mock("@/lib/lfa/lineups", () => ({
  getLfaLineup: m.lineup,
  getTeamSquadNames: async () => [],
  localizePlayerName: (s: string) => s,
}))
vi.mock("@/lib/soccerway/lineup-lookup", () => ({
  getLineupForGame: m.soccerway,
  storeLineupPayload: m.store,
}))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        in: async () => ({
          data: m.stored
            ? [
                {
                  game_id: "fixture-uuid",
                  event_id: "lfa-cup",
                  payload: m.stored,
                  updated_at: new Date().toISOString(),
                },
              ]
            : [],
        }),
      }),
    }),
  }),
}))
import { getMatchLineup } from "@/lib/match/get-lineup"

describe("LFA 전용 경기 라인업", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.stored = null
    m.summary.mockResolvedValue({
      source: "lfa",
      lfaMatchId: "lfa-cup",
      gameId: "fixture-uuid",
      homeTeam: "맨시티",
      awayTeam: "하부리그",
      matchTime: "2026-09-05T18:00:00Z",
    })
    m.lineup.mockResolvedValue({
      projected: false,
      home: { starters: [], bench: [] },
      away: { starters: [], bench: [] },
    })
  })
  it("베트맨/Soccerway 없이 LFA ID로 받아 같은 저장소에 저장한다", async () => {
    expect(await getMatchLineup("fixture-uuid")).toMatchObject({
      status: "ready",
      projected: false,
    })
    expect(m.lineup).toHaveBeenCalledWith("lfa-cup", "맨시티", "하부리그")
    expect(m.store).toHaveBeenCalledWith(
      "fixture-uuid",
      "lfa-cup",
      expect.objectContaining({ status: "ready" })
    )
    expect(m.soccerway).not.toHaveBeenCalled()
  })
  it("예상 라인업은 표시하되 저장하지 않는다", async () => {
    m.lineup.mockResolvedValue({
      projected: true,
      home: { starters: [], bench: [] },
      away: { starters: [], bench: [] },
    })
    expect(await getMatchLineup("fixture-uuid")).toMatchObject({ status: "ready", projected: true })
    expect(m.store).not.toHaveBeenCalled()
  })
  it("미발표·일시 실패는 pending으로 재시도를 허용한다", async () => {
    m.lineup.mockResolvedValue(null)
    expect(await getMatchLineup("fixture-uuid")).toMatchObject({ status: "pending" })
    m.lineup.mockRejectedValue(new Error("timeout"))
    expect(await getMatchLineup("fixture-uuid")).toMatchObject({ status: "pending" })
  })
  it("확정 저장분은 피드 없이도 다시 읽힌다", async () => {
    m.stored = {
      status: "ready",
      projected: false,
      home: { teamLabel: "맨시티", starters: [], bench: [{}] },
      away: { teamLabel: "하부리그", starters: [], bench: [{}] },
    }
    expect(await getMatchLineup("fixture-uuid")).toBe(m.stored)
    expect(m.lineup).not.toHaveBeenCalled()
  })
})
