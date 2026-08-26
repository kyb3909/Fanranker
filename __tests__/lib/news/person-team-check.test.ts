import { describe, expect, it } from "vitest"
import {
  buildSquadIndex,
  buildTeamIndex,
  checkPersonsAgainstTeams,
  teamsMentioned,
} from "@/lib/news/person-team-check"

/** 실제 team_dictionary 행에서 가져온 값 (2026-08-26) */
const teams = buildTeamIndex([
  { soccerway_team_id: "Wtn9Stg0", name_kr: "맨체스터 시티", aliases_kr: ["맨시티"] },
  { soccerway_team_id: "ppjDR086", name_kr: "맨체스터 유나이티드", aliases_kr: ["맨유"] },
  { soccerway_team_id: "8Sa8HInO", name_kr: "AC밀란", aliases_kr: ["AC 밀란", "밀란"] },
  { soccerway_team_id: "lId4TMwf", name_kr: "리버풀", aliases_kr: [] },
])

const squads = buildSquadIndex([
  { name_kr: "루벤 디아스", soccerway_team_id: "Wtn9Stg0" },
  { name_kr: "엘링 홀란드", soccerway_team_id: "Wtn9Stg0" },
  { name_kr: "해리 매과이어", soccerway_team_id: "ppjDR086" },
  { name_kr: "마커스 래시퍼드", soccerway_team_id: "ppjDR086" },
  { name_kr: "루벤 로프터스-치크", soccerway_team_id: "8Sa8HInO" },
  { name_kr: "커티스 존스", soccerway_team_id: "lId4TMwf" },
  { name_kr: "트레이 뇨니", soccerway_team_id: "lId4TMwf" },
])

/**
 * 본문은 오늘 실제로 오염됐던 기사의 문장이다 (2026-08-26 수리 전 상태).
 * 사전만 보는 게이트는 이걸 전부 통과시켰다 — "루벤 디아스"는 사전에 있으니까.
 */
describe("오늘 오염됐던 기사 — 스쿼드로 보면 걸린다", () => {
  it("맨유 전임 감독을 맨시티 수비수로 적었다", () => {
    // ⚠️ 제목 + 본문을 **함께** 넘겨야 한다. 실제 기사에서 팀 이름이 제목에만 있는
    //    경우가 흔하다 — 본문만 보면 팀이 안 잡혀 검사가 통째로 무력해진다.
    const text =
      "[BBC] 매과이어, 래시퍼드의 맨유 잔류 희망하며 그의 팀 기여도 강조\n" +
      "매과이어는 이번 시즌 부주장 가능성도 내비쳤으며, 전임 감독 루벤 디아스에게도 따뜻한 말을 전했습니다."
    const r = checkPersonsAgainstTeams(text, ["해리 매과이어", "루벤 디아스"], squads, teams)
    expect(r.teamsInArticle).toContain("ppjDR086")
    expect(r.suspects.map((s) => s.person)).toEqual(["루벤 디아스"])
  })

  it("밀란 경기 장면에 맨시티 선수를 적었다", () => {
    const text =
      "밀란의 마지막 골 역시 왼쪽 측면에서 나왔는데, 리산드로 마르티네스가 루벤 디아스에게 돌파를 허용했다."
    const r = checkPersonsAgainstTeams(text, ["루벤 디아스"], squads, teams)
    expect(r.suspects).toHaveLength(1)
    expect(r.suspects[0]).toMatchObject({ kind: "wrong_team", belongsTo: ["Wtn9Stg0"] })
  })

  it("리버풀 유망주 자리에 은퇴 선수를 적었다 — 어느 스쿼드에도 없다", () => {
    const text = "리버풀은 트로이 디니가 커티스 존스의 대체자로 긍정적인 평가를 받고 있다."
    const r = checkPersonsAgainstTeams(text, ["트로이 디니", "커티스 존스"], squads, teams)
    expect(r.verdicts.find((v) => v.person === "트로이 디니")?.kind).toBe("not_in_any_squad")
    expect(r.verdicts.find((v) => v.person === "커티스 존스")?.kind).toBe("ok")
  })
})

describe("정상 기사는 안 걸린다 — 헛짚으면 발행이 멈춘다", () => {
  it("이적 기사는 남의 팀 선수를 말한다 (그 팀도 같이 나온다)", () => {
    const text =
      "AC 밀란은 수비 강화 차원에서 맨시티의 포르투갈 수비수 루벤 디아스를 영입 후보로 검토 중이다."
    const r = checkPersonsAgainstTeams(text, ["루벤 디아스"], squads, teams)
    expect(r.suspects).toHaveLength(0)
  })

  it("자기 팀 선수 이야기", () => {
    const text = "맨체스터 시티의 엘링 홀란드가 선제골을 넣었다."
    const r = checkPersonsAgainstTeams(text, ["엘링 홀란드"], squads, teams)
    expect(r.suspects).toHaveLength(0)
  })

  it("팀이 하나도 안 잡히면 판정하지 않는다 (협회·리그 일반 소식)", () => {
    const text = "FIFA는 새 대회 방식을 검토 중이라고 밝혔다."
    const r = checkPersonsAgainstTeams(text, ["루벤 디아스"], squads, teams)
    expect(r.teamsInArticle).toHaveLength(0)
    expect(r.suspects).toHaveLength(0)
  })
})

describe("팀 인식", () => {
  it("별칭으로도 잡는다", () => {
    expect(teamsMentioned("맨유가 이겼다", teams)).toContain("ppjDR086")
    expect(teamsMentioned("맨시티가 이겼다", teams)).toContain("Wtn9Stg0")
  })

  it("띄어쓰기가 달라도 잡는다", () => {
    expect(teamsMentioned("AC밀란과 AC 밀란은 같은 팀이다", teams)).toContain("8Sa8HInO")
  })

  it("1글자 별칭은 버리고 2글자 통칭은 살린다", () => {
    const t = buildTeamIndex([
      { soccerway_team_id: "X", name_kr: "인테르", aliases_kr: ["인", "인테"] },
    ])
    expect(t.byName.has("인")).toBe(false) // 낱말 속에 박힌다
    expect(t.byName.has("인테")).toBe(true) // 팀 통칭은 흔한 낱말과 안 겹친다
    expect(t.byName.has("인테르")).toBe(true)
  })
})
