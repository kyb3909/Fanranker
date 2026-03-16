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
    expect(screen.getByLabelText("댓글 5개")).toBeDefined()
    expect(screen.getByText("5")).toBeDefined()
  })

  it("renders temperature when provided", () => {
    render(<PostCardFooter {...defaultProps} temperature={42} />)
    expect(screen.getByText("42°")).toBeDefined()
  })

  it("does not render temperature when 0", () => {
    render(<PostCardFooter {...defaultProps} temperature={0} />)
    expect(screen.queryByText(/°$/)).toBeNull()
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

  it("renders comment link to correct post URL", () => {
    render(<PostCardFooter {...defaultProps} postId={456} />)
    const link = screen.getByLabelText("댓글 5개").closest("a")
    expect(link?.getAttribute("href")).toBe("/post/456")
  })

  it("renders ShareMenu component", () => {
    render(<PostCardFooter {...defaultProps} />)
    expect(screen.getByTestId("share-menu")).toBeDefined()
  })

  it("applies correct color for high temperature", () => {
    render(<PostCardFooter {...defaultProps} temperature={85} />)
    const tempEl = screen.getByText("85°")
    expect(tempEl.closest("div")?.className).toContain("text-red-500")
  })

  it("applies correct color for medium temperature", () => {
    render(<PostCardFooter {...defaultProps} temperature={45} />)
    const tempEl = screen.getByText("45°")
    expect(tempEl.closest("div")?.className).toContain("text-amber-500")
  })
})
