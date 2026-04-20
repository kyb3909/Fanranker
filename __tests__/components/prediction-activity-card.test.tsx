import React from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { PredictionActivityCard } from "@/components/my-predictions/prediction-activity-card"

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

const lockedSlipGroup = {
  slipId: "slip-1",
  sport: "축구",
  date: "02/22",
  status: "pending",
  matchCount: 3,
  analysisTitle: null,
  totalOddsRange: "3배대",
  stake: 0,
  totalOdds: 0,
  profit: 0,
  matches: [],
  analysisText: null,
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
  slipGroups: [lockedSlipGroup],
}

describe("PredictionActivityCard", () => {
  it("renders user nickname", () => {
    render(<PredictionActivityCard activity={baseActivity} onPurchase={vi.fn()} />)
    expect(screen.getByText("테스트유저")).toBeDefined()
  })

  it("renders sport label and prediction count", () => {
    render(<PredictionActivityCard activity={baseActivity} onPurchase={vi.fn()} />)
    // analysisTitle이 null이면 `{sportLabel} {matchCount}경기 조합` fallback이 Hero로 렌더됨.
    expect(screen.getByText(/축구 3경기 조합/)).toBeDefined()
    // 슬립 메타 라인에도 "축구 3경기"가 표시됨 (여러 노드 매치 허용).
    expect(screen.getAllByText(/축구 3경기/).length).toBeGreaterThan(0)
  })

  it("renders odds range in locked state", () => {
    render(<PredictionActivityCard activity={baseActivity} onPurchase={vi.fn()} />)
    // Locked일 때 정확값 대신 "배당 3배대" 범위 표시.
    expect(screen.getByText(/배당 3배대/)).toBeDefined()
  })

  it("renders analysis title when provided", () => {
    const activity = {
      ...baseActivity,
      slipGroups: [{ ...lockedSlipGroup, analysisTitle: "손흥민 오늘은 확정" }],
    }
    render(<PredictionActivityCard activity={activity} onPurchase={vi.fn()} />)
    expect(screen.getByText("손흥민 오늘은 확정")).toBeDefined()
  })

  it("renders activity date", () => {
    render(<PredictionActivityCard activity={baseActivity} onPurchase={vi.fn()} />)
    // 컴포넌트 line 281-285: created_at을 ko-KR (month: long, day: numeric) 형식으로 렌더
    // "2026-02-22T09:00:00.000Z" → "2월 22일"
    expect(screen.getByText(/2월 22일/)).toBeDefined()
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
    // 새 구조에선 "500G로 열람" 버튼이 바로 노출됨 (펼침 단계 없음).
    expect(screen.getByText("500G로 열람")).toBeDefined()
    // 잠금 안내 문구도 함께 노출.
    expect(screen.getByText(/본문과 예측 내역은 구매 후 열람/)).toBeDefined()
  })

  it("calls onPurchase and shows predictions on success", async () => {
    const onPurchase = vi.fn().mockResolvedValue([mockPrediction])
    render(<PredictionActivityCard activity={baseActivity} onPurchase={onPurchase} />)

    fireEvent.click(screen.getByText("500G로 열람"))
    expect(onPurchase).toHaveBeenCalledWith("act-1")

    await waitFor(() => {
      expect(screen.getByText("열람 완료")).toBeDefined()
      // 구매 후 slipGroups로 변환되어 경기 라인에 "서울 vs 수원" 노출
      expect(screen.getByText(/서울 vs 수원/)).toBeDefined()
    })
  })

  it("shows loading state during purchase", async () => {
    let resolvePromise: (v: null) => void
    const promise = new Promise<null>((res) => {
      resolvePromise = res
    })
    const onPurchase = vi.fn().mockReturnValue(promise)

    render(<PredictionActivityCard activity={baseActivity} onPurchase={onPurchase} />)

    fireEvent.click(screen.getByText("500G로 열람"))
    expect(screen.getByText("구매 중...")).toBeDefined()

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
      slipGroups: null,
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
      slipGroups: null,
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
    // 새 구조에선 날짜+상대시간이 한 노드로 합쳐짐("2월 22일 · 1시간 전")
    expect(screen.getByText(/1시간 전/)).toBeDefined()
  })
})
