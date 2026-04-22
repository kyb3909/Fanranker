import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  getMutedUsers,
  isMuted,
  muteUser,
  unmuteUser,
  toggleMute,
  onMuteChange,
} from "@/lib/metaverse/mute-list"

describe("metaverse/mute-list", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("초기엔 빈 Set", () => {
    expect(getMutedUsers().size).toBe(0)
    expect(isMuted("user_any")).toBe(false)
  })

  it("muteUser 후 isMuted true", () => {
    muteUser("user_abc")
    expect(isMuted("user_abc")).toBe(true)
    expect(getMutedUsers().has("user_abc")).toBe(true)
  })

  it("unmuteUser 되돌리기", () => {
    muteUser("user_abc")
    unmuteUser("user_abc")
    expect(isMuted("user_abc")).toBe(false)
  })

  it("toggleMute 상태 토글 + 새 상태 반환", () => {
    expect(toggleMute("user_x")).toBe(true)
    expect(isMuted("user_x")).toBe(true)
    expect(toggleMute("user_x")).toBe(false)
    expect(isMuted("user_x")).toBe(false)
  })

  it("중복 mute 는 no-op (이벤트 방지)", () => {
    muteUser("user_dup")
    const cb = vi.fn()
    const unsub = onMuteChange(cb)
    muteUser("user_dup") // 이미 있음 → writeSet 호출 안 됨 → 이벤트 안 뜸
    expect(cb).not.toHaveBeenCalled()
    unsub()
  })

  it("onMuteChange 구독/해제", () => {
    const cb = vi.fn()
    const unsub = onMuteChange(cb)
    muteUser("user_listen")
    expect(cb).toHaveBeenCalledTimes(1)
    unmuteUser("user_listen")
    expect(cb).toHaveBeenCalledTimes(2)
    unsub()
    muteUser("user_listen")
    expect(cb).toHaveBeenCalledTimes(2) // unsub 후 안 부름
  })

  it("localStorage 손상돼도 크래시 안 남 (빈 Set 반환)", () => {
    localStorage.setItem("metaverse:muted-users", "{not json")
    expect(getMutedUsers().size).toBe(0)
  })

  it("빈 userId 는 무시", () => {
    muteUser("")
    expect(getMutedUsers().size).toBe(0)
  })
})
