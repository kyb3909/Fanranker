import { describe, it, expect } from "vitest"
import { canUseOptimizedFeedImage } from "@/lib/image/feed-selector"

describe("canUseOptimizedFeedImage", () => {
  it("allows YouTube thumbnail hosts", () => {
    expect(canUseOptimizedFeedImage("https://i.ytimg.com/vi/abc/hqdefault.jpg")).toBe(true)
    expect(canUseOptimizedFeedImage("https://img.youtube.com/vi/abc/0.jpg")).toBe(true)
  })

  it("allows Twitter image host", () => {
    expect(canUseOptimizedFeedImage("https://pbs.twimg.com/media/xyz.jpg")).toBe(true)
  })

  it("allows Clerk avatar host", () => {
    expect(canUseOptimizedFeedImage("https://img.clerk.com/avatar.png")).toBe(true)
  })

  it("allows any *.supabase.co subdomain", () => {
    expect(
      canUseOptimizedFeedImage("https://ekysrlhdrapmsnrkytif.supabase.co/storage/v1/...")
    ).toBe(true)
  })

  it("allows any *.cdninstagram.com subdomain", () => {
    expect(canUseOptimizedFeedImage("https://scontent.cdninstagram.com/p/abc.jpg")).toBe(true)
  })

  it("rejects other hosts", () => {
    expect(canUseOptimizedFeedImage("https://example.com/image.jpg")).toBe(false)
    expect(canUseOptimizedFeedImage("https://evil.site/foo.png")).toBe(false)
  })

  it("rejects malformed URLs", () => {
    expect(canUseOptimizedFeedImage("not a url")).toBe(false)
    expect(canUseOptimizedFeedImage("")).toBe(false)
  })
})
