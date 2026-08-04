import { describe, expect, it } from "vitest"
import { clusterBatch, titleSimilarity, type ClusterInput } from "@/lib/saga/cluster"

function row(
  ref: string,
  title: string,
  stage: ClusterInput["extracted"]["stage_signal"],
  occurredAt = "2026-08-05T10:00:00.000Z"
): ClusterInput {
  return {
    ref,
    title,
    occurredAt,
    tier: "rumor",
    extracted: {
      is_transfer: true,
      player: "Victor Osimhen",
      player_kr: "빅터 오시멘",
      direction: "in",
      clubs: [],
      stage_signal: stage,
      headline_ko: title,
      confidence: 0.9,
    },
  }
}

describe("titleSimilarity", () => {
  it("대괄호 출처와 구두점 차이를 접는다", () => {
    expect(titleSimilarity("[로마노] 아스날, 오시멘 영입 협상", "아스날 오시멘 영입 협상")).toBe(1)
  })

  it("공통 사건 토큰이 없는 제목은 0이다", () => {
    expect(titleSimilarity("오시멘 메디컬 예정", "아스날 유소년 계약 발표")).toBe(0)
  })
})

describe("clusterBatch", () => {
  it("같은 날·같은 관심 신호의 유사 제목은 에코로 접는다", () => {
    const groups = clusterBatch(
      [
        row("a", "아스날 오시멘 영입 관심", "interest"),
        row("b", "아스날, 오시멘 영입에 관심", "interest"),
      ],
      "2026-summer"
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].clusters).toHaveLength(1)
    expect(groups[0].clusters[0].echoes).toHaveLength(1)
  })

  it("같은 날 관심 기사라도 제목이 다르면 별도 사건으로 둔다", () => {
    const groups = clusterBatch(
      [
        row("a", "나폴리 구단은 오시멘 장기계약 잔류협상 전망", "interest"),
        row("b", "첼시는 오시멘 임대영입 조건문의 착수", "interest"),
      ],
      "2026-summer"
    )

    expect(groups[0].clusters).toHaveLength(2)
  })

  it("KST 날짜가 다르면 같은 제목도 별도 클러스터다", () => {
    const groups = clusterBatch(
      [
        row("a", "아스날 오시멘 영입 관심", "interest", "2026-08-05T14:59:00.000Z"),
        row("b", "아스날 오시멘 영입 관심", "interest", "2026-08-05T15:01:00.000Z"),
      ],
      "2026-summer"
    )

    expect(groups[0].clusters).toHaveLength(2)
  })
})
