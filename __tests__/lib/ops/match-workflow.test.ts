import { describe, it, expect } from "vitest"
import { auditDb, auditGame, auditLfa } from "../../helpers/audit-db"
import {
  groupAuditMatches,
  loadAuditMatchGroups,
  loadAuditGamesByIds,
} from "@/lib/ops/match-identities"
import { inspectMatchWorkflow } from "@/lib/ops/match-workflow"
import { findDuplicateReports } from "@/lib/ops/match-report-dup"

const FROM = "2026-09-09T18:00:00Z",
  TO = "2026-09-09T21:00:00Z"
const games = [auditGame(), auditGame("betman-b")]
const saved = auditLfa()
const tables = () => ({
  betman_games: games,
  lfa_fixtures: [saved],
  match_details_cache: [
    {
      game_id: "betman-a",
      lfa_match_id: "provider-lfa-uuid",
      finished: false,
      payload: { homeScore: 1, awayScore: 1, stats: [] },
      updated_at: "2026-09-10T01:00:00Z",
    },
    {
      game_id: saved.id,
      lfa_match_id: saved.lfa_match_id,
      finished: true,
      payload: { homeScore: 6, awayScore: 3, stats: [{}] },
      updated_at: "2026-09-09T22:00:00Z",
    },
  ],
  match_lineups: [{ game_id: saved.id, payload: { status: "ready", projected: false } }],
  posts: [{ match_game_id: saved.id, deleted_at: null }],
  match_reports: [{ game_id: saved.id }],
  polls: [{ game_id: null, match_key: `lfa_${saved.lfa_match_id}`, kind: "motm" }],
})

describe("경기 워크플로우 관측", () => {
  it("킥오프 차이·다른 대표 마켓에도 LFA UUID의 모든 산출물을 한 경기로 확인한다", async () => {
    const { db, writes } = auditDb(tables())
    const groups = await loadAuditMatchGroups(db, FROM, TO)
    expect(groups).toHaveLength(1)
    expect(groups[0].ids).toEqual(["betman-a", "betman-b", "lfa-uuid"])
    const result = await inspectMatchWorkflow(db, groups)
    expect(result.errors).toEqual([])
    expect(result.rows[0].evidence).toEqual({
      id: true,
      lineup: true,
      thread: true,
      score: true,
      stat: true,
      motm: true,
      report: true,
    })
    expect(writes).toEqual([])
  })
  it("같은 팀·시각이라도 저장된 연결이 없으면 추측으로 합치지 않는다", () => {
    const groups = groupAuditMatches(games, [
      { ...saved, betman_game_id: null, match_time: games[0].match_time },
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].ids).not.toContain(saved.id)
  })
  it("베트맨이 없는 LFA 전용 경기도 검사하고 실제 누락만 거짓으로 표시한다", async () => {
    const { db } = auditDb({ lfa_fixtures: [auditLfa("only", null)] })
    const groups = await loadAuditMatchGroups(db, FROM, TO)
    const { rows, errors } = await inspectMatchWorkflow(db, groups)
    expect(groups).toHaveLength(1)
    expect(errors).toEqual([])
    expect(rows[0].evidence).toEqual({
      id: true,
      lineup: false,
      thread: false,
      score: false,
      stat: false,
      motm: false,
      report: false,
    })
  })
  it("같은 대진의 다른 날짜 경기를 섞지 않는다", () => {
    const groups = groupAuditMatches(
      [...games, { ...auditGame("tomorrow"), match_time: "2026-09-10T19:00:00Z" }],
      [saved]
    )
    expect(groups).toHaveLength(2)
    expect(groups.find((g) => g.ids.includes("tomorrow"))?.ids).toEqual(["tomorrow"])
  })
  it("조회 창 밖으로 킥오프가 이동해도 저장된 연결을 찾는다", async () => {
    const { db } = auditDb(tables())
    expect((await loadAuditMatchGroups(db, FROM, "2026-09-09T19:05:00Z"))[0].ids).toContain(
      saved.id
    )
    // Only LFA falls in this window: find the linked Betman anchor outside it as well.
    expect((await loadAuditMatchGroups(db, "2026-09-09T19:10:00Z", TO))[0].ids).toEqual(
      expect.arrayContaining(["betman-a", "betman-b", saved.id])
    )
  })
  it("LFA/베트맨 ID에 각각 생긴 중복 리포트를 같은 경기로 판정한다", async () => {
    const { db } = auditDb(tables())
    const metadata = await loadAuditGamesByIds(db, ["betman-a", saved.id])
    const duplicates = findDuplicateReports(
      [
        { gameId: "betman-a", eventId: null, title: "A" },
        { gameId: saved.id, eventId: null, title: "B" },
      ],
      metadata
    )
    expect(duplicates).toHaveLength(1)
    expect(duplicates[0].gameIds).toEqual(["betman-a", saved.id])
  })
  it.each(["match_details_cache", "match_lineups", "posts", "match_reports", "polls"])(
    "%s 조회 실패는 해당 단계를 확인 불가로 표시한다",
    async (table) => {
      const { db, state } = auditDb(tables())
      const groups = await loadAuditMatchGroups(db, FROM, TO)
      state.fail = table
      const result = await inspectMatchWorkflow(db, groups)
      const fields = {
        match_details_cache: ["score", "stat"],
        match_lineups: ["lineup"],
        posts: ["thread"],
        match_reports: ["report"],
        polls: ["motm"],
      } as const
      for (const field of fields[table as keyof typeof fields])
        expect(result.rows[0].evidence[field]).toBeNull()
      expect(result.errors).toHaveLength(1)
    }
  )
  it.each(["betman_games", "lfa_fixtures"])(
    "%s 조회 실패는 빈 경기 목록으로 바꾸지 않는다",
    async (table) => {
      const { db, state } = auditDb(tables())
      state.fail = table
      await expect(loadAuditMatchGroups(db, FROM, TO)).rejects.toThrow("DB unavailable")
    }
  )
  it("삭제된 불판·예상 라인업·일반 투표는 정상 산출물로 세지 않는다", async () => {
    const t = tables()
    t.match_lineups[0].payload.projected = true
    t.polls[0].kind = "general"
    const { db } = auditDb({ ...t, posts: [{ ...t.posts[0], deleted_at: "2026-09-10T00:00:00Z" }] })
    const { rows } = await inspectMatchWorkflow(db, await loadAuditMatchGroups(db, FROM, TO))
    expect(rows[0].evidence).toMatchObject({
      thread: false,
      lineup: false,
      motm: false,
      report: true,
    })
  })
  it("MOTM은 LFA 키뿐 아니라 형제 ID와 기존 베트맨 키도 인정한다", async () => {
    for (const poll of [
      { game_id: "betman-b", match_key: "unrelated-format", kind: "motm" },
      { game_id: null, match_key: "첼시_리즈 유나이티드_2026-09-09T19:00:00+00:00", kind: "motm" },
    ]) {
      const { db } = auditDb({ ...tables(), polls: [poll] })
      const result = await inspectMatchWorkflow(db, await loadAuditMatchGroups(db, FROM, TO))
      expect(result.rows[0].evidence.motm).toBe(true)
    }
  })
  it("한 페이지를 넘긴 경기 목록도 빠짐없이 읽는다", async () => {
    const { db, reads } = auditDb({
      betman_games: Array.from({ length: 501 }, (_, i) => auditGame(`game-${i}`)),
    })
    expect((await loadAuditMatchGroups(db, FROM, TO))[0].ids).toHaveLength(501)
    expect(reads).toContainEqual({ table: "betman_games", offset: 500 })
  })
})
