import { describe, expect, it } from "vitest"
import { auditDb, auditGame, auditLfa } from "@/__tests__/helpers/audit-db"
import { getMatchIdentity } from "@/lib/match/sibling-ids"
import { loadPairingContext } from "@/lib/match/pairing-context"
import { pairLfaFixtures } from "@/lib/match/pair-fixtures"

describe("one stored match identity", () => {
  it("양쪽 URL은 킥오프가 달라도 같은 UUID와 폴 키를 반환한다", async () => {
    const { db } = auditDb({
      betman_games: [auditGame(), auditGame("betman-b")],
      lfa_fixtures: [auditLfa()],
    })
    const a = await getMatchIdentity(db, "betman-a", { strict: true })
    expect(a).toEqual(await getMatchIdentity(db, "lfa-uuid", { strict: true }))
    expect(a.gameIds).toEqual(["betman-a", "betman-b", "lfa-uuid"])
    expect(a.pollKeys).toEqual([
      "lfa_provider-lfa-uuid",
      "첼시_리즈 유나이티드_2026-09-09T19:00:00+00:00",
    ])
  })
  it("명시적 베트맨 연결 전에도 저장된 LFA 번호를 양방향으로 따른다", async () => {
    const { db } = auditDb({
      betman_games: [auditGame(), auditGame("betman-b")],
      lfa_fixtures: [auditLfa("lfa-uuid", null)],
      match_lineups: [
        {
          game_id: "betman-b",
          event_id: "provider-lfa-uuid",
          payload: { source: "lfa", matchId: "provider-lfa-uuid" },
        },
      ],
    })
    expect(await getMatchIdentity(db, "betman-a", { strict: true })).toEqual(
      await getMatchIdentity(db, "lfa-uuid", { strict: true })
    )
    expect((await getMatchIdentity(db, "lfa-uuid", { strict: true })).gameIds).toHaveLength(3)
  })
  it("Soccerway의 같은 event ID는 LFA 신원의 증거로 사용하지 않는다", async () => {
    const { db } = auditDb({
      betman_games: [auditGame()],
      lfa_fixtures: [auditLfa("lfa-uuid", null)],
      match_lineups: [
        { game_id: "betman-a", event_id: "provider-lfa-uuid", payload: { source: "soccerway" } },
      ],
    })
    expect((await getMatchIdentity(db, "lfa-uuid", { strict: true })).gameIds).toEqual(["lfa-uuid"])
    expect((await getMatchIdentity(db, "betman-a", { strict: true })).lfaMatchId).toBeNull()
  })
  it("역조회로 확장한 형제 자료에 다른 LFA 번호가 있으면 쓰기를 중단한다", async () => {
    const { db } = auditDb({
      betman_games: [auditGame(), auditGame("betman-b")],
      lfa_fixtures: [auditLfa("lfa-uuid", null)],
      match_lineups: [
        { game_id: "betman-a", event_id: "provider-lfa-uuid", payload: { source: "lfa" } },
      ],
      match_details_cache: [{ game_id: "betman-b", lfa_match_id: "different-match" }],
    })
    await expect(getMatchIdentity(db, "lfa-uuid", { strict: true })).rejects.toThrow(
      "provider-conflict"
    )
  })
  it("조회 오류는 strict 조회에서 빈 참조로 숨기지 않는다", async () => {
    const { db, state } = auditDb({ betman_games: [auditGame()] })
    state.fail = "match_lineups"
    await expect(getMatchIdentity(db, "betman-a", { strict: true })).rejects.toThrow(
      "DB unavailable"
    )
  })
})

describe("complete shared pairing context", () => {
  const start = "2026-09-09T00:00:00Z",
    end = "2026-09-10T00:00:00Z"
  it("마켓 형제는 한 주장으로 접고 저장된 연결을 우선한다", async () => {
    const { db } = auditDb({
      betman_games: [auditGame(), auditGame("betman-b")],
      lfa_fixtures: [auditLfa()],
      match_lineups: [
        { game_id: "betman-a", event_id: "soccerway", payload: { source: "soccerway" } },
      ],
    })
    const context = await loadPairingContext(db, start, end)
    expect(context.games).toHaveLength(1)
    const candidates = [
      {
        lfaMatchId: "provider-lfa-uuid",
        homeTeam: "changed",
        awayTeam: "changed",
        leagueCode: "잉리그컵",
        matchTime: "2026-09-09T19:15:00Z",
      },
    ]
    const result = pairLfaFixtures(context.games, candidates, context.savedOwners, new Map())
    expect(result.get("betman-a")?.candidate).toBe(candidates[0])
    expect(result.get("betman-b")).toEqual(result.get("betman-a"))
  })
  it("두 실제 경기의 주장은 두 번 모두 보류한다", async () => {
    const { db } = auditDb({
      betman_games: [auditGame(), { ...auditGame("other"), match_time: "2026-09-09T19:20:00Z" }],
    })
    const context = await loadPairingContext(db, start, end)
    const candidate = {
      lfaMatchId: "lfa-one",
      homeTeam: "첼시",
      awayTeam: "리즈 유나이티드",
      leagueCode: "잉리그컵",
      matchTime: "2026-09-09T19:15:00Z",
    }
    const result = pairLfaFixtures(context.games, [candidate], context.savedOwners, new Map())
    expect([...result.values()].every((value) => value.candidate === null)).toBe(true)
  })
  it("500행 이후의 경쟁 경기까지 읽고 중간 실패면 부분 후보로 판단하지 않는다", async () => {
    const tables = {
      betman_games: Array.from({ length: 501 }, (_, index) => ({
        ...auditGame(String(index)),
        home_team_name: `Home ${index}`,
      })),
    }
    const { db, state, reads } = auditDb(tables)
    expect((await loadPairingContext(db, start, end)).games).toHaveLength(501)
    expect(reads.some((r) => r.table === "betman_games" && r.offset === 500)).toBe(true)
    state.fail = "betman_games"
    state.failAfter = 500
    await expect(loadPairingContext(db, start, end)).rejects.toThrow("DB unavailable")
  })
})
