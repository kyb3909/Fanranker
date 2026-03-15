import { describe, it, expect } from "vitest"
import { z } from "zod"

// ============================================================
// Schema extracted from app/api/comments/route.ts
// ============================================================

const CommentCreateSchema = z
  .object({
    post_id: z.string().min(1, "게시글 ID가 필요합니다."),
    content: z.string().max(5000, "댓글은 5000자 이하여야 합니다.").optional().default(""),
    parent_id: z.string().optional(),
    sticker_id: z.string().uuid().optional(),
  })
  .refine((data) => data.content.trim().length > 0 || data.sticker_id, {
    message: "댓글 내용 또는 스티커를 선택해주세요.",
  })

// ============================================================
// Tests: CommentCreateSchema
// ============================================================

describe("CommentCreateSchema", () => {
  it("validates a text comment", () => {
    const result = CommentCreateSchema.safeParse({
      post_id: "post-123",
      content: "좋은 글이네요!",
    })
    expect(result.success).toBe(true)
  })

  it("validates a sticker-only comment", () => {
    const result = CommentCreateSchema.safeParse({
      post_id: "post-123",
      sticker_id: "550e8400-e29b-41d4-a716-446655440000",
    })
    expect(result.success).toBe(true)
  })

  it("validates comment with both text and sticker", () => {
    const result = CommentCreateSchema.safeParse({
      post_id: "post-123",
      content: "스티커와 함께",
      sticker_id: "550e8400-e29b-41d4-a716-446655440000",
    })
    expect(result.success).toBe(true)
  })

  it("rejects empty content without sticker", () => {
    const result = CommentCreateSchema.safeParse({
      post_id: "post-123",
      content: "",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("스티커")
    }
  })

  it("rejects whitespace-only content without sticker", () => {
    const result = CommentCreateSchema.safeParse({
      post_id: "post-123",
      content: "   \n\t  ",
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing post_id", () => {
    const result = CommentCreateSchema.safeParse({
      content: "좋은 글이네요!",
    })
    expect(result.success).toBe(false)
  })

  it("rejects empty post_id", () => {
    const result = CommentCreateSchema.safeParse({
      post_id: "",
      content: "좋은 글이네요!",
    })
    expect(result.success).toBe(false)
  })

  it("rejects content over 5000 chars", () => {
    const result = CommentCreateSchema.safeParse({
      post_id: "post-123",
      content: "a".repeat(5001),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("5000자")
    }
  })

  it("accepts content at exactly 5000 chars", () => {
    const result = CommentCreateSchema.safeParse({
      post_id: "post-123",
      content: "a".repeat(5000),
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid sticker_id format", () => {
    const result = CommentCreateSchema.safeParse({
      post_id: "post-123",
      sticker_id: "not-a-uuid",
    })
    expect(result.success).toBe(false)
  })

  it("accepts reply comment with parent_id", () => {
    const result = CommentCreateSchema.safeParse({
      post_id: "post-123",
      content: "대댓글입니다",
      parent_id: "comment-456",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.parent_id).toBe("comment-456")
    }
  })

  it("defaults content to empty string when omitted", () => {
    const result = CommentCreateSchema.safeParse({
      post_id: "post-123",
      sticker_id: "550e8400-e29b-41d4-a716-446655440000",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.content).toBe("")
    }
  })
})
