import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { OpsBoard } from "@/app/admin/_components/ops-board"

/** 할 일 보드 화면 — 열 네 개를 그리고, 화살표가 위치 변경을 저장하는지 (2026-09-08) */

const cards = [
  {
    id: "a",
    title: "첫 카드",
    detail: "설명",
    tag: "점검",
    effort: "1일",
    status: "todo",
    position: 0,
    created_at: "2026-09-08T00:00:00Z",
    updated_at: "2026-09-08T00:00:00Z",
  },
  {
    id: "b",
    title: "둘째 카드",
    detail: "",
    tag: null,
    effort: null,
    status: "done",
    position: 0,
    created_at: "2026-09-08T00:00:00Z",
    updated_at: "2026-09-08T00:00:00Z",
  },
]

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (!init || init.method === undefined) {
      return { ok: true, json: async () => ({ cards }) }
    }
    return { ok: true, json: async () => ({ success: true }) }
  })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("할 일 보드", () => {
  it("열 네 개와 카드를 그린다", async () => {
    render(<OpsBoard />)
    expect(await screen.findByText("첫 카드")).toBeTruthy()
    for (const label of ["할 일", "진행 중", "확인 중", "완료"]) {
      expect(screen.getByRole("region", { name: label })).toBeTruthy()
    }
    expect(screen.getByText("점검")).toBeTruthy()
    expect(screen.getByText("둘째 카드")).toBeTruthy()
  })

  it("→ 를 누르면 옆 열로 옮기고 위치 변경을 저장한다", async () => {
    render(<OpsBoard />)
    await screen.findByText("첫 카드")

    const todo = screen.getByRole("region", { name: "할 일" })
    fireEvent.click(todo.querySelector('button[aria-label="오른쪽 열로"]')!)

    const doing = screen.getByRole("region", { name: "진행 중" })
    expect(doing.textContent).toContain("첫 카드")

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(String(init.body))).toEqual({
      moves: [{ id: "a", status: "doing", position: 0 }],
    })
  })

  it("완료 열의 카드는 → 가 막혀 있다", async () => {
    render(<OpsBoard />)
    await screen.findByText("둘째 카드")
    const done = screen.getByRole("region", { name: "완료" })
    const next = done.querySelector('button[aria-label="오른쪽 열로"]') as HTMLButtonElement
    expect(next.disabled).toBe(true)
  })
})
