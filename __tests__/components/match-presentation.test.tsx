import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { MatchStatComparison } from "@/components/match/match-stat-comparison"
import { MatchLineup } from "@/components/match/match-lineup"
import { canShowFormation, parseFormation } from "@/components/match/formation-pitch"
import { PRIMARY_MATCH_STATS, splitMatchStats } from "@/lib/match/stat-presentation"
import { previewLineup, previewStats } from "@/app/dev/match-preview/fixtures"

afterEach(cleanup)
describe("경기 스탯 표시 정책", () => {
  it("피드 순서와 관계없이 요청한 13개를 먼저 보여주고 원본 30개는 보존한다", () => {
    const stats = [...previewStats].reverse()
    const { primary, additional } = splitMatchStats(stats)
    expect(primary.map((s) => s.label)).toEqual(PRIMARY_MATCH_STATS)
    expect(additional).toHaveLength(17)
    expect(stats).toHaveLength(30)
  })
  it("추가 17개는 기본 접힘이며 버튼으로 펼치고 다시 접는다", () => {
    render(<MatchStatComparison stats={previewStats} homeTeam="홈" awayTeam="원정" />)
    expect(
      within(screen.getByRole("list", { name: "주요 스탯" })).getAllByRole("listitem")
    ).toHaveLength(13)
    expect(screen.queryByRole("list", { name: "추가 스탯" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "추가 스탯 보기 (17)" }))
    expect(
      within(screen.getByRole("list", { name: "추가 스탯" })).getAllByRole("listitem")
    ).toHaveLength(17)
    fireEvent.click(screen.getByRole("button", { name: "추가 스탯 접기" }))
    expect(screen.queryByRole("list", { name: "추가 스탯" })).toBeNull()
  })
  it("없는 지표를 0으로 만들지 않고 추가 기록이 없으면 버튼도 없다", () => {
    render(<MatchStatComparison stats={[previewStats[0]]} homeTeam="홈" awayTeam="원정" />)
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.queryByText("점유율")).toBeNull()
  })
  it("주요 기록이 없더라도 추가 기록은 확인할 수 있다", () => {
    render(<MatchStatComparison stats={[previewStats[9]]} homeTeam="홈" awayTeam="원정" />)
    expect(screen.getByText("주요 스탯은 아직 제공되지 않았습니다.")).toBeVisible()
    fireEvent.click(screen.getByRole("button"))
    expect(screen.getByText("세트피스 기대득점")).toBeVisible()
  })
  it("빈 스탯은 비어 있는 표를 만들지 않는다", () => {
    const { container } = render(<MatchStatComparison stats={[]} homeTeam="홈" awayTeam="원정" />)
    expect(container).toBeEmptyDOMElement()
  })
})
describe("라인업 보기", () => {
  const lineup = (initial = previewLineup) => (
    <MatchLineup
      gameId="preview"
      matchTime={initial.kickoff}
      initial={initial}
      withPitch
      alwaysOpen
    />
  )
  it("기본 포메이션과 명단이 중복 노출되지 않고 전환할 수 있다", () => {
    render(lineup())
    expect(screen.getByRole("region", { name: "홈 유나이티드 포메이션" })).toBeInTheDocument()
    expect(screen.queryByRole("list", { name: "홈 유나이티드 선발 선수" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "선수 명단" }))
    expect(screen.queryByRole("region", { name: "홈 유나이티드 포메이션" })).toBeNull()
    expect(
      within(screen.getByRole("list", { name: "홈 유나이티드 선발 선수" })).getAllByRole("listitem")
    ).toHaveLength(11)
    expect(screen.getByText("23′")).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "포메이션" }))
    expect(screen.getByRole("region", { name: "홈 유나이티드 포메이션" })).toBeInTheDocument()
  })
  it("팀 선택 상태를 버튼에 표시한다", () => {
    render(lineup())
    const away = screen.getByRole("button", { name: "어웨이 시티" })
    fireEvent.click(away)
    expect(away).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "홈 유나이티드" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })
  it("한 팀의 선발이 11명이 아니면 명단으로 안전하게 대체한다", () => {
    render(
      lineup({
        ...previewLineup,
        away: { ...previewLineup.away, starters: previewLineup.away.starters.slice(0, 10) },
      })
    )
    expect(screen.queryByRole("button", { name: "포메이션" })).toBeNull()
    expect(screen.getByRole("list", { name: "홈 유나이티드 선발 선수" })).toBeInTheDocument()
  })
  it("합계가 맞지 않는 포메이션은 배치를 만들어내지 않는다", () => {
    expect(parseFormation("4-2-3-1")).toEqual([4, 2, 3, 1])
    expect(parseFormation("4–3–3")).toEqual([4, 3, 3])
    for (const formation of [null, "", "4-4-3", "0-5-5", "unknown"]) {
      expect(canShowFormation({ ...previewLineup.home, formation })).toBe(false)
    }
  })
})
