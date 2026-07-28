import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * 서버 에러 알림 계약.
 *
 * 이 로직의 실패 모드는 "안 오는 것"보다 **"너무 와서 무시하게 되는 것"** 이다.
 * 장애 하나가 초당 수십 개 에러를 만들 때 채널이 도배되면 다음 진짜 장애도 묻힌다.
 * 그래서 중복 억제·노이즈 필터가 실제로 동작하는지 잠근다.
 */

const notifyMock = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/discord-notify", () => ({
  notifyDiscordOps: (...args: unknown[]) => notifyMock(...args),
}))

import { alertServerError, __resetErrorAlertCache } from "@/lib/ops-error-alert"

describe("alertServerError", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetErrorAlertCache()
    vi.stubEnv("DISCORD_OPS_WEBHOOK_URL", "https://discord.test/webhook")
    vi.stubEnv("NODE_ENV", "production")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it("서버 에러를 경로와 함께 알린다", async () => {
    await alertServerError(new Error("DB 연결 실패"), { path: "/api/betman/prediction" })

    expect(notifyMock).toHaveBeenCalledTimes(1)
    const notice = notifyMock.mock.calls[0][0]
    expect(notice.level).toBe("alert")
    expect(notice.description).toContain("DB 연결 실패")
    expect(JSON.stringify(notice.fields)).toContain("/api/betman/prediction")
  })

  it("같은 에러가 쏟아져도 한 번만 보낸다 (도배 방지)", async () => {
    for (let i = 0; i < 30; i++) {
      await alertServerError(new Error("같은 장애"), { path: "/api/x" })
    }
    expect(notifyMock).toHaveBeenCalledTimes(1)
  })

  it("다른 경로에서 난 같은 메시지는 별개로 본다", async () => {
    await alertServerError(new Error("타임아웃"), { path: "/api/a" })
    await alertServerError(new Error("타임아웃"), { path: "/api/b" })
    expect(notifyMock).toHaveBeenCalledTimes(2)
  })

  it("쿨다운이 지나면 다시 보내되, 그동안 몇 번 더 났는지 알려준다", async () => {
    vi.useFakeTimers()
    await alertServerError(new Error("반복 장애"), { path: "/api/y" })
    for (let i = 0; i < 5; i++) {
      await alertServerError(new Error("반복 장애"), { path: "/api/y" })
    }
    expect(notifyMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(11 * 60 * 1000) // 쿨다운(10분) 경과
    await alertServerError(new Error("반복 장애"), { path: "/api/y" })

    expect(notifyMock).toHaveBeenCalledTimes(2)
    // 억제된 5건 + 이번 1건 = 6회로 묶여 보고돼야 한다
    expect(JSON.stringify(notifyMock.mock.calls[1][0].fields)).toContain("6회")
  })

  it("메시지 뒷부분이 달라도(id·타임스탬프) 같은 장애로 묶는다", async () => {
    await alertServerError(new Error("슬립 저장 실패: id=aaaaaaaa-1111"), { path: "/api/z" })
    await alertServerError(new Error("슬립 저장 실패: id=bbbbbbbb-2222"), { path: "/api/z" })
    expect(notifyMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["NEXT_REDIRECT", "redirect() 는 예외로 구현된 정상 흐름"],
    ["NEXT_NOT_FOUND", "notFound() 도 정상 흐름"],
    ["The user aborted a request", "사용자가 탭을 닫음"],
    ["JWT expired", "예상된 인증 만료"],
    ["PGRST301", "RLS 거부 — 비인가 접근 시 예상된 결과"],
  ])("%s 는 알리지 않는다 (%s)", async (message) => {
    await alertServerError(new Error(message), { path: "/api/q" })
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it("웹훅 미설정이면 조용히 아무것도 안 한다", async () => {
    vi.stubEnv("DISCORD_OPS_WEBHOOK_URL", "")
    await alertServerError(new Error("에러"), { path: "/api/a" })
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it("개발 환경에서는 보내지 않는다 (로그로 충분)", async () => {
    vi.stubEnv("NODE_ENV", "development")
    await alertServerError(new Error("에러"), { path: "/api/a" })
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it("알림 전송이 실패해도 throw 하지 않는다 — 원래 요청을 더 망가뜨리면 안 된다", async () => {
    notifyMock.mockRejectedValueOnce(new Error("웹훅 죽음"))
    await expect(alertServerError(new Error("에러"), { path: "/api/a" })).resolves.toBeUndefined()
  })

  it("Error 가 아닌 값이 던져져도 처리한다", async () => {
    await alertServerError("문자열 에러", { path: "/api/a" })
    expect(notifyMock).toHaveBeenCalledTimes(1)
  })
})
