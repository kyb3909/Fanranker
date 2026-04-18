import { describe, it, expect } from "vitest"
import { extractYouTubeId } from "@/lib/embed/youtube"

describe("extractYouTubeId", () => {
  it("extracts from watch URL", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=abc12345678")).toBe("abc12345678")
  })

  it("extracts from youtu.be short URL", () => {
    expect(extractYouTubeId("https://youtu.be/abc12345678")).toBe("abc12345678")
  })

  it("extracts from embed URL", () => {
    expect(extractYouTubeId("https://www.youtube.com/embed/abc12345678")).toBe("abc12345678")
  })

  it("extracts from shorts URL", () => {
    expect(extractYouTubeId("https://www.youtube.com/shorts/abc12345678")).toBe("abc12345678")
  })

  it("handles IDs with hyphens and underscores", () => {
    expect(extractYouTubeId("https://youtu.be/abc-DEF_123")).toBe("abc-DEF_123")
  })

  it("returns null for non-YouTube URLs", () => {
    expect(extractYouTubeId("https://example.com")).toBe(null)
    expect(extractYouTubeId("https://vimeo.com/123")).toBe(null)
  })

  it("returns null for malformed YouTube URLs (wrong ID length)", () => {
    expect(extractYouTubeId("https://youtu.be/short")).toBe(null)
  })
})
