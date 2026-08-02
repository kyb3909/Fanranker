import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * csp-report 핸들러가 "이미 아는 위반"을 Sentry 로 안 올리는지 검증.
 *
 * 배경: 2026-08-02 /benchmark 에서 페이지뷰당 Sentry 이벤트 5건이 CSP 위반으로만
 * 발생하고 있었다. 외부 호스트 차단(진짜 신호)은 계속 올라가야 하므로, 필터가
 * 과하게 먹으면 안 된다 — 그 경계를 고정한다.
 */

import type { NextRequest } from "next/server"
import { POST } from "@/app/api/security/csp-report/route"

const captureMessage = vi.fn()
vi.mock("@sentry/nextjs", () => ({ captureMessage: (...a: unknown[]) => captureMessage(...a) }))

/** 핸들러가 쓰는 건 json()/headers 뿐이라 Request 로 충분하다 */
function report(blockedUri: string, directive: string) {
  return new Request("https://gongnori.fan/api/security/csp-report", {
    method: "POST",
    headers: { "Content-Type": "application/csp-report" },
    body: JSON.stringify({
      "csp-report": {
        "document-uri": "https://gongnori.fan/season",
        "effective-directive": directive,
        "blocked-uri": blockedUri,
      },
    }),
  }) as unknown as NextRequest
}

describe("csp-report — 알려진 위반은 Sentry 로 안 올린다", () => {
  beforeEach(() => captureMessage.mockClear())

  it("Next 프레임워크 인라인 스크립트는 무시", async () => {
    await POST(report("inline", "script-src"))
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it("React 인라인 스타일도 무시", async () => {
    await POST(report("inline", "style-src"))
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it("외부 호스트 차단은 반드시 보고한다 (침입·서드파티 변경 신호)", async () => {
    await POST(report("https://evil.example.com/x.js", "script-src"))
    expect(captureMessage).toHaveBeenCalledTimes(1)
  })

  it("script/style 이 아닌 지시어의 inline 은 보고한다", async () => {
    await POST(report("inline", "frame-src"))
    expect(captureMessage).toHaveBeenCalledTimes(1)
  })

  it("항상 204 로 응답한다 (리포트 실패가 사용자에게 영향 주면 안 됨)", async () => {
    const res = await POST(report("inline", "script-src"))
    expect(res.status).toBe(204)
  })
})
