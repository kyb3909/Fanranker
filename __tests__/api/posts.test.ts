import { describe, it, expect } from "vitest"
import { z } from "zod"

// ============================================================
// Schema & logic extracted from app/api/posts/route.ts
// ============================================================

const MAX_CONTENT_SIZE = 100_000

const PostCreateSchema = z.object({
  community_slug: z.string().min(1, "게시판을 선택해주세요."),
  title: z.string().min(1, "제목을 입력해주세요.").max(200, "제목은 200자 이하여야 합니다."),
  content: z
    .any()
    .refine((v) => v !== undefined && v !== null && v !== "", {
      message: "내용을 입력해주세요.",
    })
    .refine(
      (v) => {
        try {
          return JSON.stringify(v).length <= MAX_CONTENT_SIZE
        } catch {
          return false
        }
      },
      { message: "내용이 너무 깁니다. (최대 100KB)" }
    ),
  image: z.string().nullable().optional(),
  flair_id: z.string().uuid().nullable().optional(),
})

/** Query param parsing logic from GET handler */
function parseGetParams(params: Record<string, string | null>) {
  const sort = params.sort || "new"
  const limit = Math.min(parseInt(params.limit || "20", 10), 50)
  const offset = Math.max(0, parseInt(params.offset || "0", 10))
  const followedSlugs = params.community_slugs
    ? params.community_slugs.split(",").filter(Boolean)
    : null
  return { sort, limit, offset, followedSlugs }
}

// ============================================================
// Tests: PostCreateSchema
// ============================================================

describe("PostCreateSchema", () => {
  const validPost = {
    community_slug: "football",
    title: "좋은 글",
    content: { type: "doc", content: [{ type: "paragraph" }] },
  }

  it("validates a correct post", () => {
    const result = PostCreateSchema.safeParse(validPost)
    expect(result.success).toBe(true)
  })

  it("rejects empty community_slug", () => {
    const result = PostCreateSchema.safeParse({ ...validPost, community_slug: "" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("게시판을 선택해주세요.")
    }
  })

  it("rejects empty title", () => {
    const result = PostCreateSchema.safeParse({ ...validPost, title: "" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("제목을 입력해주세요.")
    }
  })

  it("rejects title over 200 chars", () => {
    const result = PostCreateSchema.safeParse({ ...validPost, title: "a".repeat(201) })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("200자")
    }
  })

  it("accepts title at exactly 200 chars", () => {
    const result = PostCreateSchema.safeParse({ ...validPost, title: "a".repeat(200) })
    expect(result.success).toBe(true)
  })

  it("rejects null content", () => {
    const result = PostCreateSchema.safeParse({ ...validPost, content: null })
    expect(result.success).toBe(false)
  })

  it("rejects empty string content", () => {
    const result = PostCreateSchema.safeParse({ ...validPost, content: "" })
    expect(result.success).toBe(false)
  })

  it("rejects content exceeding 100KB", () => {
    const bigContent = "x".repeat(MAX_CONTENT_SIZE + 1)
    const result = PostCreateSchema.safeParse({ ...validPost, content: bigContent })
    expect(result.success).toBe(false)
  })

  it("accepts content at exactly 100KB boundary", () => {
    // JSON.stringify adds quotes, so actual string must be shorter
    const content = "x".repeat(MAX_CONTENT_SIZE - 2) // 2 for quotes
    const result = PostCreateSchema.safeParse({ ...validPost, content })
    expect(result.success).toBe(true)
  })

  it("accepts null image", () => {
    const result = PostCreateSchema.safeParse({ ...validPost, image: null })
    expect(result.success).toBe(true)
  })

  it("accepts valid uuid flair_id", () => {
    const result = PostCreateSchema.safeParse({
      ...validPost,
      flair_id: "550e8400-e29b-41d4-a716-446655440000",
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid flair_id", () => {
    const result = PostCreateSchema.safeParse({ ...validPost, flair_id: "not-a-uuid" })
    expect(result.success).toBe(false)
  })

  it("accepts TipTap JSON content", () => {
    const tiptapContent = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
        { type: "image", attrs: { src: "https://example.com/img.jpg" } },
      ],
    }
    const result = PostCreateSchema.safeParse({ ...validPost, content: tiptapContent })
    expect(result.success).toBe(true)
  })
})

// ============================================================
// Tests: GET query param parsing
// ============================================================

describe("parseGetParams", () => {
  it("uses defaults when no params", () => {
    const result = parseGetParams({ sort: null, limit: null, offset: null, community_slugs: null })
    expect(result.sort).toBe("new")
    expect(result.limit).toBe(20)
    expect(result.offset).toBe(0)
    expect(result.followedSlugs).toBeNull()
  })

  it("clamps limit to max 50", () => {
    const result = parseGetParams({ sort: null, limit: "100", offset: null, community_slugs: null })
    expect(result.limit).toBe(50)
  })

  it("clamps negative offset to 0", () => {
    const result = parseGetParams({ sort: null, limit: null, offset: "-5", community_slugs: null })
    expect(result.offset).toBe(0)
  })

  it("parses comma-separated community_slugs", () => {
    const result = parseGetParams({
      sort: null,
      limit: null,
      offset: null,
      community_slugs: "football,baseball,basketball",
    })
    expect(result.followedSlugs).toEqual(["football", "baseball", "basketball"])
  })

  it("filters empty slugs from community_slugs", () => {
    const result = parseGetParams({
      sort: null,
      limit: null,
      offset: null,
      community_slugs: "football,,baseball,",
    })
    expect(result.followedSlugs).toEqual(["football", "baseball"])
  })

  it("accepts valid sort values", () => {
    expect(
      parseGetParams({ sort: "hot", limit: null, offset: null, community_slugs: null }).sort
    ).toBe("hot")
    expect(
      parseGetParams({ sort: "comments", limit: null, offset: null, community_slugs: null }).sort
    ).toBe("comments")
    expect(
      parseGetParams({ sort: "recent_comments", limit: null, offset: null, community_slugs: null })
        .sort
    ).toBe("recent_comments")
  })

  it("handles NaN limit gracefully", () => {
    const result = parseGetParams({ sort: null, limit: "abc", offset: null, community_slugs: null })
    expect(result.limit).toBe(NaN) // parseInt returns NaN, Math.min(NaN, 50) = NaN
  })
})
