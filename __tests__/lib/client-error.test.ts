import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { reportClientError } from "@/lib/client-error"
import * as Sentry from "@sentry/nextjs"
import { toast } from "@/hooks/use-toast"

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}))

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}))

describe("reportClientError", () => {
  beforeEach(() => {
    vi.clearAllMocks() // 모듈 mock(toast/Sentry) 호출 기록 초기화 — 테스트 간 누적 방지
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("scope 프리픽스로 console.error 에 남긴다", () => {
    const err = new Error("boom")
    reportClientError("comments.load", err)
    expect(console.error).toHaveBeenCalledWith("[comments.load]", err)
  })

  it("Sentry.captureException 에 scope 태그로 보고한다", () => {
    const err = new Error("boom")
    reportClientError("post.vote", err)
    expect(Sentry.captureException).toHaveBeenCalledWith(err, { tags: { scope: "post.vote" } })
  })

  it("opts.toast 가 있으면 destructive 토스트를 띄운다", () => {
    reportClientError("comments.create", new Error("x"), { toast: "댓글 작성 실패" })
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "댓글 작성 실패" })
  })

  it("opts.toast 가 없으면 토스트를 띄우지 않는다", () => {
    reportClientError("comments.load", new Error("x"))
    expect(toast).not.toHaveBeenCalled()
  })

  it("Error 가 아닌 값(문자열 throw)도 그대로 보고한다", () => {
    reportClientError("scope", "string-error")
    expect(console.error).toHaveBeenCalledWith("[scope]", "string-error")
    expect(Sentry.captureException).toHaveBeenCalledWith("string-error", {
      tags: { scope: "scope" },
    })
  })
})
