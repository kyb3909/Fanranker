import { describe, it, expect } from "vitest"
import { transformBareImageUrlsInTipTapJSON } from "@/lib/tiptap/transform-bare-image-urls"

/** Helper: wrap nodes in a tiptap doc structure */
function doc(...content: Record<string, unknown>[]) {
  return { type: "doc", content }
}

/** Helper: a paragraph with a single text node */
function p(text: string, marks?: unknown[]) {
  const child: Record<string, unknown> = { type: "text", text }
  if (marks) child.marks = marks
  return { type: "paragraph", content: [child] }
}

/** Helper: a paragraph with a link-marked text that matches the URL */
function pLink(url: string) {
  return p(url, [{ type: "link", attrs: { href: url } }])
}

describe("transformBareImageUrlsInTipTapJSON", () => {
  describe("passthrough cases", () => {
    it("returns null/undefined input as-is", () => {
      expect(transformBareImageUrlsInTipTapJSON(null)).toBeNull()
      expect(transformBareImageUrlsInTipTapJSON(undefined)).toBeUndefined()
    })

    it("returns non-object input as-is", () => {
      expect(transformBareImageUrlsInTipTapJSON("hello")).toBe("hello")
      expect(transformBareImageUrlsInTipTapJSON(42)).toBe(42)
    })

    it("returns a non-doc object unchanged", () => {
      const obj = { type: "paragraph", content: [] }
      expect(transformBareImageUrlsInTipTapJSON(obj)).toEqual(obj)
    })

    it("returns doc without content unchanged", () => {
      const obj = { type: "doc" }
      expect(transformBareImageUrlsInTipTapJSON(obj)).toEqual(obj)
    })

    it("preserves normal text paragraphs", () => {
      const input = doc(p("Hello, world!"))
      const result = transformBareImageUrlsInTipTapJSON(input)
      expect(result).toEqual(input)
    })
  })

  describe("image URL lifting", () => {
    it("converts a bare .jpg URL paragraph to an image node", () => {
      const input = doc(p("https://example.com/photo.jpg"))
      const result = transformBareImageUrlsInTipTapJSON(input) as Record<string, unknown>
      const content = result.content as Record<string, unknown>[]
      expect(content[0]).toEqual({
        type: "image",
        attrs: { src: "https://example.com/photo.jpg", alt: "" },
      })
      expect(content[1]).toEqual({ type: "paragraph", content: [] })
    })

    it("converts a bare .png URL paragraph to an image node", () => {
      const input = doc(p("https://cdn.example.com/image.png"))
      const result = transformBareImageUrlsInTipTapJSON(input) as Record<string, unknown>
      const content = result.content as Record<string, unknown>[]
      expect(content[0]).toEqual({
        type: "image",
        attrs: { src: "https://cdn.example.com/image.png", alt: "" },
      })
    })

    it("converts a .webp URL with query string to an image node", () => {
      const input = doc(p("https://example.com/pic.webp?w=800"))
      const result = transformBareImageUrlsInTipTapJSON(input) as Record<string, unknown>
      const content = result.content as Record<string, unknown>[]
      expect(content[0]).toHaveProperty("type", "image")
    })

    it("converts a link-marked image URL to an image node", () => {
      const url = "https://example.com/photo.gif"
      const input = doc(pLink(url))
      const result = transformBareImageUrlsInTipTapJSON(input) as Record<string, unknown>
      const content = result.content as Record<string, unknown>[]
      expect(content[0]).toEqual({ type: "image", attrs: { src: url, alt: "" } })
    })
  })

  describe("embed URL lifting", () => {
    it("converts a YouTube URL to an embed node", () => {
      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      const input = doc(p(url))
      const result = transformBareImageUrlsInTipTapJSON(input) as Record<string, unknown>
      const content = result.content as Record<string, unknown>[]
      expect(content[0]).toEqual({
        type: "embed",
        attrs: { provider: "youtube", url, html: null },
      })
    })

    it("converts a youtu.be short URL to an embed node", () => {
      const url = "https://youtu.be/dQw4w9WgXcQ"
      const input = doc(p(url))
      const result = transformBareImageUrlsInTipTapJSON(input) as Record<string, unknown>
      const content = result.content as Record<string, unknown>[]
      expect(content[0]).toHaveProperty("type", "embed")
      expect((content[0] as Record<string, unknown>).attrs).toHaveProperty("provider", "youtube")
    })

    it("converts an Instagram post URL to an embed node", () => {
      const url = "https://www.instagram.com/p/ABC123xyz/"
      const input = doc(p(url))
      const result = transformBareImageUrlsInTipTapJSON(input) as Record<string, unknown>
      const content = result.content as Record<string, unknown>[]
      expect(content[0]).toEqual({
        type: "embed",
        attrs: { provider: "instagram", url, html: null },
      })
    })

    it("converts an Instagram reel URL to an embed node", () => {
      const url = "https://www.instagram.com/reel/ABC123xyz/"
      const input = doc(p(url))
      const result = transformBareImageUrlsInTipTapJSON(input) as Record<string, unknown>
      const content = result.content as Record<string, unknown>[]
      expect((content[0] as Record<string, unknown>).attrs).toHaveProperty("provider", "instagram")
    })

    it("converts a twitter.com status URL to an embed node", () => {
      const url = "https://twitter.com/user/status/1234567890"
      const input = doc(p(url))
      const result = transformBareImageUrlsInTipTapJSON(input) as Record<string, unknown>
      const content = result.content as Record<string, unknown>[]
      expect(content[0]).toEqual({
        type: "embed",
        attrs: { provider: "x", url, html: null },
      })
    })

    it("converts an x.com status URL to an embed node", () => {
      const url = "https://x.com/user/status/1234567890"
      const input = doc(p(url))
      const result = transformBareImageUrlsInTipTapJSON(input) as Record<string, unknown>
      const content = result.content as Record<string, unknown>[]
      expect((content[0] as Record<string, unknown>).attrs).toHaveProperty("provider", "x")
    })
  })

  describe("no-op cases", () => {
    it("does not convert a non-http URL", () => {
      const input = doc(p("ftp://example.com/photo.jpg"))
      const result = transformBareImageUrlsInTipTapJSON(input)
      expect(result).toEqual(input)
    })

    it("does not convert plain text that is not a URL", () => {
      const input = doc(p("This is just a regular paragraph"))
      const result = transformBareImageUrlsInTipTapJSON(input)
      expect(result).toEqual(input)
    })

    it("does not convert a paragraph with multiple text nodes", () => {
      const input = doc({
        type: "paragraph",
        content: [
          { type: "text", text: "Before " },
          { type: "text", text: "https://example.com/photo.jpg" },
        ],
      })
      const result = transformBareImageUrlsInTipTapJSON(input)
      expect(result).toEqual(input)
    })

    it("does not convert a link where href differs from text", () => {
      const input = doc(
        p("Click here", [{ type: "link", attrs: { href: "https://example.com/photo.jpg" } }])
      )
      const result = transformBareImageUrlsInTipTapJSON(input)
      expect(result).toEqual(input)
    })
  })

  describe("mixed content", () => {
    it("transforms only eligible paragraphs in a multi-node doc", () => {
      const input = doc(
        p("Hello, world!"),
        p("https://www.youtube.com/watch?v=abc12345678"),
        p("https://example.com/image.png"),
        p("Another regular paragraph")
      )
      const result = transformBareImageUrlsInTipTapJSON(input) as Record<string, unknown>
      const content = result.content as Record<string, unknown>[]

      // First paragraph: untouched
      expect(content[0]).toHaveProperty("type", "paragraph")
      // YouTube embed
      expect(content[1]).toHaveProperty("type", "embed")
      // Image node + empty paragraph
      expect(content[2]).toHaveProperty("type", "image")
      expect(content[3]).toHaveProperty("type", "paragraph")
      // Last paragraph: untouched
      expect(content[4]).toHaveProperty("type", "paragraph")
    })
  })
})
