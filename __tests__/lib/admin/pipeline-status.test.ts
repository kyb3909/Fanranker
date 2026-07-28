import { describe, it, expect } from "vitest"
import {
  ageHours,
  freshness,
  fmtAge,
  worstStatus,
  PIPELINE_THRESHOLDS,
} from "@/lib/admin/pipeline-status"

/**
 * 파이프라인 신선도 판정 계약.
 *
 * 이 로직이 틀리면 운영자가 겪는 건 둘 중 하나다 — 멀쩡한데 빨간불(오탐)이라
 * 알림을 무시하게 되거나, 죽었는데 초록불(미탐)이라 장애를 놓친다.
 * 임계값은 각 파이프라인의 실제 실행 주기에서 나온 값이므로 여기서 고정한다.
 */

const NOW = new Date("2026-07-29T12:00:00Z").getTime()
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString()

describe("ageHours", () => {
  it("경과 시간을 시간 단위로 계산한다", () => {
    expect(ageHours(hoursAgo(3), NOW)).toBeCloseTo(3)
    expect(ageHours(hoursAgo(0.5), NOW)).toBeCloseTo(0.5)
  })

  it("기록이 없거나 파싱 불가면 null (정상으로 오인하지 않기 위해)", () => {
    expect(ageHours(null, NOW)).toBeNull()
    expect(ageHours(undefined, NOW)).toBeNull()
    expect(ageHours("깨진 값", NOW)).toBeNull()
  })
})

describe("freshness", () => {
  it("warn 미만이면 ok", () => {
    expect(freshness(hoursAgo(1), 3, 6, NOW)).toBe("ok")
    expect(freshness(hoursAgo(2.9), 3, 6, NOW)).toBe("ok")
  })

  it("warn 이상 down 미만이면 warn — 경계값은 warn 쪽에 포함된다", () => {
    expect(freshness(hoursAgo(3), 3, 6, NOW)).toBe("warn")
    expect(freshness(hoursAgo(5.9), 3, 6, NOW)).toBe("warn")
  })

  it("down 이상이면 down — 경계값 포함", () => {
    expect(freshness(hoursAgo(6), 3, 6, NOW)).toBe("down")
    expect(freshness(hoursAgo(100), 3, 6, NOW)).toBe("down")
  })

  it("기록이 아예 없으면 down — '한 번도 안 돌았다'를 정상으로 보면 첫 장애를 놓친다", () => {
    expect(freshness(null, 3, 6, NOW)).toBe("down")
    expect(freshness(undefined, 3, 6, NOW)).toBe("down")
  })

  it("미래 시각(시계 어긋남)도 ok 로 본다 — 오탐보다 낫다", () => {
    expect(freshness(new Date(NOW + 3600_000).toISOString(), 3, 6, NOW)).toBe("ok")
  })
})

describe("PIPELINE_THRESHOLDS — 실제 주기와의 관계", () => {
  it("모든 임계는 warn < down 이다", () => {
    for (const [name, t] of Object.entries(PIPELINE_THRESHOLDS)) {
      expect(t.warn, `${name} warn < down`).toBeLessThan(t.down)
    }
  })

  it("betman 은 2시간 주기라 3시간이면 경고 (한 사이클 걸렀다는 뜻)", () => {
    const { warn, down } = PIPELINE_THRESHOLDS.betman
    expect(freshness(hoursAgo(2), warn, down, NOW)).toBe("ok") // 정상 주기 내
    expect(freshness(hoursAgo(3.5), warn, down, NOW)).toBe("warn")
    expect(freshness(hoursAgo(7), warn, down, NOW)).toBe("down")
  })

  it("스캐너는 새벽 소스 공백을 견뎌야 한다 — 3시간 공백은 아직 정상", () => {
    const { warn, down } = PIPELINE_THRESHOLDS.newsScanner
    expect(freshness(hoursAgo(3), warn, down, NOW)).toBe("ok")
    expect(freshness(hoursAgo(5), warn, down, NOW)).toBe("warn")
  })

  it("발행은 사람 검수에 달려 하루까지는 정상 (파이프라인 장애가 아니다)", () => {
    const { warn, down } = PIPELINE_THRESHOLDS.botPublish
    expect(freshness(hoursAgo(20), warn, down, NOW)).toBe("ok")
    expect(freshness(hoursAgo(30), warn, down, NOW)).toBe("warn")
    expect(freshness(hoursAgo(80), warn, down, NOW)).toBe("down")
  })
})

describe("fmtAge", () => {
  it("1시간 미만은 분", () => {
    expect(fmtAge(hoursAgo(0.5), NOW)).toBe("30분 전")
    expect(fmtAge(hoursAgo(0.1), NOW)).toBe("6분 전")
  })

  it("1~24시간은 소수 첫째자리까지 시간", () => {
    expect(fmtAge(hoursAgo(3.25), NOW)).toBe("3.3시간 전")
    expect(fmtAge(hoursAgo(23), NOW)).toBe("23.0시간 전")
  })

  it("24시간 이상은 일", () => {
    expect(fmtAge(hoursAgo(24), NOW)).toBe("1일 전")
    expect(fmtAge(hoursAgo(75), NOW)).toBe("3일 전")
  })

  it("기록 없으면 '기록 없음' — 빈 문자열로 얼버무리지 않는다", () => {
    expect(fmtAge(null, NOW)).toBe("기록 없음")
  })
})

describe("worstStatus", () => {
  it("down 이 하나라도 있으면 down", () => {
    expect(worstStatus(["ok", "warn", "down"])).toBe("down")
  })

  it("down 없고 warn 있으면 warn", () => {
    expect(worstStatus(["ok", "warn", "ok"])).toBe("warn")
  })

  it("전부 ok 면 ok", () => {
    expect(worstStatus(["ok", "ok"])).toBe("ok")
  })

  it("빈 배열은 ok (감시 대상이 없으면 문제도 없다)", () => {
    expect(worstStatus([])).toBe("ok")
  })
})
