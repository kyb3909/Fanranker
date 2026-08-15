import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseLineupPayload } from "@/lib/soccerway/lineup"
import { extractLivesportEventIds } from "@/lib/soccerway/match-page"

// 실측 픽스처 — 2026-08-16, Sheffield Utd v Birmingham (dlie2 응답 원본)
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "lineup-dlie2.json"), "utf8")
) as unknown

describe("parseLineupPayload — dlie2 응답 파싱", () => {
  it("실측 픽스처: 홈/원정·포메이션·선발 11·벤치를 뽑는다", () => {
    const r = parseLineupPayload(FIXTURE)
    expect(r).not.toBeNull()
    expect(r!.home.teamNameEn).toBe("Sheffield Utd")
    expect(r!.home.side).toBe("HOME")
    expect(r!.away.teamNameEn).toBe("Birmingham")
    expect(r!.home.formation).toBe("4-2-2-2")
    expect(r!.away.formation).toBe("4-2-3-1")
    expect(r!.home.starters).toHaveLength(11)
    expect(r!.away.starters).toHaveLength(11)
    expect(r!.home.bench.length).toBeGreaterThan(0)
    // 선수 필드 — 이름·등번호·로마자 풀네임(참가자 url 슬러그)
    const gk = r!.home.starters[0]
    expect(gk.name).toBe("Cooper M.")
    expect(gk.number).toBe(1)
    expect(gk.romanizedFull).toBe("cooper michael")
  })

  it("깨진 페이로드는 전부 null (fail-open)", () => {
    expect(parseLineupPayload(null)).toBeNull()
    expect(parseLineupPayload({})).toBeNull()
    expect(parseLineupPayload({ data: {} })).toBeNull()
    expect(parseLineupPayload({ data: { findEventById: { eventParticipants: [] } } })).toBeNull()
    // lineup 이 null (라인업 미발표 상태의 실제 모양)
    expect(
      parseLineupPayload({
        data: {
          findEventById: {
            eventParticipants: [
              { name: "A", type: { side: "HOME" }, lineup: null },
              { name: "B", type: { side: "AWAY" }, lineup: null },
            ],
          },
        },
      })
    ).toBeNull()
  })

  it("선발이 11명이 아니면 부분 데이터로 보고 null — 반쪽 라인업 노출 금지", () => {
    // 픽스처에서 홈 선발 하나를 제거한 사본
    const clone = JSON.parse(JSON.stringify(FIXTURE)) as {
      data: {
        findEventById: {
          eventParticipants: { lineup: { groups: { groupType: string; playerIds: string[] }[] } }[]
        }
      }
    }
    const g = clone.data.findEventById.eventParticipants[0].lineup.groups.find(
      (x) => x.groupType === "STARTERS"
    )!
    g.playerIds = g.playerIds.slice(0, 10)
    expect(parseLineupPayload(clone)).toBeNull()
  })
})

describe("extractLivesportEventIds — HTML 앵커 추출", () => {
  it("event_id_c 앵커와 pageinfo 앵커를 순서대로, 중복 없이", () => {
    const html = `
      <script>foo = {"event":"pageinfo","sport":"soccer","type":"detail_page","id":"dj140ofe","stage":"4"}</script>
      <script>window.environment = {"event_id_c":"dj140ofe","eventStage":12}</script>`
    expect(extractLivesportEventIds(html)).toEqual(["dj140ofe"])
  })

  it("앵커가 다르면 둘 다 후보로 (채택은 호출자의 팀명 대조 몫)", () => {
    const html = `
      {"event":"pageinfo","type":"detail_page","id":"aaaa1111"}
      window.environment = {"event_id_c":"bbbb2222"}`
    expect(extractLivesportEventIds(html)).toEqual(["bbbb2222", "aaaa1111"])
  })

  it("팀 해시 등 무관한 8자 id 는 줍지 않는다 (전수 스캔 금지)", () => {
    const html = `<link rel="canonical" href="/match/birmingham-SWk4muv7/sheffield-utd-MeKPSerA/">
      {"id":"SWk4muv7"} {"id":"MeKPSerA"}`
    expect(extractLivesportEventIds(html)).toEqual([])
  })
})
