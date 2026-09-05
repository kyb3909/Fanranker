import { describe, expect, it } from "vitest"
import { threadMatchdays } from "@/lib/match/thread-window"
import vercelConfig from "@/vercel.json"

it("라인업 확인·불판 생성 작업은 중복 등록 없이 2분마다 실행한다", () => {
  expect(vercelConfig.crons.filter((job) => job.path === "/api/cron/match-threads")).toEqual([
    { path: "/api/cron/match-threads", schedule: "*/2 * * * *" },
  ])
})

describe("불판 후보 매치데이", () => {
  it.each([
    ["2026-09-05T03:00:00+09:00", ["2026-09-04"]],
    ["2026-09-05T05:00:00+09:00", ["2026-09-04", "2026-09-05"]],
    ["2026-09-05T06:00:00+09:00", ["2026-09-04", "2026-09-05"]],
    ["2026-09-05T07:00:00+09:00", ["2026-09-04", "2026-09-05"]],
    ["2026-09-05T08:00:00+09:00", ["2026-09-05"]],
    ["2027-01-01T06:00:00+09:00", ["2026-12-31", "2027-01-01"]],
  ])("%s에는 -90/+120 창을 빠짐없이 조회", (now, days) => {
    expect(threadMatchdays(Date.parse(now), 6)).toEqual(days)
  })
})
