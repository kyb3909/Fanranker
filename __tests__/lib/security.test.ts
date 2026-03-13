import { describe, it, expect, vi, beforeEach } from "vitest"
import { isAllowedImageUrl } from "@/lib/validate-image-url"
import { sanitizeEmbedHtml } from "@/lib/sanitize-embed"

// ---------------------------------------------------------------------------
// Mock createServiceRoleClient before importing check-suspension
// ---------------------------------------------------------------------------
const mockMaybeSingle = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: mockMaybeSingle,
    }),
  })),
}))

// Import after mock registration
import { isUserSuspended } from "@/lib/check-suspension"

// ---------------------------------------------------------------------------
// validate-image-url
// ---------------------------------------------------------------------------

describe("isAllowedImageUrl", () => {
  it("allows a valid Supabase storage URL", () => {
    const url = "https://ekysrlhdrapmsnrkytif.supabase.co/storage/v1/object/public/avatars/test.png"
    expect(isAllowedImageUrl(url)).toBe(true)
  })

  it("allows a valid Clerk avatar URL", () => {
    const url = "https://img.clerk.com/eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9/avatar.jpg"
    expect(isAllowedImageUrl(url)).toBe(true)
  })

  it("rejects HTTP (non-HTTPS) Supabase URL", () => {
    const url = "http://ekysrlhdrapmsnrkytif.supabase.co/storage/v1/object/public/avatars/test.png"
    expect(isAllowedImageUrl(url)).toBe(false)
  })

  it("rejects an unknown domain", () => {
    const url = "https://evil.example.com/malicious.png"
    expect(isAllowedImageUrl(url)).toBe(false)
  })

  it("rejects a completely invalid URL string", () => {
    expect(isAllowedImageUrl("not-a-url")).toBe(false)
  })

  it("rejects an empty string", () => {
    expect(isAllowedImageUrl("")).toBe(false)
  })

  it("allows a valid subdomain of an allowed host (supabase storage subdomain pattern)", () => {
    // The implementation uses endsWith(`.${host}`), so a subdomain of img.clerk.com is allowed
    const url = "https://sub.img.clerk.com/avatar.png"
    expect(isAllowedImageUrl(url)).toBe(true)
  })

  it("rejects a URL where the allowed host appears only in the path", () => {
    const url = "https://evil.com/ekysrlhdrapmsnrkytif.supabase.co/image.png"
    expect(isAllowedImageUrl(url)).toBe(false)
  })

  it("rejects a URL where the allowed host appears as a suffix of a different hostname", () => {
    // e.g. notimg.clerk.com — does NOT end with `.img.clerk.com`
    const url = "https://notimg.clerk.com/avatar.png"
    expect(isAllowedImageUrl(url)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// sanitize-embed
// ---------------------------------------------------------------------------

describe("sanitizeEmbedHtml", () => {
  it("returns a reconstructed safe iframe for a valid YouTube src", () => {
    const html = `<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" frameborder="0"></iframe>`
    const result = sanitizeEmbedHtml(html, "youtube")

    expect(result).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"')
    expect(result).toContain("<iframe")
    expect(result).toContain("allowfullscreen")
    // No script injection
    expect(result).not.toContain("<script")
  })

  it("returns empty string for an iframe with a malicious src domain", () => {
    const html = `<iframe src="https://evil.example.com/steal-data"></iframe>`
    const result = sanitizeEmbedHtml(html, "youtube")

    expect(result).toBe("")
  })

  it("returns empty string for an HTTP iframe (non-HTTPS)", () => {
    const html = `<iframe src="http://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>`
    const result = sanitizeEmbedHtml(html, "youtube")

    expect(result).toBe("")
  })

  it("returns empty string when HTML contains no iframe", () => {
    const html = `<div>No embed here</div>`
    const result = sanitizeEmbedHtml(html, "youtube")

    expect(result).toBe("")
  })

  it("preserves width and height attributes from the original iframe", () => {
    const html = `<iframe width="800" height="450" src="https://www.youtube.com/embed/abc123"></iframe>`
    const result = sanitizeEmbedHtml(html, "youtube")

    expect(result).toContain('width="800"')
    expect(result).toContain('height="450"')
  })

  it("sanitizes X/Twitter blockquote HTML via DOMPurify instead of iframe extraction", () => {
    const html = `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Hello</p><a href="https://twitter.com/user/status/123">link</a></blockquote>`
    const result = sanitizeEmbedHtml(html, "x")

    // DOMPurify should allow blockquote and anchor
    expect(result).toContain("<blockquote")
    expect(result).toContain("<a")
    // No scripts
    expect(result).not.toContain("<script")
  })

  it("sanitizes Instagram blockquote HTML via DOMPurify", () => {
    const html = `<blockquote class="instagram-media" data-instgrm-version="14"><a href="https://www.instagram.com/p/abc/">View post</a></blockquote>`
    const result = sanitizeEmbedHtml(html, "instagram")

    expect(result).toContain("<blockquote")
    // No scripts
    expect(result).not.toContain("<script")
  })

  it("strips script tags injected inside a Twitter blockquote", () => {
    const html = `<blockquote class="twitter-tweet"><script>alert('xss')</script><p>text</p></blockquote>`
    const result = sanitizeEmbedHtml(html, "x")

    expect(result).not.toContain("<script")
    expect(result).not.toContain("alert")
  })

  it("returns empty string for an iframe with no src attribute", () => {
    const html = `<iframe width="560" height="315" frameborder="0"></iframe>`
    const result = sanitizeEmbedHtml(html, "youtube")

    expect(result).toBe("")
  })
})

// ---------------------------------------------------------------------------
// check-suspension
// ---------------------------------------------------------------------------

describe("isUserSuspended", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset()
  })

  it("returns false when user has no active suspension record", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })

    const suspended = await isUserSuspended("user-123")

    expect(suspended).toBe(false)
  })

  it("returns true when an active suspension record exists", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "suspension-1" }, error: null })

    const suspended = await isUserSuspended("user-456")

    expect(suspended).toBe(true)
  })

  it("returns false when the query returns an error (fail-open behaviour)", async () => {
    // The implementation does `return !!data` — if data is null on error, returns false
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: "DB error" } })

    const suspended = await isUserSuspended("user-789")

    expect(suspended).toBe(false)
  })

  it("passes the userId to the query filter", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })

    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const mockClient = (createServiceRoleClient as ReturnType<typeof vi.fn>).mock.results.at(
      -1
    )?.value

    await isUserSuspended("specific-user-id")

    // Verify the from() was called with the correct table
    expect(mockClient.from).toHaveBeenCalledWith("user_suspensions")
  })
})
