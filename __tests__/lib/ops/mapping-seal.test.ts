import { describe, expect, it } from "vitest"
import { findSealedMappings, type MappingAttemptRow } from "@/lib/ops/mapping-seal"

const game = (id: string, home = "베르더 브레멘", away = "RB라이프치히") => ({
  id,
  homeTeam: home,
  awayTeam: away,
  matchTime: "2026-09-05T13:30:00+00:00",
  leagueCode: "분데스리",
})
const attempt = (
  gameId: string,
  outcome: string,
  status: string,
  createdAt: string,
  extra: Partial<MappingAttemptRow> = {}
): MappingAttemptRow => ({
  gameId,
  outcome,
  status,
  createdAt,
  candidateUrl: null,
  error: null,
  ...extra,
})

describe("findSealedMappings — 봉인된 Soccerway 매핑 판정", () => {
  it("실사고 재현 — 형제 행 전부가 no_candidate(ok) 면 경기 하나로 접어 잡는다", () => {
    const url = "https://www.soccerway.com/match/lfa_cu0e-lfa_cu0e/rb-leipzig-KbS1suSm/"
    const out = findSealedMappings(
      [game("m1"), game("m2"), game("m3")],
      [
        attempt("m1", "no_candidate", "ok", "2026-09-04T18:41:00Z", { candidateUrl: url }),
        attempt("m2", "no_candidate", "ok", "2026-09-04T18:41:01Z", { candidateUrl: url }),
        attempt("m3", "no_candidate", "ok", "2026-09-04T18:41:02Z", { candidateUrl: url }),
      ]
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      label: "베르더 브레멘 vs RB라이프치히",
      gameIds: ["m1", "m2", "m3"],
      outcome: "no_candidate",
      candidateUrl: url,
      sealedAt: "2026-09-04T18:41:02Z",
    })
  })

  it("어느 형제에든 proposed 가 있으면 봉인이 아니다", () => {
    const out = findSealedMappings(
      [game("m1"), game("m2")],
      [
        attempt("m1", "no_candidate", "ok", "2026-09-04T18:41:00Z"),
        attempt("m2", "proposed", "ok", "2026-09-04T17:41:00Z"),
      ]
    )
    expect(out).toEqual([])
  })

  it("마지막 판정이 재시도 대기(retry_wait)·발견 순환(team_unresolved)이면 아직 열려 있다", () => {
    expect(
      findSealedMappings(
        [game("m1")],
        [
          attempt("m1", "no_candidate", "ok", "2026-09-04T18:41:00Z"),
          attempt("m1", "fetch_error", "retry_wait", "2026-09-04T19:41:00Z"),
        ]
      )
    ).toEqual([])
    expect(
      findSealedMappings(
        [game("m1")],
        [attempt("m1", "team_unresolved", "ok", "2026-09-04T18:41:00Z")]
      )
    ).toEqual([])
  })

  it("dead_letter(fetch 2회 실패)는 봉인이다", () => {
    const out = findSealedMappings(
      [game("m1")],
      [attempt("m1", "fetch_error", "dead_letter", "2026-09-04T19:41:00Z", { error: "HTTP 503" })]
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ status: "dead_letter", error: "HTTP 503" })
  })

  it("시도가 없는 경기는 세지 않는다 — 봉인이 아니라 아직 안 본 것이다", () => {
    expect(findSealedMappings([game("m1")], [])).toEqual([])
  })

  it("킥오프 순으로 정렬한다", () => {
    const later = { ...game("x", "A", "B"), matchTime: "2026-09-06T13:30:00+00:00" }
    const out = findSealedMappings(
      [later, game("m1")],
      [
        attempt("x", "ambiguous", "ok", "2026-09-04T18:41:00Z"),
        attempt("m1", "no_candidate", "ok", "2026-09-04T18:41:00Z"),
      ]
    )
    expect(out.map((s) => s.label)).toEqual(["베르더 브레멘 vs RB라이프치히", "A vs B"])
  })
})
