import React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { LiveMinute } from "@/components/match/live-minute"

/**
 * 경과 분 타이머 회귀 잠금 (2026-08-22).
 *
 * 이 타이머가 위험한 이유: 서버 값 없이 브라우저가 혼자 세는 구간이 있어서, 잘못
 * 만들면 **휴식 중에 시간이 흐른다고 거짓말한다**. 하프타임엔 LFA 분이 45 에 멈춰
 * 있는데 로컬로 계속 세면 15분 뒤 60' 을 주장하게 된다 (실제로는 후반 0분).
 * 그래서 하프 경계에서 추정이 멈추는지를 고정한다.
 */

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe("LiveMinute", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("첫 렌더는 서버 값 그대로 — SSR 결과와 같아야 한다", () => {
    render(<LiveMinute minute="54" />)
    expect(screen.getByText(/^54′$/)).toBeTruthy()
  })

  it("새로고침 없이 1분마다 올라간다", () => {
    render(<LiveMinute minute="54" />)
    advance(60_000)
    expect(screen.getByText(/^55′$/)).toBeTruthy()
    advance(120_000)
    expect(screen.getByText(/^57′$/)).toBeTruthy()
  })

  it("전반 끝(45)에서 멈춘다 — 하프타임에 후반 시간을 세지 않는다", () => {
    render(<LiveMinute minute="44" />)
    advance(60_000)
    expect(screen.getByText(/^45′$/)).toBeTruthy()
    // 하프타임 15분이 지나도 46' 로 넘어가지 않는다
    advance(15 * 60_000)
    expect(screen.getByText(/^45\+′$/)).toBeTruthy()
  })

  it("후반 끝(90)에서 멈춘다", () => {
    render(<LiveMinute minute="89" />)
    advance(10 * 60_000)
    expect(screen.getByText(/^90\+′$/)).toBeTruthy()
  })

  it("추가시간은 추가시간 쪽을 센다", () => {
    render(<LiveMinute minute="45 +2" />)
    expect(screen.getByText(/^45\+2′$/)).toBeTruthy()
    advance(60_000)
    expect(screen.getByText(/^45\+3′$/)).toBeTruthy()
  })

  it("숫자로 못 읽는 값은 손대지 않는다", () => {
    render(<LiveMinute minute="HT" />)
    advance(5 * 60_000)
    expect(screen.getByText("HT")).toBeTruthy()
  })

  it("서버가 새 값을 주면 거기서 다시 센다", () => {
    const { rerender } = render(<LiveMinute minute="54" />)
    advance(90_000)
    expect(screen.getByText(/^55′$/)).toBeTruthy()
    rerender(<LiveMinute minute="57" />)
    expect(screen.getByText(/^57′$/)).toBeTruthy()
    advance(60_000)
    expect(screen.getByText(/^58′$/)).toBeTruthy()
  })
})
