import React from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { PredictionActivityCard } from "@/components/prediction-activity-card"

// Mock date utility
vi.mock("@/lib/utils/date", () => ({
  formatRelativeTime: () => "1시간 전",
}))

const mockPrediction = {
  id: "pred-1",
  game_id: "game-1",
  prediction: "home",
  status: "pending",
  game: {
    home_team_name: "서울",
    away_team_name: "수원",
    match_time: "2026-02-22T10:00:00.000Z",
    game_type: "승무패",
    sport: "축구",
    result: null,
  },
}

const baseActivity = {
  id: "act-1",
  user_id: "user-1",
  round_id: "round-1",
  sport: "축구",
  prediction_count: 3,
  created_at: "2026-02-22T09:00:00.000Z",
  profile: { nickname: "테스트유저", avatar_url: null },
  stats: { accuracy: 75.5, net_profit: 120, current_streak: 3 },
  round: { year: 2026, round: 10, status: "active" },
  is_purchased: false,
  is_free: false,
  predictions: null,
}

describe("PredictionActivityCard", () => {
  it("renders user nickname", () => {
    render(<PredictionActivityCard activity={baseActivity} onPurchase={vi.fn()} />)
    expect(screen.getByText("테스트유저")).toBeDefined()
  })

  it("renders sport label and prediction count", () => {
    render(<PredictionActivityCard activity={baseActivity} onPurchase={vi.fn()} />)
    expect(screen.getByText(/축구 3경기 예측 등록/)).toBeDefined()
  })

  it("renders round info", () => {
    render(<PredictionActivityCard activity={baseActivity} onPurchase={vi.fn()} />)
    expect(screen.getByText(/2026년 10회차/)).toBeDefined()
  })

  it("renders accuracy badge when > 0", () => {
    render(<PredictionActivityCard activity={baseActivity} onPurchase={vi.fn()} />)
    expect(screen.getByText("75.5%")).toBeDefined()
  })

  it("renders streak badge when > 0", () => {
    render(<PredictionActivityCard activity={baseActivity} onPurchase={vi.fn()} />)
    expect(screen.getByText("3연승")).toBeDefined()
  })

  it("renders profit badge when > 0", () => {
    render(<PredictionActivityCard activity={baseActivity} onPurchase={vi.fn()} />)
    expect(screen.getByText("+120")).toBeDefined()
  })

  it("hides stats badges when stats is null", () => {
    const activity = { ...baseActivity, stats: null }
    render(<PredictionActivityCard activity={activity} onPurchase={vi.fn()} />)
    expect(screen.queryByText(/연승/)).toBeNull()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it("shows locked purchase button when not purchased", () => {
    render(<PredictionActivityCard activity={baseActivity} onPurchase={vi.fn()} />)
    // BettingSlipCard는 접힌 상태이므로 잠금 배지가 보여야 함
    expect(screen.getByText("잠금")).toBeDefined()
    // 헤더를 클릭하여 확장
    fireEvent.click(screen.getByText("잠금"))
    expect(screen.getByText("500G로 열람")).toBeDefined()
  })

  it("calls onPurchase and shows predictions on success", async () => {
    const onPurchase = vi.fn().mockResolvedValue([mockPrediction])
    render(<PredictionActivityCard activity={baseActivity} onPurchase={onPurchase} />)

    // 먼저 카드를 확장
    fireEvent.click(screen.getByText("잠금"))
    fireEvent.click(screen.getByText("500G로 열람"))
    expect(onPurchase).toHaveBeenCalledWith("act-1")

    await waitFor(() => {
      expect(screen.getByText("열람 완료")).toBeDefined()
      // BettingSlipCard 헤더에 "베트맨 축구" 표시
      expect(screen.getByText(/베트맨 축구/)).toBeDefined()
    })
  })

  it("shows loading state during purchase", async () => {
    let resolvePromise: (v: null) => void
    const promise = new Promise<null>((res) => {
      resolvePromise = res
    })
    const onPurchase = vi.fn().mockReturnValue(promise)

    render(<PredictionActivityCard activity={baseActivity} onPurchase={onPurchase} />)

    // 먼저 카드를 확장
    fireEvent.click(screen.getByText("잠금"))
    fireEvent.click(screen.getByText("500G로 열람"))
    expect(screen.getByText("구매 중...")).toBeDefined()

    // Resolve and check loading disappears
    resolvePromise!(null)
    await waitFor(() => {
      expect(screen.queryByText("구매 중...")).toBeNull()
    })
  })

  it("shows predictions immediately when already purchased", () => {
    const activity = {
      ...baseActivity,
      is_purchased: true,
      predictions: [mockPrediction],
    }
    render(<PredictionActivityCard activity={activity} onPurchase={vi.fn()} />)
    expect(screen.getByText("열람 완료")).toBeDefined()
    expect(screen.getByText(/서울 vs 수원/)).toBeDefined()
  })

  it("shows free label when is_free and not purchased", () => {
    const activity = {
      ...baseActivity,
      is_free: true,
      predictions: [mockPrediction],
    }
    render(<PredictionActivityCard activity={activity} onPurchase={vi.fn()} />)
    expect(screen.getByText("경기 종료 - 무료 공개")).toBeDefined()
  })

  it("renders avatar fallback with first character", () => {
    render(<PredictionActivityCard activity={baseActivity} onPurchase={vi.fn()} />)
    expect(screen.getByText("테")).toBeDefined()
  })

  it("renders relative time", () => {
    render(<PredictionActivityCard activity={baseActivity} onPurchase={vi.fn()} />)
    expect(screen.getByText("1시간 전")).toBeDefined()
  })
})
