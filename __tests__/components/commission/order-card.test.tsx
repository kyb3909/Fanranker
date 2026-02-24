import React from "react"
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { CommissionOrderCard } from "@/components/commission/order-card"

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// Mock status badge
vi.mock("@/components/commission/status-badge", () => ({
  CommissionStatusBadge: ({ status }: { status: string }) => (
    <span data-testid="status-badge">{status}</span>
  ),
}))

const baseOrder = {
  id: "order-1",
  order_number: "ORD-001",
  title: "캐릭터 일러스트",
  status: "in_progress",
  price_gold: 5000,
  client_id: "user-a",
  artist_id: "user-b",
  delivery_days: 7,
  deadline_at: null as string | null,
  created_at: "2026-02-20T10:00:00.000Z",
  commission_packages: { name: "기본 패키지", type: "illustration" },
}

const profiles = {
  "user-a": { nickname: "클라이언트", avatar_url: null },
  "user-b": { nickname: "아티스트", avatar_url: null },
}

describe("CommissionOrderCard", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders order number and title", () => {
    render(<CommissionOrderCard order={baseOrder} currentUserId="user-a" profiles={profiles} />)
    expect(screen.getByText("ORD-001")).toBeDefined()
    expect(screen.getByText("캐릭터 일러스트")).toBeDefined()
  })

  it("shows '작가' role when current user is client", () => {
    render(<CommissionOrderCard order={baseOrder} currentUserId="user-a" profiles={profiles} />)
    expect(screen.getByText(/작가/)).toBeDefined()
    expect(screen.getByText("아티스트")).toBeDefined()
  })

  it("shows '의뢰인' role when current user is artist", () => {
    render(<CommissionOrderCard order={baseOrder} currentUserId="user-b" profiles={profiles} />)
    expect(screen.getByText(/의뢰인/)).toBeDefined()
    expect(screen.getByText("클라이언트")).toBeDefined()
  })

  it("shows fallback nickname when profiles not provided", () => {
    render(<CommissionOrderCard order={baseOrder} currentUserId="user-a" />)
    expect(screen.getByText("사용자")).toBeDefined()
  })

  it("displays price in gold with locale formatting", () => {
    render(<CommissionOrderCard order={baseOrder} currentUserId="user-a" profiles={profiles} />)
    expect(screen.getByText("5,000G")).toBeDefined()
  })

  it("shows D-day countdown when deadline is set", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-20T00:00:00.000Z"))

    const order = { ...baseOrder, deadline_at: "2026-02-25T00:00:00.000Z" }
    render(<CommissionOrderCard order={order} currentUserId="user-a" profiles={profiles} />)
    expect(screen.getByText("D-5")).toBeDefined()
  })

  it("shows overdue text when deadline passed", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-28T00:00:00.000Z"))

    const order = { ...baseOrder, deadline_at: "2026-02-25T00:00:00.000Z" }
    render(<CommissionOrderCard order={order} currentUserId="user-a" profiles={profiles} />)
    expect(screen.getByText("3일 초과")).toBeDefined()
  })

  it("hides deadline for completed orders", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-28T00:00:00.000Z"))

    const order = { ...baseOrder, status: "completed", deadline_at: "2026-02-25T00:00:00.000Z" }
    render(<CommissionOrderCard order={order} currentUserId="user-a" profiles={profiles} />)
    // Deadline info should not be shown for completed status
    expect(screen.queryByText(/일 초과/)).toBeNull()
    expect(screen.queryByText(/^D-\d/)).toBeNull()
  })

  it("hides deadline for cancelled orders", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-28T00:00:00.000Z"))

    const order = { ...baseOrder, status: "cancelled", deadline_at: "2026-02-25T00:00:00.000Z" }
    render(<CommissionOrderCard order={order} currentUserId="user-a" profiles={profiles} />)
    expect(screen.queryByText(/일 초과/)).toBeNull()
    expect(screen.queryByText(/^D-\d/)).toBeNull()
  })

  it("shows package name", () => {
    render(<CommissionOrderCard order={baseOrder} currentUserId="user-a" profiles={profiles} />)
    expect(screen.getByText("기본 패키지")).toBeDefined()
  })

  it("links to correct order detail page", () => {
    render(<CommissionOrderCard order={baseOrder} currentUserId="user-a" profiles={profiles} />)
    const link = screen.getByRole("link")
    expect(link.getAttribute("href")).toBe("/art/commissions/orders/order-1")
  })

  it("renders status badge with correct status", () => {
    render(<CommissionOrderCard order={baseOrder} currentUserId="user-a" profiles={profiles} />)
    expect(screen.getByTestId("status-badge")).toBeDefined()
    expect(screen.getByText("in_progress")).toBeDefined()
  })

  it("renders creation date in Korean format", () => {
    render(<CommissionOrderCard order={baseOrder} currentUserId="user-a" profiles={profiles} />)
    // Korean date format: 2026. 2. 20.
    expect(screen.getByText(/2026/)).toBeDefined()
  })
})
