import React from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { PostCardFooter } from "@/components/post-card/post-card-footer"

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock("@/components/share-menu", () => ({
  ShareMenu: () => <div data-testid="share-menu">Share</div>,
}))

const defaultProps = {
  postId: 123,
  postTitle: "테스트 포스트",
  voteCount: 10,
  myVote: null as "up" | "down" | null,
  comments: 5,
  isBookmarked: false,
  onVote: vi.fn(),
  onBookmark: vi.fn(),
  onBookmarkHover: vi.fn(),
}

describe("PostCardFooter", () => {
  it("renders vote count", () => {
    render(<PostCardFooter {...defaultProps} />)
    expect(screen.getByText("10")).toBeDefined()
  })

  it("renders comment count with link", () => {
    render(<PostCardFooter {...defaultProps} />)
    expect(screen.getByText("5")).toBeDefined()
  })

  it("calls onVote with 'up' when upvote clicked", () => {
    const onVote = vi.fn()
    render(<PostCardFooter {...defaultProps} onVote={onVote} />)
    fireEvent.click(screen.getByLabelText("추천"))
    expect(onVote).toHaveBeenCalledWith("up")
  })

  it("calls onVote with 'down' when downvote clicked", () => {
    const onVote = vi.fn()
    render(<PostCardFooter {...defaultProps} onVote={onVote} />)
    fireEvent.click(screen.getByLabelText("비추천"))
    expect(onVote).toHaveBeenCalledWith("down")
  })

  it("applies active style when myVote is 'up'", () => {
    render(<PostCardFooter {...defaultProps} myVote="up" />)
    const btn = screen.getByLabelText("추천")
    expect(btn.getAttribute("aria-pressed")).toBe("true")
  })

  it("applies active style when myVote is 'down'", () => {
    render(<PostCardFooter {...defaultProps} myVote="down" />)
    const btn = screen.getByLabelText("비추천")
    expect(btn.getAttribute("aria-pressed")).toBe("true")
  })

  it("calls onBookmark when bookmark button clicked", () => {
    const onBookmark = vi.fn()
    render(<PostCardFooter {...defaultProps} onBookmark={onBookmark} />)
    fireEvent.click(screen.getByLabelText("북마크 추가"))
    expect(onBookmark).toHaveBeenCalledOnce()
  })

  it("shows '북마크 해제' label when bookmarked", () => {
    render(<PostCardFooter {...defaultProps} isBookmarked={true} />)
    expect(screen.getByLabelText("북마크 해제")).toBeDefined()
  })

  it("shows '북마크 추가' label when not bookmarked", () => {
    render(<PostCardFooter {...defaultProps} isBookmarked={false} />)
    expect(screen.getByLabelText("북마크 추가")).toBeDefined()
  })

  it("renders ShareMenu component", () => {
    render(<PostCardFooter {...defaultProps} />)
    expect(screen.getByTestId("share-menu")).toBeDefined()
  })
})
