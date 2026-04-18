import { describe, it, expect } from "vitest"
import { extractTextFromTipTapJSON, isMediaUrl, EMBED_URL_RE } from "@/lib/tiptap/extract-text"

describe("isMediaUrl", () => {
  it("returns false for non-http text", () => {
    expect(isMediaUrl("hello world")).toBe(false)
    expect(isMediaUrl("example.com")).toBe(false)
  })

  it("detects YouTube embed URLs", () => {
    expect(isMediaUrl("https://www.youtube.com/watch?v=abc12345678")).toBe(true)
    expect(isMediaUrl("https://youtu.be/abc12345678")).toBe(true)
    expect(isMediaUrl("https://www.youtube.com/shorts/abc12345678")).toBe(true)
  })

  it("detects Instagram embed URLs", () => {
    expect(isMediaUrl("https://www.instagram.com/p/ABC123/")).toBe(true)
    expect(isMediaUrl("https://www.instagram.com/reel/XYZ789/")).toBe(true)
  })

  it("detects X/Twitter status URLs", () => {
    expect(isMediaUrl("https://twitter.com/user/status/123")).toBe(true)
    expect(isMediaUrl("https://x.com/user/status/123")).toBe(true)
  })

  it("returns false for non-media URLs", () => {
    expect(isMediaUrl("https://example.com/blog/post")).toBe(false)
    expect(isMediaUrl("https://google.com")).toBe(false)
  })
})

describe("EMBED_URL_RE", () => {
  it("is case-insensitive", () => {
    expect(EMBED_URL_RE.test("https://YOUTU.BE/abc")).toBe(true)
    expect(EMBED_URL_RE.test("https://INSTAGRAM.com/p/xyz/")).toBe(true)
  })
})

describe("extractTextFromTipTapJSON", () => {
  it("returns empty for null-ish or primitive input", () => {
    expect(extractTextFromTipTapJSON(null as never)).toBe("")
    expect(extractTextFromTipTapJSON(undefined as never)).toBe("")
    expect(extractTextFromTipTapJSON("string" as never)).toBe("")
  })

  it("extracts text from a text node", () => {
    expect(extractTextFromTipTapJSON({ type: "text", text: "hello" })).toBe("hello")
  })

  it("filters out media URL text nodes", () => {
    expect(
      extractTextFromTipTapJSON({
        type: "text",
        text: "https://www.youtube.com/watch?v=abc12345678",
      })
    ).toBe("")
  })

  it("recurses into content arrays", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "hello" },
            { type: "text", text: "world" },
          ],
        },
      ],
    }
    expect(extractTextFromTipTapJSON(doc)).toBe("hello world")
  })

  it("skips media URLs embedded within paragraphs", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "check this:" },
            { type: "text", text: "https://twitter.com/user/status/123" },
            { type: "text", text: "nice" },
          ],
        },
      ],
    }
    expect(extractTextFromTipTapJSON(doc)).toBe("check this: nice")
  })

  it("returns empty for empty content array", () => {
    expect(extractTextFromTipTapJSON({ type: "doc", content: [] })).toBe("")
  })
})
