import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { dayFreshnessMs, detailsFreshnessMs } from "@/lib/lfa/day-freshness"
import type { LfaMatch } from "@/lib/lfa/client"

/**
 * 하루치 목록 신선도 = **돈**. 호출 1회가 1크레딧이고, 이 함수가 그 재구매 주기를 정한다.
 *
 * 두 방향 모두 조용히 틀린다:
 *  · 너무 짧게 잡으면 → 경기가 한 경기도 없는 날에도 5분마다 산다 (2026-08-24 실측:
 *    유휴 시간대 시간당 45크레딧 = 하루 1,073, 그날 소모의 절반이 여기서 나갔다)
 *  · 너무 길게 잡으면 → 킥오프를 자면서 놓쳐 라이브 스코어가 멈춘다
 *
 * 그래서 불변식 하나를 여기서 못 박는다: **유휴 주기(30분) < 킥오프 예열창(45분)**.
 */

const DATE = "2026-08-24"
const at = (hhmm: string) => new Date(`${DATE}T${hhmm}:00.000Z`).getTime()

const EPL = "2kwbbcootiqqgmrzs6o5inle5" // lib/lfa/leagues.ts 실제 매핑
const OTHER = "zzz-some-league-we-do-not-serve"

function match(
  kickoff: string,
  state: "preGame" | "inGame" | "postGame",
  leagueId: string = EPL
): LfaMatch {
  return {
    id: `m-${kickoff}-${state}-${leagueId}`,
    league: { id: leagueId, name: "L" },
    kickoff,
    status: {
      status: state,
      display: state === "postGame" ? "FT" : state === "inGame" ? "45'" : "",
      is_live: state === "inGame",
      state,
    },
    home: { id: "h", name: "Home" },
    away: { id: "a", name: "Away" },
  }
}

const SEC = 1_000
const MIN = 60_000

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("dayFreshnessMs — 하루치 목록 재구매 주기", () => {
  it("진행 중인 경기가 있으면 5분", () => {
    vi.setSystemTime(at("20:00"))
    expect(dayFreshnessMs(DATE, [match("19:00", "inGame")])).toBe(45 * SEC)
  })

  it("킥오프 45분 전부터 5분으로 당긴다", () => {
    vi.setSystemTime(at("19:20")) // 킥오프 40분 전
    expect(dayFreshnessMs(DATE, [match("20:00", "preGame")])).toBe(5 * MIN)
  })

  it("킥오프 45분 밖이면 유휴 주기", () => {
    vi.setSystemTime(at("19:00")) // 킥오프 60분 전
    expect(dayFreshnessMs(DATE, [match("20:00", "preGame")])).toBe(30 * MIN)
  })

  it("⚠️ 불변식: 유휴 주기가 예열창보다 짧다 — 자다가 킥오프를 놓치지 않는다", () => {
    // 예열창 밖에서 마지막으로 산 직후를 가정하고, 유휴 주기가 지난 시점이
    // 여전히 킥오프 **이전**이어야 한다. 이 부등호가 깨지면 첫 몇 분이 증발한다.
    vi.setSystemTime(at("19:00"))
    const idle = dayFreshnessMs(DATE, [match("20:00", "preGame")])
    vi.setSystemTime(at("19:00") + idle)
    expect(Date.now()).toBeLessThan(at("20:00"))
    expect(dayFreshnessMs(DATE, [match("20:00", "preGame")])).toBe(5 * MIN)
  })

  it("전 경기가 끝났으면 얼린다 — 'KST 날짜가 넘어갈 때까지 17시간 재구매' 가 여기서 멈춘다", () => {
    vi.setSystemTime(at("23:00"))
    const done = [match("12:00", "postGame"), match("14:00", "postGame")]
    expect(dayFreshnessMs(DATE, done)).toBe(Infinity)
  })

  it("끝난 경기 + 아직 안 한 경기가 섞이면 얼리지 않는다", () => {
    vi.setSystemTime(at("15:00"))
    const mixed = [match("12:00", "postGame"), match("20:00", "preGame")]
    expect(dayFreshnessMs(DATE, mixed)).toBe(30 * MIN)
  })

  it("경기가 없는 미래 날짜는 유휴 주기 — 일정이 나중에 붙을 수 있으므로 얼리지 않는다", () => {
    vi.setSystemTime(at("10:00"))
    expect(dayFreshnessMs(DATE, [])).toBe(30 * MIN)
  })

  it("경기가 없는 채로 다 지난 날짜는 얼린다", () => {
    vi.setSystemTime(at("10:00") + 2 * 24 * 3600_000)
    expect(dayFreshnessMs(DATE, [])).toBe(Infinity)
  })

  it("자정을 넘겨 진행 중인 경기(23:45 킥오프)도 경기창 안으로 본다", () => {
    vi.setSystemTime(at("23:45") + 90 * MIN) // 다음날 01:15
    expect(dayFreshnessMs(DATE, [match("23:45", "preGame")])).toBe(5 * MIN)
  })

  // ⚠️ 이 그룹이 2026-08-24 배포 후 실측으로 드러난 구멍이다. `matches?date=` 는 전 세계
  //    경기(하루 189~960)를 주는데 신선도를 전수에서 판단하면, 지구 어딘가는 항상 경기
  //    중이라 24시간 내내 5분 주기가 된다 — 함수가 통째로 무력해진다.
  describe("우리가 안 쓰는 리그는 신선도 판단에서 제외한다", () => {
    it("남의 리그 경기가 라이브여도 유휴 주기를 유지한다", () => {
      vi.setSystemTime(at("10:00"))
      const mixed = [
        match("20:00", "preGame", EPL), // 우리 리그, 아직 멀었다
        match("09:30", "inGame", OTHER), // 남의 리그, 지금 진행 중
      ]
      expect(dayFreshnessMs(DATE, mixed)).toBe(30 * MIN)
    })

    it("남의 리그 경기만 있는 날짜는 볼 게 없다", () => {
      vi.setSystemTime(at("10:00"))
      const foreign = [match("09:30", "inGame", OTHER), match("10:15", "preGame", OTHER)]
      expect(dayFreshnessMs(DATE, foreign)).toBe(30 * MIN)
    })

    it("우리 리그가 라이브면 남의 리그와 무관하게 라이브 주기", () => {
      vi.setSystemTime(at("10:00"))
      const mixed = [match("09:30", "inGame", EPL), match("09:30", "inGame", OTHER)]
      expect(dayFreshnessMs(DATE, mixed)).toBe(45 * SEC)
    })

    it("우리 리그 경기가 전부 끝났으면 남의 리그가 남아 있어도 얼린다", () => {
      vi.setSystemTime(at("23:00"))
      const mixed = [match("12:00", "postGame", EPL), match("22:50", "inGame", OTHER)]
      expect(dayFreshnessMs(DATE, mixed)).toBe(Infinity)
    })
  })

  it("경기가 끝나고 경기창을 벗어난 preGame 잔여(FT 지연)는 유휴로 떨어진다", () => {
    // LFA 가 FT 를 늦게 찍는 경기 — 킥오프 + 3.5시간을 넘기면 더는 빠른 주기가 아니다
    vi.setSystemTime(at("12:00") + 5 * 3600_000)
    expect(dayFreshnessMs(DATE, [match("12:00", "preGame")])).toBe(30 * MIN)
  })
})

describe("detailsFreshnessMs — 경기 상세 캐시 수명", () => {
  const KO = "2026-08-24T19:00:00.000Z"
  const at = (iso: string) => Date.parse(iso)

  it("끝난 경기는 영원히 다시 안 산다", () => {
    expect(detailsFreshnessMs({ finished: true, live: false, matchTime: KO }, at(KO))).toBe(
      Infinity
    )
  })

  it("라이브 플래그가 서 있으면 라이브 주기", () => {
    expect(detailsFreshnessMs({ finished: false, live: true, matchTime: KO }, at(KO))).toBe(90_000)
  })

  it("⭐라이브 플래그가 거짓이어도 킥오프 창 안이면 라이브 주기 (자기 자신에게 갇히지 않는다)", () => {
    // 2026-08-25 풀럼:첼시 실사고 — LFA 가 킥오프 뒤에도 몇 분간 live:false 를 줬고,
    // 그 값이 스스로 10분 수명을 붙여 매치센터가 0-1 을 못 봤다.
    for (const t of ["2026-08-24T19:05:00Z", "2026-08-24T19:14:00Z", "2026-08-24T20:30:00Z"]) {
      expect(detailsFreshnessMs({ finished: false, live: false, matchTime: KO }, at(t)), t).toBe(
        90_000
      )
    }
  })

  it("킥오프 10분 전부터 미리 라이브 주기로 전환한다", () => {
    expect(
      detailsFreshnessMs(
        { finished: false, live: false, matchTime: KO },
        at("2026-08-24T18:55:00Z")
      )
    ).toBe(90_000)
    expect(
      detailsFreshnessMs(
        { finished: false, live: false, matchTime: KO },
        at("2026-08-24T18:40:00Z")
      )
    ).toBe(10 * 60_000)
  })

  it("경기 창(3.5시간)을 벗어나면 느긋한 주기로 돌아간다", () => {
    expect(
      detailsFreshnessMs(
        { finished: false, live: false, matchTime: KO },
        at("2026-08-24T23:00:00Z")
      )
    ).toBe(10 * 60_000)
  })

  it("킥오프 시각을 모르면 종전대로 느긋한 주기", () => {
    expect(detailsFreshnessMs({ finished: false, live: false, matchTime: null })).toBe(10 * 60_000)
    expect(detailsFreshnessMs({ finished: false, live: false, matchTime: "not-a-date" })).toBe(
      10 * 60_000
    )
  })
})

describe("detailsFreshnessMs — FT 후 빈 상세는 Infinity 에 갇히지 않는다", () => {
  const KO = "2026-08-24T19:00:00.000Z"
  const at = (iso: string) => Date.parse(iso)

  it("끝났고 채워졌으면 영원히 다시 안 산다", () => {
    expect(
      detailsFreshnessMs(
        { finished: true, live: false, matchTime: KO, emptyDetails: false },
        at("2026-08-24T21:00:00Z")
      )
    ).toBe(Infinity)
  })

  it("⭐끝났는데 비어 있으면 킥오프 +6시간까지는 10분 주기로 다시 본다", () => {
    // LFA 는 일부 경기의 이벤트를 FT 후 몇 시간 뒤에 채운다 (라싱 2:2 비야레알 실사고 계보)
    expect(
      detailsFreshnessMs(
        { finished: true, live: false, matchTime: KO, emptyDetails: true },
        at("2026-08-24T22:00:00Z")
      )
    ).toBe(10 * 60_000)
  })

  it("6시간이 지나도 안 채워지면 그때 굳는다 — 크레딧 무한 소모 방지", () => {
    expect(
      detailsFreshnessMs(
        { finished: true, live: false, matchTime: KO, emptyDetails: true },
        at("2026-08-25T02:00:00Z")
      )
    ).toBe(Infinity)
  })

  it("킥오프를 모르는 빈 종료 경기는 재시도 창을 판단할 수 없으니 굳는다", () => {
    expect(
      detailsFreshnessMs({ finished: true, live: false, matchTime: null, emptyDetails: true })
    ).toBe(Infinity)
  })
})
