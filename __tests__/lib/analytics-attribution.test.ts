import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  captureAttribution,
  getAttribution,
  channelParams,
  markLandingFired,
} from "@/lib/analytics/attribution"

/**
 * 귀속이 틀리면 "어느 유튜버가 데려왔나"가 통째로 거짓말이 된다.
 * 특히 **최초 터치 고정**이 깨지면 재방문 가입이 전부 direct 로 흘러가
 * 채널 기여가 증발한다 — 그 회귀를 여기서 막는다.
 */

function setUrl(search: string) {
  window.history.pushState({}, "", `/landing${search}`)
}

function setReferrer(value: string) {
  Object.defineProperty(document, "referrer", { configurable: true, value })
}

describe("lib/analytics/attribution", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    setUrl("")
    setReferrer("")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("첫 방문의 UTM 을 저장한다", () => {
    setUrl("?utm_source=cog&utm_medium=youtube&utm_campaign=season_open")

    const attr = captureAttribution()

    expect(attr).toMatchObject({
      source: "cog",
      medium: "youtube",
      campaign: "season_open",
      landingPath: "/landing",
    })
    expect(getAttribution()?.source).toBe("cog")
  })

  it("이미 귀속이 있으면 다른 UTM 이 와도 덮어쓰지 않는다 (first touch)", () => {
    setUrl("?utm_source=cog")
    captureAttribution()

    setUrl("?utm_source=other_channel")
    const attr = captureAttribution()

    expect(attr?.source).toBe("cog")
    expect(getAttribution()?.source).toBe("cog")
  })

  it("UTM 이 없으면 외부 referrer 호스트를 채널로 쓴다", () => {
    setReferrer("https://www.youtube.com/watch?v=abc")

    const attr = captureAttribution()

    expect(attr?.source).toBe("youtube.com")
    expect(attr?.referrerHost).toBe("youtube.com")
  })

  it("내부 이동은 유입이 아니므로 direct 로 잡는다", () => {
    setReferrer(`${window.location.origin}/community/football`)

    const attr = captureAttribution()

    expect(attr?.source).toBe("direct")
    expect(attr?.referrerHost).toBeNull()
  })

  it("UTM 도 referrer 도 없으면 direct 로 저장한다 (분모를 잃지 않기 위해)", () => {
    const attr = captureAttribution()
    expect(attr?.source).toBe("direct")
  })

  it("localStorage 가 막혀도 예외를 던지지 않는다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    setUrl("?utm_source=cog")

    expect(() => captureAttribution()).not.toThrow()
    expect(captureAttribution()?.source).toBe("cog")
  })

  it("깨진 저장값은 무시하고 새로 귀속한다", () => {
    window.localStorage.setItem("gn_attr_v1", "{not json")
    setUrl("?utm_source=cog")

    expect(captureAttribution()?.source).toBe("cog")
  })

  it("channelParams 는 귀속이 없을 때 unknown 으로 채운다", () => {
    expect(channelParams(null)).toEqual({ channel: "unknown", channel_campaign: "none" })
  })

  it("랜딩 이벤트는 세션당 한 번만 통과한다", () => {
    expect(markLandingFired()).toBe(true)
    expect(markLandingFired()).toBe(false)
  })
})
