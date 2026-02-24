import React from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { PostCardFooter } from "@/components/post-card/post-card-footer"

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// Mock ShareMenu to simplify testing
vi.mock("@/components/share-menu", () => ({
  ShareMenu: () => <div data-testid="share-menu">Share</div>,
}))

const defaultProps = {
  postId: 123,
  postTitle: "테스트 포스트",
  author: "testUser",
  avatar: "/test-avatar.jpg",
  authorTemperature: 36.5,
  temperature: 42,
  voteCount: 10,
  myVote: null as "up" | "down" | null,
  comments: 5,
  isBookmarked: false,
  onVote: vi.fn(),
  onBookmark: vi.fn(),
  onBookmarkHover: vi.fn(),
  onSearchByAuthor: vi.fn(),
  onBlockUser: vi.fn(),
}

describe("PostCardFooter", () => {
  it("renders author name", () => {
    render(<PostCardFooter {...defaultProps} />)
    expect(screen.getByText("testUser")).toBeDefined()
  })

  it("renders vote count", () => {
    render(<PostCardFooter {...defaultProps} />)
    expect(screen.getByText("10")).toBeDefined()
  })

  it("renders comment count with link", () => {
    render(<PostCardFooter {...defaultProps} />)
    expect(screen.getByLabelText("댓글 5개")).toBeDefined()
    expect(screen.getByText("5")).toBeDefined()
  })

  it("renders temperature", () => {
    render(<PostCardFooter {...defaultProps} />)
    expect(screen.getByText("42°")).toBeDefined()
  })

  it("renders author temperature when positive", () => {
    render(<PostCardFooter {...defaultProps} />)
    expect(screen.getByText("36.5°")).toBeDefined()
  })

  it("hides author temperature when zero", () => {
    render(<PostCardFooter {...defaultProps} authorTemperature={0} />)
    expect(screen.queryByText("0.0°")).toBeNull()
  })

  it("hides author temperature when undefined", () => {
    render(<PostCardFooter {...defaultProps} authorTemperature={undefined} />)
    // Only post temperature should show
    const temps = screen.getAllByText(/°/)
    expect(temps.length).toBe(1)
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

  it("renders avatar fallback with first character of author", () => {
    render(<PostCardFooter {...defaultProps} author="홍길동" />)
    expect(screen.getByText("홍")).toBeDefined()
  })

  it("renders avatar fallback '?' when author is empty", () => {
    render(<PostCardFooter {...defaultProps} author="" />)
    expect(screen.getByText("?")).toBeDefined()
  })

  it("renders ShareMenu component", () => {
    render(<PostCardFooter {...defaultProps} />)
    expect(screen.getByTestId("share-menu")).toBeDefined()
  })
})
