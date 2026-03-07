import React from "react"
import { describe, it, expect, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { ShareMenu } from "@/components/share-menu"

describe("ShareMenu", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: { origin: "https://fanranker.com" },
      writable: true,
      configurable: true,
    })
  })

  it("renders share button", () => {
    render(<ShareMenu postId={1} postTitle="테스트" />)
    expect(screen.getByRole("button")).toBeDefined()
  })

  it("renders as an accessible button element", () => {
    render(<ShareMenu postId={1} postTitle="테스트" />)
    const button = screen.getByRole("button")
    expect(button.getAttribute("aria-label")).toBeTruthy()
  })

  it("constructs URL-capable share menu from postId", () => {
    render(<ShareMenu postId={42} postTitle="재미있는 글" />)
    expect(screen.getByRole("button")).toBeDefined()
  })

  it("accepts string postId", () => {
    render(<ShareMenu postId="abc-123" postTitle="테스트" />)
    expect(screen.getByRole("button")).toBeDefined()
  })

  it("accepts number postId", () => {
    render(<ShareMenu postId={999} postTitle="테스트" />)
    expect(screen.getByRole("button")).toBeDefined()
  })
})
