import { describe, it, expect } from "vitest"

// Pure re-implementations of the deduplication logic from use-feed.ts
// (mirrored here so we test the algorithm without requiring React context)

function deduplicateById<T extends { id: string }>(posts: T[]): T[] {
  const seen = new Set<string>()
  return posts.filter((post) => {
    if (seen.has(post.id)) return false
    seen.add(post.id)
    return true
  })
}

function deduplicateByTitle<T extends { id: string; title: string }>(posts: T[]): T[] {
  const seenTitles = new Map<string, string>() // normalized title → first post id
  return posts.filter((post) => {
    const normalized = post.title.trim().toLowerCase()
    const existing = seenTitles.get(normalized)
    if (existing && existing !== post.id) return false
    seenTitles.set(normalized, post.id)
    return true
  })
}

// -------------------------------------------------------------------
// deduplicateById
// -------------------------------------------------------------------

describe("deduplicateById", () => {
  it("returns the same array when all IDs are unique", () => {
    const posts = [
      { id: "a", title: "Post A" },
      { id: "b", title: "Post B" },
      { id: "c", title: "Post C" },
    ]
    expect(deduplicateById(posts)).toHaveLength(3)
  })

  it("removes duplicate IDs and keeps the first occurrence", () => {
    const posts = [
      { id: "a", title: "Original A" },
      { id: "b", title: "Post B" },
      { id: "a", title: "Duplicate A" },
    ]
    const result = deduplicateById(posts)
    expect(result).toHaveLength(2)
    expect(result[0].title).toBe("Original A")
  })

  it("handles multiple consecutive duplicates", () => {
    const posts = [
      { id: "x", title: "First" },
      { id: "x", title: "Second" },
      { id: "x", title: "Third" },
    ]
    const result = deduplicateById(posts)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe("First")
  })

  it("returns an empty array for empty input", () => {
    expect(deduplicateById([])).toEqual([])
  })

  it("returns the same single-element array unchanged", () => {
    const posts = [{ id: "only", title: "Only Post" }]
    expect(deduplicateById(posts)).toHaveLength(1)
  })

  it("preserves insertion order for unique posts", () => {
    const posts = [
      { id: "1", title: "One" },
      { id: "2", title: "Two" },
      { id: "3", title: "Three" },
    ]
    const result = deduplicateById(posts)
    expect(result.map((p) => p.id)).toEqual(["1", "2", "3"])
  })
})

// -------------------------------------------------------------------
// deduplicateByTitle
// -------------------------------------------------------------------

describe("deduplicateByTitle", () => {
  it("returns all posts when titles are unique", () => {
    const posts = [
      { id: "1", title: "Soccer Match" },
      { id: "2", title: "Basketball Game" },
    ]
    expect(deduplicateByTitle(posts)).toHaveLength(2)
  })

  it("removes posts with the same normalized title (case insensitive)", () => {
    const posts = [
      { id: "1", title: "Breaking News" },
      { id: "2", title: "breaking news" },
    ]
    const result = deduplicateByTitle(posts)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("1")
  })

  it("trims leading and trailing whitespace before comparing", () => {
    const posts = [
      { id: "1", title: "Transfer Update" },
      { id: "2", title: "  Transfer Update  " },
    ]
    const result = deduplicateByTitle(posts)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("1")
  })

  it("handles mixed-case and whitespace together", () => {
    const posts = [
      { id: "a", title: "  GOAL !" },
      { id: "b", title: "goal !" },
    ]
    const result = deduplicateByTitle(posts)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("a")
  })

  it("does NOT remove a post that shares title with itself (same id)", () => {
    // The algorithm allows a post to pass if seenTitles maps to its own id.
    // This shouldn't happen with deduplicateById run first, but is good to confirm.
    const posts = [{ id: "1", title: "Unique Post" }]
    expect(deduplicateByTitle(posts)).toHaveLength(1)
  })

  it("returns empty array for empty input", () => {
    expect(deduplicateByTitle([])).toEqual([])
  })

  it("keeps the first occurrence when multiple share the same title", () => {
    const posts = [
      { id: "first", title: "Injury Report" },
      { id: "second", title: "Injury Report" },
      { id: "third", title: "Injury Report" },
    ]
    const result = deduplicateByTitle(posts)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("first")
  })
})

// -------------------------------------------------------------------
// Combined deduplication pipeline (as used in useFeed)
// -------------------------------------------------------------------

describe("combined dedup pipeline (deduplicateById then deduplicateByTitle)", () => {
  it("removes both ID and title duplicates in sequence", () => {
    const posts = [
      { id: "1", title: "Transfer News" },
      { id: "1", title: "Transfer News" }, // exact ID dup
      { id: "2", title: "Transfer News" }, // different ID, same title
      { id: "3", title: "Match Preview" }, // fully unique
    ]

    const afterIdDedup = deduplicateById(posts)
    const afterTitleDedup = deduplicateByTitle(afterIdDedup)

    // Expect: id "1" (first Transfer News) + id "3" (Match Preview)
    expect(afterTitleDedup).toHaveLength(2)
    expect(afterTitleDedup.map((p) => p.id)).toEqual(["1", "3"])
  })

  it("preserves all unique posts through the full pipeline", () => {
    const posts = [
      { id: "a", title: "Post A" },
      { id: "b", title: "Post B" },
      { id: "c", title: "Post C" },
    ]
    const result = deduplicateByTitle(deduplicateById(posts))
    expect(result).toHaveLength(3)
  })

  it("handles an empty list through both stages", () => {
    expect(deduplicateByTitle(deduplicateById([]))).toEqual([])
  })
})
