import { describe, expect, it } from "vitest"
import {
  cronJobNameFromPath,
  cronMaxGapMinutes,
  heartbeatThresholdMinutes,
} from "@/lib/ops/cron-schedule"

describe("cronMaxGapMinutes", () => {
  it("매분(* * * * *) = 1분", () => {
    expect(cronMaxGapMinutes("* * * * *")).toBe(1)
  })

  it("30분 간격(*/30 * * * *) = 30분", () => {
    expect(cronMaxGapMinutes("*/30 * * * *")).toBe(30)
  })

  it("리스트(7,37 * * * *) = 30분", () => {
    expect(cronMaxGapMinutes("7,37 * * * *")).toBe(30)
  })

  it("비대칭 리스트(3,18,33,48 * * * *) = 15분", () => {
    expect(cronMaxGapMinutes("3,18,33,48 * * * *")).toBe(15)
  })

  it("매시(44 * * * *) = 60분", () => {
    expect(cronMaxGapMinutes("44 * * * *")).toBe(60)
  })

  it("매일(30 13 * * *) = 1440분", () => {
    expect(cronMaxGapMinutes("30 13 * * *")).toBe(1440)
  })

  it("매주(0 15 * * 0) = 10080분", () => {
    expect(cronMaxGapMinutes("0 15 * * 0")).toBe(10080)
  })

  it("지원 밖 문법(dom 제약)은 null — 감시 제외", () => {
    expect(cronMaxGapMinutes("0 0 1 * *")).toBeNull()
    expect(cronMaxGapMinutes("0 0 * * 1-5")).toBeNull()
  })
})

describe("cronJobNameFromPath", () => {
  it("/api/cron/x → x", () => {
    expect(cronJobNameFromPath("/api/cron/news-auto-publish")).toBe("news-auto-publish")
  })

  it("/api/wisetoto/sync → wisetoto-sync", () => {
    expect(cronJobNameFromPath("/api/wisetoto/sync")).toBe("wisetoto-sync")
  })
})

describe("heartbeatThresholdMinutes", () => {
  it("짧은 주기는 최소 30분 슬랙", () => {
    expect(heartbeatThresholdMinutes(1)).toBe(31)
  })

  it("일일 크론은 한 회차 결번 + 12시간 뒤 경보", () => {
    expect(heartbeatThresholdMinutes(1440)).toBe(1440 + 720)
  })
})
