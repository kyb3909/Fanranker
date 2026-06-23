import { describe, it, expect } from "vitest"
import { isAllowedImageUrl } from "@/lib/validate-image-url"

describe("isAllowedImageUrl", () => {
  // --- Trusted domains ---

  it("allows the Supabase storage hostname", () => {
    expect(
      isAllowedImageUrl(
        "https://ekysrlhdrapmsnrkytif.supabase.co/storage/v1/object/public/avatars/user.png"
      )
    ).toBe(true)
  })

  it("allows the Clerk avatar hostname", () => {
    expect(isAllowedImageUrl("https://img.clerk.com/eyJhbGciOiJSUzI1.jpg")).toBe(true)
  })

  it("allows URLs with query parameters on allowed hosts", () => {
    expect(
      isAllowedImageUrl(
        "https://ekysrlhdrapmsnrkytif.supabase.co/storage/v1/object/public/images/photo.webp?t=2024-01-01"
      )
    ).toBe(true)
  })

  it("allows subdomain of an allowed host", () => {
    // The implementation checks parsed.hostname.endsWith(`.${host}`)
    // e.g. a CDN subdomain of supabase.co would match .supabase.co
    expect(isAllowedImageUrl("https://cdn.ekysrlhdrapmsnrkytif.supabase.co/image.png")).toBe(true)
  })

  // --- Protocol enforcement ---

  it("rejects HTTP (non-HTTPS) URLs even for allowed hosts", () => {
    expect(
      isAllowedImageUrl(
        "http://ekysrlhdrapmsnrkytif.supabase.co/storage/v1/object/public/avatars/user.png"
      )
    ).toBe(false)
  })

  it("rejects data: URIs", () => {
    expect(isAllowedImageUrl("data:image/png;base64,abc123")).toBe(false)
  })

  // --- Unknown domains ---

  it("rejects an arbitrary external domain", () => {
    expect(isAllowedImageUrl("https://example.com/image.png")).toBe(false)
  })

  it("rejects an attacker domain that contains the allowed hostname as a substring", () => {
    // e.g. evil-ekysrlhdrapmsnrkytif.supabase.co.evil.com should NOT match
    expect(
      isAllowedImageUrl("https://evil-ekysrlhdrapmsnrkytif.supabase.co.evil.com/img.png")
    ).toBe(false)
  })

  it("rejects a CDN domain that is not a subdomain of an allowed host", () => {
    expect(isAllowedImageUrl("https://cdn.example.com/avatar.jpg")).toBe(false)
  })

  // --- Invalid / malformed inputs ---

  it("returns false for an empty string", () => {
    expect(isAllowedImageUrl("")).toBe(false)
  })

  it("returns false for a plain string that is not a URL", () => {
    expect(isAllowedImageUrl("not-a-url")).toBe(false)
  })

  it("returns false for a path-only string", () => {
    expect(isAllowedImageUrl("/images/photo.png")).toBe(false)
  })

  // --- Self-hosted storage proxy path ---

  it("allows the self-hosted /storage/ proxy path", () => {
    // next.config rewrites /storage/* → Supabase Storage; uploads return this path.
    expect(isAllowedImageUrl("/storage/posts/user_x/1700000000-abcd1234.webp")).toBe(true)
  })

  it("rejects a protocol-relative URL disguised as a storage path", () => {
    // `//evil.com/...` must not be treated as the self-hosted /storage/ path.
    expect(isAllowedImageUrl("//evil.com/storage/x.png")).toBe(false)
  })

  it("rejects other path-only strings that are not /storage/", () => {
    expect(isAllowedImageUrl("/storageX/posts/x.webp")).toBe(false)
  })

  it("returns false for a javascript: URI", () => {
    expect(isAllowedImageUrl("javascript:alert(1)")).toBe(false)
  })
})
