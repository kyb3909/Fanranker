import { describe, it, expect } from "vitest"

// ============================================================
// Pure logic extracted from use-post-card-actions.ts
// ============================================================

/** Optimistic vote calculation (mirrors handleVote state updates) */
function calcOptimisticVote(
  currentVote: "up" | "down" | null,
  currentCount: number,
  newType: "up" | "down"
): { vote: "up" | "down" | null; count: number } {
  // Toggle off same vote
  if (currentVote === newType) {
    return {
      vote: null,
      count: newType === "up" ? currentCount - 1 : currentCount + 1,
    }
  }
  // New vote or switch
  const delta = newType === "up" ? 1 : -1
  const reverseDelta = currentVote ? (currentVote === "up" ? -1 : 1) : 0
  return {
    vote: newType,
    count: currentCount + delta + reverseDelta,
  }
}

/** Rollback on API failure */
function rollbackVote(
  prevVote: "up" | "down" | null,
  prevCount: number
): { vote: "up" | "down" | null; count: number } {
  return { vote: prevVote, count: prevCount }
}

/** Initial vote state from props */
function initVoteState(upvotes: number, isUpvoted: boolean) {
  return {
    voteCount: upvotes,
    myVote: isUpvoted ? ("up" as const) : null,
  }
}

/** Edit URL construction */
function buildEditUrl(postId: number | string): string {
  return `/write?edit=${postId}`
}

/** Search by author URL */
function buildSearchByAuthorUrl(author: string): string {
  return `/search?q=${encodeURIComponent(author)}&type=nickname`
}

// ============================================================
// Tests: initVoteState
// ============================================================

describe("initVoteState", () => {
  it("sets myVote to 'up' when isUpvoted is true", () => {
    const state = initVoteState(10, true)
    expect(state.myVote).toBe("up")
    expect(state.voteCount).toBe(10)
  })

  it("sets myVote to null when isUpvoted is false", () => {
    const state = initVoteState(5, false)
    expect(state.myVote).toBeNull()
  })

  it("preserves exact upvotes count", () => {
    expect(initVoteState(0, false).voteCount).toBe(0)
    expect(initVoteState(999, false).voteCount).toBe(999)
  })
})

// ============================================================
// Tests: calcOptimisticVote
// ============================================================

describe("calcOptimisticVote", () => {
  describe("upvote from neutral", () => {
    it("increments count and sets vote to up", () => {
      const result = calcOptimisticVote(null, 10, "up")
      expect(result.vote).toBe("up")
      expect(result.count).toBe(11)
    })
  })

  describe("downvote from neutral", () => {
    it("decrements count and sets vote to down", () => {
      const result = calcOptimisticVote(null, 10, "down")
      expect(result.vote).toBe("down")
      expect(result.count).toBe(9)
    })
  })

  describe("toggle off upvote", () => {
    it("removes vote and decrements count", () => {
      const result = calcOptimisticVote("up", 10, "up")
      expect(result.vote).toBeNull()
      expect(result.count).toBe(9)
    })
  })

  describe("toggle off downvote", () => {
    it("removes vote and increments count", () => {
      const result = calcOptimisticVote("down", 10, "down")
      expect(result.vote).toBeNull()
      expect(result.count).toBe(11)
    })
  })

  describe("switch from upvote to downvote", () => {
    it("swings count by -2", () => {
      const result = calcOptimisticVote("up", 10, "down")
      expect(result.vote).toBe("down")
      expect(result.count).toBe(8) // -1 (reverse up) + -1 (new down)
    })
  })

  describe("switch from downvote to upvote", () => {
    it("swings count by +2", () => {
      const result = calcOptimisticVote("down", 10, "up")
      expect(result.vote).toBe("up")
      expect(result.count).toBe(12) // +1 (reverse down) + +1 (new up)
    })
  })

  describe("edge cases", () => {
    it("handles zero count upvote", () => {
      const result = calcOptimisticVote(null, 0, "up")
      expect(result.count).toBe(1)
    })

    it("handles zero count downvote", () => {
      const result = calcOptimisticVote(null, 0, "down")
      expect(result.count).toBe(-1)
    })

    it("handles negative count", () => {
      const result = calcOptimisticVote(null, -5, "up")
      expect(result.count).toBe(-4)
    })
  })
})

// ============================================================
// Tests: rollbackVote
// ============================================================

describe("rollbackVote", () => {
  it("restores previous vote and count", () => {
    const result = rollbackVote("up", 10)
    expect(result.vote).toBe("up")
    expect(result.count).toBe(10)
  })

  it("restores null vote", () => {
    const result = rollbackVote(null, 5)
    expect(result.vote).toBeNull()
    expect(result.count).toBe(5)
  })

  it("restores down vote", () => {
    const result = rollbackVote("down", 3)
    expect(result.vote).toBe("down")
    expect(result.count).toBe(3)
  })
})

// ============================================================
// Tests: Optimistic update + rollback roundtrip
// ============================================================

describe("optimistic update + rollback roundtrip", () => {
  it("upvote then rollback returns to original state", () => {
    const original = { vote: null as "up" | "down" | null, count: 10 }
    const optimistic = calcOptimisticVote(original.vote, original.count, "up")
    expect(optimistic.count).toBe(11)
    const rolled = rollbackVote(original.vote, original.count)
    expect(rolled).toEqual(original)
  })

  it("switch vote then rollback returns to original state", () => {
    const original = { vote: "up" as const, count: 10 }
    const optimistic = calcOptimisticVote(original.vote, original.count, "down")
    expect(optimistic.count).toBe(8)
    const rolled = rollbackVote(original.vote, original.count)
    expect(rolled).toEqual(original)
  })

  it("toggle off then rollback returns to original state", () => {
    const original = { vote: "down" as const, count: 5 }
    const optimistic = calcOptimisticVote(original.vote, original.count, "down")
    expect(optimistic.vote).toBeNull()
    expect(optimistic.count).toBe(6)
    const rolled = rollbackVote(original.vote, original.count)
    expect(rolled).toEqual(original)
  })
})

// ============================================================
// Tests: URL construction
// ============================================================

describe("buildEditUrl", () => {
  it("builds edit URL with numeric postId", () => {
    expect(buildEditUrl(123)).toBe("/write?edit=123")
  })

  it("builds edit URL with string postId", () => {
    expect(buildEditUrl("abc-456")).toBe("/write?edit=abc-456")
  })
})

describe("buildSearchByAuthorUrl", () => {
  it("encodes author name", () => {
    expect(buildSearchByAuthorUrl("홍길동")).toBe(
      `/search?q=${encodeURIComponent("홍길동")}&type=nickname`
    )
  })

  it("encodes special characters", () => {
    expect(buildSearchByAuthorUrl("user&name")).toBe("/search?q=user%26name&type=nickname")
  })

  it("handles empty author", () => {
    expect(buildSearchByAuthorUrl("")).toBe("/search?q=&type=nickname")
  })
})
