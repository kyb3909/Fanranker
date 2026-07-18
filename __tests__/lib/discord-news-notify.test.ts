import { describe, it, expect } from "vitest"
import {
  resolveNewsChannel,
  withDiscordUtm,
  TICKER_SOURCE_CHANNEL,
} from "@/lib/discord/news-notify"

describe("resolveNewsChannel", () => {
  it("제목의 팀 키워드로 팀 채널을 정한다", () => {
    expect(resolveNewsChannel(["아스날, 리버풀전 선발 라인업 발표"])).toBe("football") // 두 팀 → 종합
    expect(resolveNewsChannel(["아스널 신규 영입 임박"])).toBe("arsenal")
    expect(resolveNewsChannel(["리버풀 살라 재계약"])).toBe("liverpool")
    expect(resolveNewsChannel(["첼시, 겨울 이적시장 정리"])).toBe("chelsea")
  })

  it("영문 엔티티(surface)로도 매칭한다", () => {
    expect(resolveNewsChannel(["신규 소식", "Arsenal"])).toBe("arsenal")
    expect(resolveNewsChannel([null, undefined, "Liverpool FC"])).toBe("liverpool")
  })

  it("매칭 실패 또는 두 팀 이상이면 종합(football)", () => {
    expect(resolveNewsChannel(["레알 마드리드 챔스 우승"])).toBe("football")
    expect(resolveNewsChannel(["아스날 vs 첼시 프리뷰"])).toBe("football")
    expect(resolveNewsChannel([])).toBe("football")
    expect(resolveNewsChannel([null, undefined])).toBe("football")
  })
})

describe("withDiscordUtm", () => {
  it("UTM 파라미터를 부착한다", () => {
    expect(withDiscordUtm("/prediction", "digest")).toContain(
      "/prediction?utm_source=discord&utm_medium=digest"
    )
  })

  it("기존 쿼리가 있으면 & 로 잇는다", () => {
    expect(withDiscordUtm("/community/football?sort=new", "news_football")).toContain(
      "sort=new&utm_source=discord&utm_medium=news_football"
    )
  })
})

describe("TICKER_SOURCE_CHANNEL", () => {
  it("이벤트 3팀 소스가 각 팀 채널로 매핑된다 (Phase 2 속보 라우팅용)", () => {
    expect(TICKER_SOURCE_CHANNEL["reddit-gunners"]).toBe("arsenal")
    expect(TICKER_SOURCE_CHANNEL["reddit-liverpoolfc"]).toBe("liverpool")
    expect(TICKER_SOURCE_CHANNEL["reddit-chelseafc"]).toBe("chelsea")
  })
})
