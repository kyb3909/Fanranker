import { describe, it, expect } from "vitest"
import {
  extractEmbedsFromTipTapJSON,
  extractFirstEmbedFromTipTapJSON,
} from "@/lib/utils/tiptap-embeds"

describe("extractEmbedsFromTipTapJSON", () => {
  it("returns empty array for null/undefined input", () => {
    expect(extractEmbedsFromTipTapJSON(null)).toEqual([])
    expect(extractEmbedsFromTipTapJSON(undefined)).toEqual([])
  })

  it("returns empty array for non-object input", () => {
    expect(extractEmbedsFromTipTapJSON("string")).toEqual([])
    expect(extractEmbedsFromTipTapJSON(42)).toEqual([])
  })

  it("extracts direct embed nodes", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "embed",
          attrs: {
            provider: "youtube",
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          },
        },
      ],
    }
    const embeds = extractEmbedsFromTipTapJSON(content)
    expect(embeds).toHaveLength(1)
    expect(embeds[0].attrs.provider).toBe("youtube")
  })

  it("detects YouTube URL from text node with link mark", () => {
    const content = {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Watch this",
          marks: [
            {
              type: "link",
              attrs: { href: "https://www.youtube.com/watch?v=abc123def45" },
            },
          ],
        },
      ],
    }
    const embeds = extractEmbedsFromTipTapJSON(content)
    expect(embeds).toHaveLength(1)
    expect(embeds[0].attrs.provider).toBe("youtube")
    expect(embeds[0].attrs.url).toBe("https://www.youtube.com/watch?v=abc123def45")
    expect(embeds[0].attrs.thumbnail_url).toBe(
      "https://img.youtube.com/vi/abc123def45/hqdefault.jpg"
    )
  })

  it("detects YouTube short URL (youtu.be)", () => {
    const content = {
      type: "text",
      text: "https://youtu.be/abc123def45",
    }
    const embeds = extractEmbedsFromTipTapJSON(content)
    expect(embeds).toHaveLength(1)
    expect(embeds[0].attrs.provider).toBe("youtube")
  })

  it("detects Instagram URL from link mark", () => {
    const content = {
      type: "text",
      text: "Photo",
      marks: [
        {
          type: "link",
          attrs: { href: "https://www.instagram.com/p/ABC123/" },
        },
      ],
    }
    const embeds = extractEmbedsFromTipTapJSON(content)
    expect(embeds).toHaveLength(1)
    expect(embeds[0].attrs.provider).toBe("instagram")
  })

  it("detects Instagram reel URL", () => {
    const content = {
      type: "text",
      text: "https://www.instagram.com/reel/ABC123/",
    }
    const embeds = extractEmbedsFromTipTapJSON(content)
    expect(embeds).toHaveLength(1)
    expect(embeds[0].attrs.provider).toBe("instagram")
  })

  it("detects X/Twitter URL", () => {
    const content = {
      type: "text",
      text: "https://x.com/user/status/123456789",
    }
    const embeds = extractEmbedsFromTipTapJSON(content)
    expect(embeds).toHaveLength(1)
    expect(embeds[0].attrs.provider).toBe("x")
  })

  it("detects legacy twitter.com URL", () => {
    const content = {
      type: "text",
      text: "https://twitter.com/user/status/987654321",
    }
    const embeds = extractEmbedsFromTipTapJSON(content)
    expect(embeds).toHaveLength(1)
    expect(embeds[0].attrs.provider).toBe("x")
  })

  it("extracts multiple embeds from nested content", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "https://youtu.be/abc123def45" },
          ],
        },
        {
          type: "embed",
          attrs: { provider: "instagram", url: "https://instagram.com/p/XYZ/" },
        },
      ],
    }
    const embeds = extractEmbedsFromTipTapJSON(content)
    expect(embeds).toHaveLength(2)
    expect(embeds[0].attrs.provider).toBe("youtube")
    expect(embeds[1].attrs.provider).toBe("instagram")
  })

  it("ignores plain text without URL patterns", () => {
    const content = {
      type: "text",
      text: "Just regular text without URLs",
    }
    expect(extractEmbedsFromTipTapJSON(content)).toEqual([])
  })

  it("ignores non-embed URLs", () => {
    const content = {
      type: "text",
      text: "https://example.com/not-an-embed",
    }
    expect(extractEmbedsFromTipTapJSON(content)).toEqual([])
  })
})

describe("extractFirstEmbedFromTipTapJSON", () => {
  it("returns null when no embeds found", () => {
    expect(extractFirstEmbedFromTipTapJSON(null)).toBeNull()
    expect(extractFirstEmbedFromTipTapJSON({ type: "doc", content: [] })).toBeNull()
  })

  it("returns first embed from content", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "embed",
          attrs: { provider: "youtube", url: "https://youtube.com/watch?v=first00000" },
        },
        {
          type: "embed",
          attrs: { provider: "instagram", url: "https://instagram.com/p/second/" },
        },
      ],
    }
    const result = extractFirstEmbedFromTipTapJSON(content)
    expect(result).not.toBeNull()
    expect(result!.attrs.provider).toBe("youtube")
  })
})
