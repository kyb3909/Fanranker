import { describe, expect, it } from "vitest"
import { summarizeReportGaps, REPORT_STAGES } from "@/lib/soccerway/report-gaps"

/**
 * 리포트 실패 원장 → 관제실 카드 숫자 (2026-09-02).
 * 7일간 대상 23경기 중 10개만 리포트였고 나머지는 이유가 없었다 — 이 집계가 그 눈이다.
 */

const at = (game_id: string, stage: string, attempted_at: string) => ({
  game_id,
  stage,
  attempted_at,
})

describe("summarizeReportGaps", () => {
  it("경기당 마지막 시도의 사유만 센다 — 30분마다 40번 쌓여도 1", () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      at("g1", "article", `2026-09-02T${String(i % 24).padStart(2, "0")}:00:00Z`)
    )
    const r = summarizeReportGaps(rows, [])
    expect(r.games).toBe(1)
    expect(r.reasons).toEqual([{ stage: REPORT_STAGES.article, n: 1 }])
  })

  it("마지막 시도가 다른 게이트면 그 게이트로 센다 (원문 없음 → 나중에 검증 불합격)", () => {
    const r = summarizeReportGaps(
      [at("g1", "article", "2026-09-02T01:00:00Z"), at("g1", "verify", "2026-09-02T05:00:00Z")],
      []
    )
    expect(r.reasons).toEqual([{ stage: REPORT_STAGES.verify, n: 1 }])
  })

  it("입력 순서를 믿지 않는다 — 오래된 게 뒤에 와도 최신을 고른다", () => {
    const r = summarizeReportGaps(
      [at("g1", "verify", "2026-09-02T05:00:00Z"), at("g1", "article", "2026-09-02T01:00:00Z")],
      []
    )
    expect(r.reasons[0].stage).toBe(REPORT_STAGES.verify)
  })

  it("저장 리포트가 생긴 경기는 뺀다 — 나중에 성공한 건 실패가 아니다", () => {
    const r = summarizeReportGaps(
      [at("g1", "article", "2026-09-02T01:00:00Z"), at("g2", "article", "2026-09-02T01:00:00Z")],
      ["g1"]
    )
    expect(r.games).toBe(1)
  })

  it("사유는 많은 순, 같으면 이름순 — 카드에 앞 3개만 실린다", () => {
    const r = summarizeReportGaps(
      [
        at("a", "verify", "2026-09-02T01:00:00Z"),
        at("b", "article", "2026-09-02T01:00:00Z"),
        at("c", "article", "2026-09-02T01:00:00Z"),
        at("d", "score", "2026-09-02T01:00:00Z"),
      ],
      []
    )
    expect(r.reasons.map((x) => `${x.stage}:${x.n}`)).toEqual([
      `${REPORT_STAGES.article}:2`,
      `${REPORT_STAGES.verify}:1`,
      `${REPORT_STAGES.score}:1`,
    ])
  })

  it("모르는 stage 키는 그대로 보여준다 — 어휘가 늘었는데 라벨이 없으면 숨기지 말고 드러낸다", () => {
    const r = summarizeReportGaps([at("a", "새게이트", "2026-09-02T01:00:00Z")], [])
    expect(r.reasons).toEqual([{ stage: "새게이트", n: 1 }])
  })

  it("빈 원장 → 0건", () => {
    expect(summarizeReportGaps([], [])).toEqual({ games: 0, reasons: [] })
  })
})
