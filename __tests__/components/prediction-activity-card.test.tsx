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
    // Locked일 때 정확값 대신 "3배대" 범위 표시.
    expect(screen.getByText(/3배대/)).toBeDefined()
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
    // locked 카드는 "500G로 열람" CTA가 바로 노출됨 (접힘 상태).
    expect(screen.getByText("500G로 열람")).toBeDefined()
  })

  it("calls onPurchase and shows expand toggle on success", async () => {
    const onPurchase = vi.fn().mockResolvedValue([mockPrediction])
    render(<PredictionActivityCard activity={baseActivity} onPurchase={onPurchase} />)

    fireEvent.click(screen.getByText("500G로 열람"))
    expect(onPurchase).toHaveBeenCalledWith("act-1")

    // 구매 후 카드는 기본 접힘 → "내용 보기" 토글이 나타나야 함
    await waitFor(() => {
      expect(screen.getByText("내용 보기")).toBeDefined()
    })
    // 접힌 상태이므로 경기 라인은 아직 안 보임
    expect(screen.queryByText(/서울 vs 수원/)).toBeNull()
  })

  it("expands to show match lines when 내용 보기 is clicked", async () => {
    const onPurchase = vi.fn().mockResolvedValue([mockPrediction])
    render(<PredictionActivityCard activity={baseActivity} onPurchase={onPurchase} />)

    fireEvent.click(screen.getByText("500G로 열람"))
    await waitFor(() => expect(screen.getByText("내용 보기")).toBeDefined())

    // "내용 보기" 토글 클릭 → 경기 카드 노출 + "접기"로 버튼 전환
    fireEvent.click(screen.getByText("내용 보기"))
    // 팀 이름은 경기 카드 헤더 + OddsCell label로 반복 등장 가능
    expect(screen.getAllByText("서울").length).toBeGreaterThan(0)
    expect(screen.getAllByText("수원").length).toBeGreaterThan(0)
    expect(screen.getByText("접기")).toBeDefined()
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

  it("shows expand toggle when already purchased", () => {
    const activity = {
      ...baseActivity,
      is_purchased: true,
      predictions: [mockPrediction],
      slipGroups: null,
    }
    render(<PredictionActivityCard activity={activity} onPurchase={vi.fn()} />)
    // 기본 접힘 → "내용 보기" 토글 노출, 경기 라인은 숨김
    expect(screen.getByText("내용 보기")).toBeDefined()
    expect(screen.queryByText(/서울 vs 수원/)).toBeNull()
  })

  it("shows expand toggle when is_free and not purchased", () => {
    const activity = {
      ...baseActivity,
      is_free: true,
      predictions: [mockPrediction],
      slipGroups: null,
    }
    render(<PredictionActivityCard activity={activity} onPurchase={vi.fn()} />)
    // 무료 공개 상태도 기본 접힘 → 토글로만 본문/경기 노출
    expect(screen.getByText("내용 보기")).toBeDefined()
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
