import { describe, it, expect } from "vitest"
import { countAllComments, transformComments } from "@/lib/utils/comments"
import type { Comment } from "@/components/post-detail/post-detail-types"

describe("countAllComments", () => {
  it("returns 0 for empty array", () => {
    expect(countAllComments([])).toBe(0)
  })

  it("counts flat comments", () => {
    const comments: Comment[] = [
      { id: "1", author: "A", avatar: "", timestamp: "", content: "hi", upvotes: 0 },
      { id: "2", author: "B", avatar: "", timestamp: "", content: "hey", upvotes: 0 },
    ]
    expect(countAllComments(comments)).toBe(2)
  })

  it("counts nested replies recursively", () => {
    const comments: Comment[] = [
      {
        id: "1",
        author: "A",
        avatar: "",
        timestamp: "",
        content: "hi",
        upvotes: 0,
        replies: [
          {
            id: "1-1",
            author: "B",
            avatar: "",
            timestamp: "",
            content: "reply",
            upvotes: 0,
            replies: [
              {
                id: "1-1-1",
                author: "C",
                avatar: "",
                timestamp: "",
                content: "nested",
                upvotes: 0,
              },
            ],
          },
        ],
      },
    ]
    expect(countAllComments(comments)).toBe(3)
  })

  it("handles comments without replies property", () => {
    const comments: Comment[] = [
      { id: "1", author: "A", avatar: "", timestamp: "", content: "hi", upvotes: 0 },
    ]
    expect(countAllComments(comments)).toBe(1)
  })
})

describe("transformComments", () => {
  const profiles = [
    { user_id: "u1", nickname: "Alice", avatar_url: "/alice.jpg" },
    { user_id: "u2", nickname: "Bob", avatar_url: null },
  ]

  it("transforms flat comments with profiles", () => {
    const dbComments = [
      {
        id: "c1",
        user_id: "u1",
        parent_id: null,
        content: "Hello",
        vote_count: 5,
        created_at: "2026-03-14T10:00:00Z",
      },
      {
        id: "c2",
        user_id: "u2",
        parent_id: null,
        content: "World",
        vote_count: 0,
        created_at: "2026-03-14T10:01:00Z",
      },
    ]

    const result = transformComments(dbComments, profiles)
    expect(result).toHaveLength(2)
    expect(result[0].author).toBe("Alice")
    expect(result[0].avatar).toBe("/alice.jpg")
    expect(result[0].upvotes).toBe(5)
    expect(result[1].author).toBe("Bob")
    expect(result[1].avatar).toBe("/placeholder-user.jpg") // null avatar fallback
  })

  it("builds parent-child hierarchy", () => {
    const dbComments = [
      {
        id: "c1",
        user_id: "u1",
        parent_id: null,
        content: "Parent",
        vote_count: 0,
        created_at: "2026-03-14T10:00:00Z",
      },
      {
        id: "c2",
        user_id: "u2",
        parent_id: "c1",
        content: "Reply",
        vote_count: 0,
        created_at: "2026-03-14T10:01:00Z",
      },
    ]

    const result = transformComments(dbComments, profiles)
    expect(result).toHaveLength(1) // only root
    expect(result[0].replies).toHaveLength(1)
    expect(result[0].replies![0].content).toBe("Reply")
  })

  it("uses fallback for unknown user", () => {
    const dbComments = [
      {
        id: "c1",
        user_id: "unknown",
        parent_id: null,
        content: "Test",
        vote_count: 0,
        created_at: "2026-03-14T10:00:00Z",
      },
    ]

    const result = transformComments(dbComments, profiles)
    expect(result[0].author).toBe("익명")
    expect(result[0].avatar).toBe("/placeholder-user.jpg")
  })

  it("maps sticker data", () => {
    const dbComments = [
      {
        id: "c1",
        user_id: "u1",
        parent_id: null,
        content: "",
        vote_count: 0,
        created_at: "2026-03-14T10:00:00Z",
        sticker_id: "s1",
        stickers: { id: "s1", name: "Laugh", image_url: "/laugh.png" },
      },
    ]

    const result = transformComments(dbComments, profiles)
    expect(result[0].sticker).toEqual({ id: "s1", name: "Laugh", image_url: "/laugh.png" })
  })

  it("maps equipped titles", () => {
    const dbComments = [
      {
        id: "c1",
        user_id: "u1",
        parent_id: null,
        content: "Test",
        vote_count: 0,
        created_at: "2026-03-14T10:00:00Z",
      },
    ]
    const equippedTitles = [
      {
        user_id: "u1",
        board_slug: "football",
        adj_titles: { title: "전설의", rarity: "legendary" },
        noun_titles: { title: "골잡이" },
      },
    ]

    const result = transformComments(dbComments, profiles, equippedTitles)
    expect(result[0].titleDisplay).toEqual({
      adjTitle: "전설의",
      nounTitle: "골잡이",
      rarity: "legendary",
    })
  })

  it("returns empty array for empty input", () => {
    expect(transformComments([], [])).toEqual([])
  })
})
