import React from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { BettingMatchCard } from "@/components/betting/betting-match-card"
import type { GroupedMatch, SelectedBet, SportsGame } from "@/components/betting/betting-types"

function makeGame(overrides: Partial<SportsGame> = {}): SportsGame {
  return {
    id: "game-1",
    round_id: "round-1",
    game_no: 1,
    match_time: "2026-02-22T10:00:00.000Z",
    sport: "축구",
    league_code: "KL",
    game_type: "승무패",
    home_team_name: "서울",
    away_team_name: "수원",
    handicap: null,
    over_under_line: null,
    venue: "서울월드컵경기장",
    status: "active",
    home_odds: 1.5,
    draw_odds: 3.2,
    away_odds: 4.8,
    ...overrides,
  }
}

function makeGroupedMatch(overrides: Partial<GroupedMatch> = {}): GroupedMatch {
  return {
    matchKey: "match-1",
    sport: "축구",
    leagueCode: "KL",
    homeTeam: "서울",
    awayTeam: "수원",
    matchTime: "2026-02-22T10:00:00.000Z",
    venue: "서울월드컵경기장",
    games: [makeGame()],
    ...overrides,
  }
}

describe("BettingMatchCard", () => {
  const defaultProps = {
    groupedMatch: makeGroupedMatch(),
    selectedBets: [] as SelectedBet[],
    selectedSport: null as string | null,
    onBetSelection: vi.fn(),
  }

  it("renders team names with vs separator", () => {
    render(<BettingMatchCard {...defaultProps} />)
    expect(screen.getByText("vs")).toBeDefined()
    // Teams appear in header and may appear in bet buttons
    expect(screen.getAllByText(/서울/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/수원/).length).toBeGreaterThanOrEqual(1)
  })

  it("renders league code", () => {
    render(<BettingMatchCard {...defaultProps} />)
    expect(screen.getByText("KL")).toBeDefined()
  })

  it("renders 3-column grid for 승무패 (football with draw)", () => {
    render(<BettingMatchCard {...defaultProps} />)
    // Home (서울 short), 무, Away (수원 short) - 3 buttons
    const buttons = screen.getAllByRole("button")
    // Should have 3 bet buttons
    expect(buttons.length).toBe(3)
    expect(screen.getByText("무")).toBeDefined()
  })

  it("renders 2-column grid for basketball (no draw)", () => {
    const basketMatch = makeGroupedMatch({
      sport: "농구",
      games: [makeGame({ sport: "농구", game_type: "승패" })],
    })
    render(<BettingMatchCard {...defaultProps} groupedMatch={basketMatch} />)
    // No draw button for basketball
    expect(screen.queryByText("무")).toBeNull()
  })

  it("renders 2-column grid for SUM game type", () => {
    const sumMatch = makeGroupedMatch({
      games: [makeGame({ game_type: "SUM", odd_odds: 1.85, even_odds: 1.85 })],
    })
    render(<BettingMatchCard {...defaultProps} groupedMatch={sumMatch} />)
    expect(screen.getByText("홀")).toBeDefined()
    expect(screen.getByText("짝")).toBeDefined()
  })

  it("renders over/under options for 언더오버 type", () => {
    const ouMatch = makeGroupedMatch({
      games: [
        makeGame({
          game_type: "언더오버",
          over_odds: 1.9,
          under_odds: 1.9,
          over_under_line: 2.5,
        }),
      ],
    })
    render(<BettingMatchCard {...defaultProps} groupedMatch={ouMatch} />)
    expect(screen.getByText("오버")).toBeDefined()
    expect(screen.getByText("언더")).toBeDefined()
    expect(screen.getByText("기준 2.5")).toBeDefined()
  })

  it("calls onBetSelection when bet button clicked", () => {
    const onBetSelection = vi.fn()
    render(<BettingMatchCard {...defaultProps} onBetSelection={onBetSelection} />)
    // Click home team button
    const homeBtn = screen.getByLabelText(/서울.* 선택/)
    fireEvent.click(homeBtn)
    expect(onBetSelection).toHaveBeenCalledWith(
      "game-1",
      "match-1",
      "home",
      "축구",
      "승무패",
      null,
      null,
      1.5
    )
  })

  it("disables buttons when sport mismatch", () => {
    render(<BettingMatchCard {...defaultProps} selectedSport="농구" />)
    const buttons = screen.getAllByRole("button")
    buttons.forEach((btn) => {
      expect(btn.hasAttribute("disabled")).toBe(true)
    })
  })

  it("shows 마감 when game bet is closed", () => {
    const closedMatch = makeGroupedMatch({
      games: [makeGame({ is_bettable: false })],
    })
    render(<BettingMatchCard {...defaultProps} groupedMatch={closedMatch} />)
    expect(screen.getByText("마감")).toBeDefined()
  })

  it("shows 다른 종목 label when sport mismatch", () => {
    render(<BettingMatchCard {...defaultProps} selectedSport="야구" />)
    expect(screen.getByText("다른 종목")).toBeDefined()
  })

  it("shows 선택됨 when match has a selection", () => {
    const selected: SelectedBet[] = [
      {
        gameId: "game-1",
        matchKey: "match-1",
        selection: "home",
        sport: "축구",
        gameType: "승무패",
        handicap: null,
        overUnderLine: null,
        odds: 1.5,
      },
    ]
    render(<BettingMatchCard {...defaultProps} selectedBets={selected} />)
    expect(screen.getByText("선택됨")).toBeDefined()
  })

  it("displays odds values correctly", () => {
    render(<BettingMatchCard {...defaultProps} />)
    expect(screen.getByText("1.50")).toBeDefined()
    expect(screen.getByText("3.20")).toBeDefined()
    expect(screen.getByText("4.80")).toBeDefined()
  })

  it("shows handicap badge when game type includes 핸디캡", () => {
    const hdMatch = makeGroupedMatch({
      games: [makeGame({ game_type: "핸디캡", handicap: -1.5 })],
    })
    render(<BettingMatchCard {...defaultProps} groupedMatch={hdMatch} />)
    expect(screen.getByText(/서울.*-1.5/)).toBeDefined()
  })
})
