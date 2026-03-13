import { describe, it, expect } from "vitest"
import { sanitizeEmbedHtml } from "@/lib/sanitize-embed"

// Helper: build a minimal YouTube iframe HTML string
function makeIframe(src: string, extra = ""): string {
  return `<iframe src="${src}" ${extra} frameborder="0"></iframe>`
}

// -------------------------------------------------------------------
// YouTube iframes (provider = "youtube")
// -------------------------------------------------------------------

describe("sanitizeEmbedHtml – YouTube iframes", () => {
  const ytSrc = "https://www.youtube.com/embed/dQw4w9WgXcQ"

  it("returns a safe reconstructed iframe for a valid YouTube embed", () => {
    const html = makeIframe(ytSrc)
    const result = sanitizeEmbedHtml(html, "youtube")
    expect(result).toContain(`src="${ytSrc}"`)
    expect(result).toContain("allowfullscreen")
    expect(result).toContain("frameborder")
  })

  it("preserves explicit width and height attributes", () => {
    const html = makeIframe(ytSrc, `width="560" height="315"`)
    const result = sanitizeEmbedHtml(html, "youtube")
    expect(result).toContain('width="560"')
    expect(result).toContain('height="315"')
  })

  it("returns empty string for an iframe from a disallowed domain", () => {
    const html = makeIframe("https://evil.example.com/embed/foo")
    expect(sanitizeEmbedHtml(html, "youtube")).toBe("")
  })

  it("returns empty string for an HTTP (non-HTTPS) iframe src", () => {
    const html = makeIframe("http://www.youtube.com/embed/dQw4w9WgXcQ")
    expect(sanitizeEmbedHtml(html, "youtube")).toBe("")
  })

  it("returns empty string when no iframe tag is present in the HTML", () => {
    const html = "<p>No embed here</p>"
    expect(sanitizeEmbedHtml(html, "youtube")).toBe("")
  })

  it("returns empty string for a malformed/invalid iframe src URL", () => {
    const html = makeIframe("not-a-url-at-all")
    expect(sanitizeEmbedHtml(html, "youtube")).toBe("")
  })

  it("strips any extra attributes from the original iframe (XSS prevention)", () => {
    const html = makeIframe(ytSrc, `onload="alert(1)"`)
    const result = sanitizeEmbedHtml(html, "youtube")
    expect(result).not.toContain("onload")
    expect(result).toContain(ytSrc)
  })

  it("accepts youtube.com (without www) as a valid host", () => {
    const src = "https://youtube.com/embed/abc"
    const html = makeIframe(src)
    expect(sanitizeEmbedHtml(html, "youtube")).toContain(src)
  })
})

// -------------------------------------------------------------------
// X / Twitter blockquotes (provider = "x")
// -------------------------------------------------------------------

describe("sanitizeEmbedHtml – X/Twitter blockquotes", () => {
  it("returns sanitized HTML for a well-formed Twitter blockquote", () => {
    const html = `<blockquote class="twitter-tweet"><p lang="en">Hello world</p><a href="https://twitter.com/user/status/123">Tweet</a></blockquote><script async src="https://platform.twitter.com/widgets.js"></script>`
    const result = sanitizeEmbedHtml(html, "x")
    expect(result).toContain("<blockquote")
    // DOMPurify strips scripts
    expect(result).not.toContain("<script")
  })

  it("strips script tags injected inside a tweet embed", () => {
    const html = `<blockquote><p>Safe</p><script>alert('xss')</script></blockquote>`
    const result = sanitizeEmbedHtml(html, "x")
    expect(result).not.toContain("<script")
    expect(result).toContain("<blockquote")
  })

  it("returns empty string (or safe empty) for a pure script injection attempt", () => {
    const html = `<script>document.cookie='stolen'</script>`
    const result = sanitizeEmbedHtml(html, "x")
    expect(result).not.toContain("<script")
  })
})

// -------------------------------------------------------------------
// Instagram blockquotes (provider = "instagram")
// -------------------------------------------------------------------

describe("sanitizeEmbedHtml – Instagram blockquotes", () => {
  it("returns sanitized blockquote HTML for Instagram", () => {
    const html = `<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/abc123/"><p>Caption</p></blockquote>`
    const result = sanitizeEmbedHtml(html, "instagram")
    expect(result).toContain("<blockquote")
    // DOMPurify allows data-instgrm-* attributes (configured in sanitizeBlockquoteHtml)
    expect(result).toContain("instagram")
  })

  it("strips any injected script from Instagram HTML", () => {
    const html = `<blockquote><img src="x" onerror="alert(1)"><script>evil()</script></blockquote>`
    const result = sanitizeEmbedHtml(html, "instagram")
    expect(result).not.toContain("<script")
    // onerror event handler should be stripped
    expect(result).not.toContain("onerror")
  })
})
