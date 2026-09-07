import { describe, expect, it } from "vitest"
import {
  actionableItems,
  combineProbes,
  probeCount,
  promoteOverdue,
  sortByPriority,
  standDown,
  summarizeDomains,
  summarizeObservations,
  waitingItems,
  type Observation,
  type WorkItem,
} from "@/lib/admin/control-center"

/**
 * 관제 센터 판정 계약.
 *
 * 여기서 잠그는 것은 감사 문서의 검증 시나리오 그대로다:
 *  · 긴급 1건이 대량 큐에 묻히지 않는가
 *  · 조회 실패를 0건으로 세지 않는가
 *  · 기한이 지난 대기가 다시 올라오는가
 *  · 관측이 불완전할 때 "전체 정상"이라고 말하지 않는가
 */

const NOW = Date.parse("2026-09-08T00:00:00Z")
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()
const hoursAhead = (h: number) => new Date(NOW + h * 3_600_000).toISOString()

function item(over: Partial<WorkItem> & Pick<WorkItem, "key">): WorkItem {
  return {
    domain: "기타",
    label: over.key,
    impact: "",
    count: 1,
    oldestAt: null,
    dueAt: null,
    owner: null,
    state: "actionable",
    nextAction: "",
    href: null,
    severity: "normal",
    observation: "ok",
    actionWired: true,
    ...over,
  }
}

function obs(over: Partial<Observation> & Pick<Observation, "key">): Observation {
  return {
    label: over.key,
    state: "ok",
    observedAt: new Date(NOW).toISOString(),
    lastOkAt: new Date(NOW).toISOString(),
    ...over,
  }
}

describe("우선순위 — 건수가 긴급도를 이기지 못한다", () => {
  it("긴급 신고 1건이 일반 검수 100건보다 위에 온다", () => {
    const urgent = item({ key: "report", severity: "high", count: 1 })
    const bulk = item({ key: "review", severity: "normal", count: 100 })
    expect(sortByPriority([bulk, urgent], NOW).map((i) => i.key)).toEqual(["report", "review"])
  })

  it("건수가 1000건이어도 티어를 넘지 못한다", () => {
    const critical = item({ key: "money", severity: "critical", count: 1 })
    const huge = item({ key: "queue", severity: "high", count: 1000 })
    expect(sortByPriority([huge, critical], NOW)[0].key).toBe("money")
  })

  it("기한이 지난 건은 긴급도와 무관하게 맨 위로 온다", () => {
    const overdue = item({ key: "overdue", severity: "low", count: 1, dueAt: hoursAgo(1) })
    const critical = item({ key: "critical", severity: "critical", count: 50 })
    expect(sortByPriority([critical, overdue], NOW)[0].key).toBe("overdue")
  })

  it("기한 초과끼리는 피해가 큰 쪽이 먼저", () => {
    // 실데이터에서 24시간 넘긴 일반 신고가 미지급 환불보다 위로 올라왔다
    const lateReport = item({
      key: "report",
      severity: "normal",
      count: 1,
      dueAt: hoursAgo(3900),
      oldestAt: hoursAgo(3900),
    })
    const lateRefund = item({
      key: "refund",
      severity: "critical",
      count: 2,
      dueAt: hoursAgo(2),
      oldestAt: hoursAgo(26),
    })
    expect(sortByPriority([lateReport, lateRefund], NOW)[0].key).toBe("refund")
  })

  it("같은 티어에서는 오래 기다린 것이 먼저", () => {
    const old = item({ key: "old", severity: "normal", count: 1, oldestAt: hoursAgo(120) })
    const fresh = item({ key: "fresh", severity: "normal", count: 40, oldestAt: hoursAgo(1) })
    expect(sortByPriority([fresh, old], NOW)[0].key).toBe("old")
  })
})

describe("기한이 지난 대기는 처리 대상으로 되돌아온다", () => {
  const overdueWaiting = item({
    key: "settle",
    state: "waiting_auto",
    count: 3,
    dueAt: hoursAgo(2),
  })
  const liveWaiting = item({
    key: "cron",
    state: "waiting_auto",
    count: 1,
    dueAt: hoursAhead(2),
  })

  it("기한을 넘긴 대기는 actionable 로 승격된다", () => {
    const promoted = promoteOverdue([overdueWaiting, liveWaiting], NOW)
    expect(promoted.find((i) => i.key === "settle")?.state).toBe("actionable")
    expect(promoted.find((i) => i.key === "cron")?.state).toBe("waiting_auto")
  })

  it("승격된 건은 기다리는 일 목록에서 빠지고 할 일에 나타난다", () => {
    const list = [overdueWaiting, liveWaiting]
    expect(actionableItems(list, NOW).map((i) => i.key)).toEqual(["settle"])
    expect(waitingItems(list, NOW).map((i) => i.key)).toEqual(["cron"])
  })
})

describe("0건 · 조회 실패 · 미연결을 구별한다", () => {
  it("조회 실패는 숫자를 만들지 않는다", () => {
    const failed = probeCount({ count: null, error: { message: "permission denied" } })
    expect(failed.state).toBe("failed")
    expect(failed.count).toBeNull()
    expect(failed.note).toContain("permission denied")
  })

  it("정상 0건은 0 으로 관측된다", () => {
    expect(probeCount({ count: 0 })).toEqual({ count: 0, state: "ok" })
  })

  it("미연결은 조회 성공이어도 미연결이다", () => {
    const p = probeCount({ count: 5 }, { unwired: true, unwiredNote: "접수 경로 없음" })
    expect(p.state).toBe("unwired")
    expect(p.count).toBeNull()
  })

  it("여러 조회 중 하나라도 실패하면 합계를 만들지 않는다", () => {
    const combined = combineProbes([
      { count: 3, state: "ok" },
      { count: null, state: "failed" },
    ])
    expect(combined.state).toBe("failed")
    expect(combined.count).toBeNull()
  })

  it("관측 실패한 업무는 할 일 목록에 건수로 들어가지 않는다", () => {
    const unknown = item({ key: "unknown", observation: "failed", count: 99 })
    expect(actionableItems([unknown], NOW)).toEqual([])
  })
})

describe("전체 상태 요약", () => {
  it("전 항목 성공일 때만 ok", () => {
    expect(summarizeObservations([obs({ key: "a" }), obs({ key: "b" })]).state).toBe("ok")
  })

  it("하나라도 미연결이면 ok 가 아니다", () => {
    const s = summarizeObservations([obs({ key: "a" }), obs({ key: "b", state: "unwired" })])
    expect(s.state).toBe("partial")
    expect(s.unobservedLabels).toEqual(["b"])
  })

  it("절반 이상 조회 실패면 관측이 죽은 것으로 본다", () => {
    const s = summarizeObservations([
      obs({ key: "a", state: "failed", observedAt: null }),
      obs({ key: "b", state: "failed", observedAt: null }),
      obs({ key: "c" }),
    ])
    expect(s.state).toBe("down")
  })

  it("실패한 소스도 마지막 성공 시각을 보존한다", () => {
    const s = summarizeObservations([
      obs({ key: "a", state: "failed", observedAt: null, lastOkAt: hoursAgo(3) }),
    ])
    expect(s.ok).toBe(0)
    expect(s.failed).toBe(1)
  })
})

describe("업무별 현황", () => {
  it("정상 0건 영역만 접을 수 있다", () => {
    const domains = summarizeDomains(
      [
        item({ key: "a", domain: "검수", count: 0 }),
        item({ key: "b", domain: "재화", count: 0, observation: "failed" }),
      ],
      NOW
    )
    expect(domains.find((d) => d.domain === "검수")?.collapsible).toBe(true)
    // 확인 불가가 섞인 영역을 접으면 "0건처럼 보이는" 문제가 그대로 남는다
    expect(domains.find((d) => d.domain === "재화")?.collapsible).toBe(false)
    expect(domains.find((d) => d.domain === "재화")?.degraded).toBe(true)
  })

  it("확인 불가 영역이 맨 앞에 온다", () => {
    const domains = summarizeDomains(
      [
        item({ key: "a", domain: "검수", count: 5, severity: "high" }),
        item({ key: "b", domain: "재화", count: 0, observation: "unwired" }),
      ],
      NOW
    )
    expect(domains[0].domain).toBe("재화")
  })

  it("관측 실패한 항목의 건수는 영역 합계에 들어가지 않는다", () => {
    const domains = summarizeDomains(
      [
        item({ key: "a", domain: "재화", count: 2 }),
        item({ key: "b", domain: "재화", count: 99, observation: "failed" }),
      ],
      NOW
    )
    expect(domains[0].open).toBe(2)
  })
})

describe("종료 판단 — 숫자 0 이 아니라 관측 범위와 대기 책임의 교집합", () => {
  it("모두 확인했고 할 일이 없으면 닫아도 된다고 말한다", () => {
    const r = standDown([obs({ key: "a" })], [item({ key: "x", count: 0 })], NOW)
    expect(r.canClose).toBe(true)
    expect(r.blockers).toEqual([])
    expect(r.headline).toContain("직접 처리할 일 없음")
  })

  it("미연결이 하나라도 있으면 전체 정상을 보증하지 않는다", () => {
    const r = standDown(
      [obs({ key: "a" }), obs({ key: "문의", state: "unwired" })],
      [item({ key: "x", count: 0 })],
      NOW
    )
    expect(r.canClose).toBe(false)
    expect(r.blockers).toContain("미연결 1곳")
    expect(r.headline).toContain("확인한 범위에서")
    expect(r.headline).toContain("문의")
  })

  it("다음 확인 시각이 없는 대기는 시스템이 맡았다고 보지 않는다", () => {
    const r = standDown(
      [obs({ key: "a" })],
      [item({ key: "w", state: "waiting_handoff", count: 1 })],
      NOW
    )
    expect(r.canClose).toBe(false)
    expect(r.blockers.some((b) => b.includes("다음 확인 시각이 없는 대기"))).toBe(true)
  })

  it("처리할 일이 있으면 건수를 앞세운다", () => {
    const r = standDown([obs({ key: "a" })], [item({ key: "x", count: 3 })], NOW)
    expect(r.canClose).toBe(false)
    expect(r.headline).toContain("처리할 일 1건")
  })
})
