import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { CardVsVote } from "@/components/vs/card-vs-vote"

/**
 * 결과 공개 규칙 회귀 잠금 (2026-08-12).
 *
 * 이 규칙이 왜 테스트가 필요한가: 30일간 폴 238개가 만들어지는 동안 10표를 넘긴
 * 폴이 0개라 **아무도 결과를 본 적이 없었다**. 프로덕션 데이터로는 이 경로가
 * 영원히 안 밟히므로(그래서 사고를 눈치챌 수도 없었다) 테스트로 고정한다.
 *
 * 잠그는 진리표 — 표기는 셋 중 하나로만 간다:
 *   퍼센트  : 3표 이상 AND 양쪽 다 1표 이상            → "67%"
 *   실수    : 그 미만이되 내가 던졌을 때                 → "2"
 *   첫 표   : 내가 던졌고 그게 그 폴의 1표째일 때         → "첫 표"
 *   아무것도: 내가 안 던졌을 때 (0 전시 금지)
 */

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: true }),
  useClerk: () => ({ openSignIn: vi.fn() }),
}))
vi.mock("@/lib/analytics/events", () => ({ trackEvent: vi.fn() }))

function makeVs(over: Partial<Parameters<typeof CardVsVote>[0]["vs"]> = {}) {
  return {
    pollId: "p1",
    question: "이 이적, 필요한가?",
    aKey: "a",
    aLabel: "필요하다",
    bKey: "b",
    bLabel: "필요 없다",
    aPct: 50,
    total: 0,
    ...over,
  } as Parameters<typeof CardVsVote>[0]["vs"]
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response)
  )
  sessionStorage.clear()
})

describe("CardVsVote — strip 결과 표기", () => {
  it("아무도 안 눌렀으면 숫자를 전시하지 않는다 (빈 상태 광고 금지)", () => {
    render(<CardVsVote vs={makeVs()} surface="card" variant="strip" />)
    expect(screen.queryByText("첫 표")).toBeNull()
    expect(screen.queryByText("0")).toBeNull()
    expect(screen.queryByText(/%$/)).toBeNull()
  })

  it("첫 표를 던지면 퍼센트(100%)가 아니라 '첫 표'가 뜬다", async () => {
    render(<CardVsVote vs={makeVs()} surface="card" variant="strip" />)
    fireEvent.click(screen.getByRole("radio", { name: /필요하다/ }))
    await waitFor(() => expect(screen.getByText("첫 표")).toBeDefined())
    // 1표를 100% 로 그리면 유령 사이트로 읽힌다 — 절대 안 나와야 한다
    expect(screen.queryByText("100%")).toBeNull()
  })

  it("한쪽에만 표가 몰려 있으면 3표를 넘겨도 퍼센트를 쓰지 않는다", async () => {
    // 기존 4표가 전부 A — 내가 A 를 더 눌러도 B 는 0 이라 100% vs 0% 가 된다
    render(<CardVsVote vs={makeVs({ total: 4, aPct: 100 })} surface="card" variant="strip" />)
    fireEvent.click(screen.getByRole("radio", { name: /필요하다/ }))
    await waitFor(() => expect(screen.getByText("5")).toBeDefined())
    expect(screen.queryByText("100%")).toBeNull()
    expect(screen.queryByText("0%")).toBeNull()
  })

  it("양쪽에 표가 있고 3표 이상이면 퍼센트로 바뀐다", async () => {
    // 기존 3표 = A 2 / B 1 → B 를 누르면 A 2 / B 2 = 50:50
    render(<CardVsVote vs={makeVs({ total: 3, aPct: 67 })} surface="card" variant="strip" />)
    fireEvent.click(screen.getByRole("radio", { name: /필요 없다/ }))
    await waitFor(() => expect(screen.getAllByText("50%").length).toBe(2))
  })

  it("투표가 실패하면 표기도 함께 되돌아간다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response)
    )
    render(<CardVsVote vs={makeVs()} surface="card" variant="strip" />)
    fireEvent.click(screen.getByRole("radio", { name: /필요하다/ }))
    await waitFor(() => expect(screen.queryByText("첫 표")).toBeNull())
  })
})
