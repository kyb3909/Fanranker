import { describe, it, expect } from "vitest"
import {
  isProbablyDirectImageUrl,
  needsOembedImageResolve,
  isAllowedResolvedImageHost,
} from "@/lib/image-paste-url"

describe("isProbablyDirectImageUrl", () => {
  it("returns true for .jpg URLs", () => {
    expect(isProbablyDirectImageUrl("https://example.com/photo.jpg")).toBe(true)
    expect(isProbablyDirectImageUrl("https://example.com/photo.jpeg")).toBe(true)
  })

  it("returns true for .png URLs", () => {
    expect(isProbablyDirectImageUrl("https://example.com/photo.png")).toBe(true)
  })

  it("returns true for .gif URLs", () => {
    expect(isProbablyDirectImageUrl("https://example.com/anim.gif")).toBe(true)
  })

  it("returns true for .webp URLs", () => {
    expect(isProbablyDirectImageUrl("https://example.com/photo.webp")).toBe(true)
  })

  it("returns true for .avif URLs", () => {
    expect(isProbablyDirectImageUrl("https://example.com/photo.avif")).toBe(true)
  })

  it("returns true for image URL with query params", () => {
    expect(isProbablyDirectImageUrl("https://cdn.com/img.jpg?w=500&h=300")).toBe(true)
  })

  it("returns true for image URL with hash", () => {
    expect(isProbablyDirectImageUrl("https://cdn.com/img.png#section")).toBe(true)
  })

  it("returns false for non-image URLs", () => {
    expect(isProbablyDirectImageUrl("https://example.com/page.html")).toBe(false)
    expect(isProbablyDirectImageUrl("https://example.com/doc.pdf")).toBe(false)
    expect(isProbablyDirectImageUrl("https://example.com/")).toBe(false)
  })

  it("returns false for non-http protocols", () => {
    expect(isProbablyDirectImageUrl("ftp://example.com/photo.jpg")).toBe(false)
    expect(isProbablyDirectImageUrl("data:image/png;base64,abc")).toBe(false)
  })

  it("returns false for invalid URLs", () => {
    expect(isProbablyDirectImageUrl("not-a-url")).toBe(false)
    expect(isProbablyDirectImageUrl("")).toBe(false)
  })

  it("is case insensitive for extensions", () => {
    expect(isProbablyDirectImageUrl("https://example.com/PHOTO.JPG")).toBe(true)
    expect(isProbablyDirectImageUrl("https://example.com/photo.PNG")).toBe(true)
  })
})

describe("needsOembedImageResolve", () => {
  it("returns true for imgur.com page URLs", () => {
    expect(needsOembedImageResolve("https://imgur.com/gallery/abc123")).toBe(true)
  })

  it("returns false for i.imgur.com direct URLs", () => {
    expect(needsOembedImageResolve("https://i.imgur.com/abc123.jpg")).toBe(false)
  })

  it("returns true for giphy.com page URLs", () => {
    expect(needsOembedImageResolve("https://giphy.com/gifs/abc123")).toBe(true)
  })

  it("returns false for media.giphy.com direct URLs", () => {
    expect(needsOembedImageResolve("https://media.giphy.com/media/abc/giphy.gif")).toBe(false)
    expect(needsOembedImageResolve("https://media0.giphy.com/media/abc/giphy.gif")).toBe(false)
  })

  it("returns false for other domains", () => {
    expect(needsOembedImageResolve("https://example.com/image.jpg")).toBe(false)
    expect(needsOembedImageResolve("https://google.com/")).toBe(false)
  })

  it("returns false for non-http protocols", () => {
    expect(needsOembedImageResolve("ftp://imgur.com/abc")).toBe(false)
  })

  it("returns false for invalid URLs", () => {
    expect(needsOembedImageResolve("not-a-url")).toBe(false)
  })
})

describe("isAllowedResolvedImageHost", () => {
  it("allows i.imgur.com", () => {
    expect(isAllowedResolvedImageHost("https://i.imgur.com/abc.jpg")).toBe(true)
  })

  it("allows s.imgur.com", () => {
    expect(isAllowedResolvedImageHost("https://s.imgur.com/abc.jpg")).toBe(true)
  })

  it("allows media.giphy.com", () => {
    expect(isAllowedResolvedImageHost("https://media.giphy.com/media/abc/giphy.gif")).toBe(true)
    expect(isAllowedResolvedImageHost("https://media4.giphy.com/media/abc/giphy.gif")).toBe(true)
  })

  it("rejects other domains", () => {
    expect(isAllowedResolvedImageHost("https://evil.com/steal.jpg")).toBe(false)
    expect(isAllowedResolvedImageHost("https://example.com/image.png")).toBe(false)
  })

  it("rejects http (not https)", () => {
    expect(isAllowedResolvedImageHost("http://i.imgur.com/abc.jpg")).toBe(false)
  })

  it("rejects invalid URLs", () => {
    expect(isAllowedResolvedImageHost("not-a-url")).toBe(false)
  })
})
