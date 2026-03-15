import { describe, it, expect } from "vitest"
import { z } from "zod"

// ============================================================
// Schema & logic extracted from app/api/notifications/route.ts
// ============================================================

const NotificationPatchSchema = z.object({
  notification_id: z.string().optional(),
})

/** Query param parsing logic from GET handler */
function parseNotificationGetParams(params: Record<string, string | null>) {
  const countOnly = params.count_only === "true"
  const limit = Math.min(parseInt(params.limit || "20", 10), 50)
  const offset = parseInt(params.offset || "0", 10)
  const unreadOnly = params.unread_only === "true"
  return { countOnly, limit, offset, unreadOnly }
}

// ============================================================
// Tests: NotificationPatchSchema
// ============================================================

describe("NotificationPatchSchema", () => {
  it("accepts empty body (mark all as read)", () => {
    const result = NotificationPatchSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.notification_id).toBeUndefined()
    }
  })

  it("accepts specific notification_id", () => {
    const result = NotificationPatchSchema.safeParse({ notification_id: "notif-123" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.notification_id).toBe("notif-123")
    }
  })

  it("rejects non-string notification_id", () => {
    const result = NotificationPatchSchema.safeParse({ notification_id: 123 })
    expect(result.success).toBe(false)
  })
})

// ============================================================
// Tests: GET query param parsing
// ============================================================

describe("parseNotificationGetParams", () => {
  it("uses defaults", () => {
    const result = parseNotificationGetParams({
      count_only: null,
      limit: null,
      offset: null,
      unread_only: null,
    })
    expect(result.countOnly).toBe(false)
    expect(result.limit).toBe(20)
    expect(result.offset).toBe(0)
    expect(result.unreadOnly).toBe(false)
  })

  it("enables count_only mode", () => {
    const result = parseNotificationGetParams({
      count_only: "true",
      limit: null,
      offset: null,
      unread_only: null,
    })
    expect(result.countOnly).toBe(true)
  })

  it("count_only is false for non-true values", () => {
    expect(
      parseNotificationGetParams({
        count_only: "false",
        limit: null,
        offset: null,
        unread_only: null,
      }).countOnly
    ).toBe(false)
    expect(
      parseNotificationGetParams({ count_only: "1", limit: null, offset: null, unread_only: null })
        .countOnly
    ).toBe(false)
  })

  it("clamps limit to max 50", () => {
    const result = parseNotificationGetParams({
      count_only: null,
      limit: "999",
      offset: null,
      unread_only: null,
    })
    expect(result.limit).toBe(50)
  })

  it("parses offset", () => {
    const result = parseNotificationGetParams({
      count_only: null,
      limit: null,
      offset: "40",
      unread_only: null,
    })
    expect(result.offset).toBe(40)
  })

  it("enables unread_only filter", () => {
    const result = parseNotificationGetParams({
      count_only: null,
      limit: null,
      offset: null,
      unread_only: "true",
    })
    expect(result.unreadOnly).toBe(true)
  })
})
