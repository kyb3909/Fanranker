import { describe, expect, it } from "vitest"
import { columnOf, isBoardStatus, moveCard, stepStatus, type BoardCard } from "@/lib/admin/board"

function card(id: string, status: BoardCard["status"], position: number): BoardCard {
  return {
    id,
    title: id,
    detail: "",
    tag: null,
    effort: null,
    status,
    position,
    created_at: "2026-09-08T00:00:00Z",
    updated_at: "2026-09-08T00:00:00Z",
  }
}

const BOARD: BoardCard[] = [
  card("a", "todo", 0),
  card("b", "todo", 1),
  card("c", "todo", 2),
  card("d", "doing", 0),
]

describe("할 일 보드 — 카드 옮기기", () => {
  it("다른 열 맨 끝으로 옮기면 두 열의 순서가 0부터 다시 매겨진다", () => {
    const { cards, moves } = moveCard(BOARD, "a", "doing")
    expect(columnOf(cards, "todo").map((c) => c.id)).toEqual(["b", "c"])
    expect(columnOf(cards, "doing").map((c) => c.id)).toEqual(["d", "a"])
    expect(moves).toEqual([
      { id: "a", status: "doing", position: 1 },
      { id: "b", status: "todo", position: 0 },
      { id: "c", status: "todo", position: 1 },
    ])
  })

  it("같은 열 안에서 앞으로 옮기면 바뀐 카드만 moves 에 담긴다", () => {
    const { cards, moves } = moveCard(BOARD, "c", "todo", 0)
    expect(columnOf(cards, "todo").map((c) => c.id)).toEqual(["c", "a", "b"])
    expect(moves).toEqual([
      { id: "a", status: "todo", position: 1 },
      { id: "b", status: "todo", position: 2 },
      { id: "c", status: "todo", position: 0 },
    ])
    expect(columnOf(cards, "doing").map((c) => c.id)).toEqual(["d"])
  })

  it("제자리로 옮기면 아무것도 바뀌지 않는다", () => {
    const { cards, moves } = moveCard(BOARD, "b", "todo", 1)
    expect(moves).toEqual([])
    expect(cards).toEqual(BOARD)
  })

  it("없는 카드·범위를 넘는 자리도 안전하다", () => {
    expect(moveCard(BOARD, "zzz", "done")).toEqual({ cards: BOARD, moves: [] })
    const { cards } = moveCard(BOARD, "d", "todo", 99)
    expect(columnOf(cards, "todo").map((c) => c.id)).toEqual(["a", "b", "c", "d"])
    expect(columnOf(cards, "doing")).toEqual([])
  })

  it("화살표는 양 끝에서 멈춘다", () => {
    expect(stepStatus("todo", -1)).toBeNull()
    expect(stepStatus("todo", 1)).toBe("doing")
    expect(stepStatus("done", 1)).toBeNull()
    expect(stepStatus("done", -1)).toBe("review")
  })

  it("열 이름은 네 가지만 받는다", () => {
    expect(isBoardStatus("review")).toBe(true)
    expect(isBoardStatus("archived")).toBe(false)
    expect(isBoardStatus(3)).toBe(false)
  })
})
