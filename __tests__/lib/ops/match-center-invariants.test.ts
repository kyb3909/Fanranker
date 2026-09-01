import { describe, it, expect } from "vitest"
import { findDuplicateReports } from "@/lib/ops/match-report-dup"
import { assessMotmCoverage } from "@/lib/ops/motm-coverage"
import { findFixableTimelineNames, assessTimelineLatin } from "@/lib/ops/timeline-latin"
import { matchKeyOf } from "@/lib/match/match-key"

/**
 * 고정 시험지 = 2026-09-01 실사고. 세 규칙 모두 "그때 울었어야 하는가"로 검증한다.
 */

/* ── match_key ── */
describe("matchKeyOf", () => {
  it("polls.match_key 와 글자 단위로 같은 형식이다 — 형식이 갈리면 폴 결번 오탐이 전량 난다", () => {
    const parts = {
      homeTeam: "애스턴 빌라",
      awayTeam: "아스널",
      matchTime: "2026-08-31T19:00:00+00:00",
    }
    expect(matchKeyOf(parts)).toBe("애스턴 빌라_아스널_2026-08-31T19:00:00+00:00")
  })
})

/* ── 8. match_report_dup ── */
describe("findDuplicateReports", () => {
  const games = [
    { id: "g1", homeTeam: "US레체", awayTeam: "AS로마", matchTime: "2026-08-31T16:30:00+00:00" },
    { id: "g2", homeTeam: "US레체", awayTeam: "AS로마", matchTime: "2026-08-31T16:30:00+00:00" },
    { id: "g3", homeTeam: "US레체", awayTeam: "AS로마", matchTime: "2026-08-31T16:30:00+00:00" },
    {
      id: "h1",
      homeTeam: "애스턴 빌라",
      awayTeam: "아스널",
      matchTime: "2026-08-31T19:00:00+00:00",
    },
  ]

  it("실사고 재현 — 형제 행 3개에 붙은 리포트를 한 경기로 접어 잡는다", () => {
    const dups = findDuplicateReports(
      [
        { gameId: "g1", eventId: "E1", title: "말런 멀티골… AS로마 4골 완승" },
        { gameId: "g2", eventId: "E1", title: "AS로마, US레체 원정에서 4골 완승" },
        { gameId: "g3", eventId: "E1", title: "AS로마, US레체 원정에서 4골 완승" },
        { gameId: "h1", eventId: "E2", title: "사카 결승골" },
      ],
      games
    )
    expect(dups).toHaveLength(1)
    expect(dups[0].gameIds).toHaveLength(3)
    expect(dups[0].label).toBe("US레체 vs AS로마")
    // 제목 2종 = 지면마다 내용이 다르다는 신호
    expect(dups[0].titles).toHaveLength(2)
  })

  it("경기당 1건이면 조용하다", () => {
    expect(
      findDuplicateReports([{ gameId: "h1", eventId: "E2", title: "사카 결승골" }], games)
    ).toEqual([])
  })

  it("betman 행이 사라진 고아 리포트는 event_id 로 접는다 — 안 그러면 가장 오래 방치된 중복이 빠진다", () => {
    const dups = findDuplicateReports(
      [
        { gameId: "gone1", eventId: "E9", title: "A" },
        { gameId: "gone2", eventId: "E9", title: "A" },
      ],
      []
    )
    expect(dups).toHaveLength(1)
    expect(dups[0].key).toBe("event:E9")
  })

  it("경기도 이벤트도 모르면 세지 않는다 (근거 없는 경보 금지)", () => {
    expect(findDuplicateReports([{ gameId: "x", eventId: null, title: "A" }], [])).toEqual([])
  })

  it("심한 것부터 정렬 — 경보 본문이 잘려도 최악이 먼저 보인다", () => {
    const dups = findDuplicateReports(
      [
        { gameId: "h1", eventId: "E2", title: "A" },
        { gameId: "h1b", eventId: "E2", title: "A" },
        { gameId: "g1", eventId: "E1", title: "B" },
        { gameId: "g2", eventId: "E1", title: "B" },
        { gameId: "g3", eventId: "E1", title: "B" },
      ],
      [...games, { ...games[3], id: "h1b" }]
    )
    expect(dups[0].gameIds.length).toBeGreaterThanOrEqual(dups[1]?.gameIds.length ?? 0)
  })
})

/* ── 9. motm_poll_missing ── */
describe("assessMotmCoverage", () => {
  const NOW = Date.parse("2026-09-01T09:00:00Z")
  const ftLongAgo = NOW - 5 * 3600_000 // FT 5시간 전 = 유예 2시간 통과
  const base = { hasLineup: true, hasFtEvidence: true, ftAtMs: ftLongAgo }
  const mk = (n: number, over: Partial<typeof base> = {}) =>
    Array.from({ length: n }, (_, i) => ({
      matchKey: `k${i}`,
      label: `경기 ${i}`,
      ...base,
      ...over,
    }))

  it("실사고 재현 — FT 지난 5경기에 폴이 하나도 없으면 운다", () => {
    const r = assessMotmCoverage(mk(5), new Set(), NOW)
    expect(r.eligible).toBe(5)
    expect(r.missing).toHaveLength(5)
    expect(r.alert).toBe(true)
  })

  it("전부 만들어졌으면 조용하다", () => {
    const cands = mk(6)
    const have = new Set(cands.map((c) => c.matchKey))
    expect(assessMotmCoverage(cands, have, NOW).alert).toBe(false)
  })

  it("⚠️ 라인업이 없으면 폴이 없는 게 정상 — 자격에서 뺀다", () => {
    const r = assessMotmCoverage(mk(8, { hasLineup: false }), new Set(), NOW)
    expect(r.eligible).toBe(0)
    expect(r.alert).toBe(false)
  })

  it("⚠️ FT 증거가 없으면 연기·취소 잔재다 — 자격에서 뺀다", () => {
    const r = assessMotmCoverage(mk(8, { hasFtEvidence: false }), new Set(), NOW)
    expect(r.eligible).toBe(0)
    expect(r.alert).toBe(false)
  })

  it("유예 2시간 안이면 아직 세지 않는다 (생성 크론 15분 주기 존중)", () => {
    const justEnded = mk(8, { ftAtMs: NOW - 30 * 60_000 })
    expect(assessMotmCoverage(justEnded, new Set(), NOW).eligible).toBe(0)
  })

  it("모수가 적으면 비율이 요동친다 — 4경기 전멸도 아직 안 운다", () => {
    expect(assessMotmCoverage(mk(4), new Set(), NOW).alert).toBe(false)
  })

  it("결번율 40% 미만이면 조용 — 얇은 라인업 경기의 정당한 스킵을 늑대소년으로 만들지 않는다", () => {
    const cands = mk(10)
    const have = new Set(cands.slice(0, 7).map((c) => c.matchKey)) // 3/10 = 30%
    const r = assessMotmCoverage(cands, have, NOW)
    expect(r.ratio).toBeCloseTo(0.3)
    expect(r.alert).toBe(false)
  })
})

/* ── 10. timeline_name_latin ── */
describe("findFixableTimelineNames", () => {
  const roster = [
    { label: "마틴 외데고르", roman: "odegaard martin" },
    { label: "부카요 사카", roman: "saka bukayo" },
    { label: "라스무스 호일룬", roman: "hojlund rasmus" },
  ]

  it("실사고 재현 — Ø 때문에 영문으로 남은 이름을 '고칠 수 있는 것'으로 잡는다", () => {
    const out = findFixableTimelineNames(
      [{ minute: "71", player: "M. Ødegaard", inPlayer: "미켈 메리노" }],
      roster,
      "애스턴 빌라 vs 아스널"
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ before: "M. Ødegaard", after: "마틴 외데고르", minute: "71" })
  })

  it("⚠️ 사전에 없는 선수는 세지 않는다 — 이게 배경으로 깔리면 임계값을 못 세운다", () => {
    expect(
      findFixableTimelineNames([{ minute: "30", player: "L. Østigård" }], roster, "x")
    ).toEqual([])
  })

  it("이미 한글이면 대상 아님", () => {
    expect(
      findFixableTimelineNames([{ minute: "59", player: "부카요 사카" }], roster, "x")
    ).toEqual([])
  })

  it("같은 선수가 여러 이벤트에 나와도 한 번만 센다", () => {
    const out = findFixableTimelineNames(
      [
        { minute: "30", player: "R. Højlund" },
        { minute: "80", player: "R. Højlund" },
      ],
      roster,
      "x"
    )
    expect(out).toHaveLength(1)
  })

  it("로스터가 없으면 대조 근거가 없다 — 조용히 넘어간다", () => {
    expect(findFixableTimelineNames([{ player: "M. Ødegaard" }], [], "x")).toEqual([])
  })

  it("assist·inPlayer 도 본다", () => {
    const out = findFixableTimelineNames(
      [{ minute: "59", player: "부카요 사카", assist: "M. Ødegaard" }],
      roster,
      "x"
    )
    expect(out.map((n) => n.before)).toEqual(["M. Ødegaard"])
  })
})

describe("assessTimelineLatin", () => {
  const n = (i: number) => ({ label: `m${i}`, minute: "1", before: "X", after: "한글" })

  it("이름 5개 이상이면 운다", () => {
    expect(assessTimelineLatin([[n(1), n(2), n(3), n(4), n(5)]]).alert).toBe(true)
  })

  it("경기 3개 이상이면 이름이 적어도 운다 (넓게 퍼진 것이 더 나쁘다)", () => {
    const v = assessTimelineLatin([[n(1)], [n(2)], [n(3)]])
    expect(v.matchCount).toBe(3)
    expect(v.alert).toBe(true)
  })

  it("한두 건은 타이밍 잔재일 수 있다 — 조용하다", () => {
    expect(assessTimelineLatin([[n(1)], [n(2)], []]).alert).toBe(false)
  })

  it("깨끗하면 조용하다", () => {
    expect(assessTimelineLatin([[], [], []]).alert).toBe(false)
  })
})
