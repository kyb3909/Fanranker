import { describe, expect, it } from "vitest"
import { findEntryWithUrl } from "@/lib/saga/cluster"
import { canonicalSourceUrl } from "@/lib/news/canonical-url"

/**
 * 사가 URL 접기 (점검 F7 수리) — 같은 기사가 다른 stage 신호로 추출돼도
 * 같은 사가 안에서는 엔트리 하나로 접힌다.
 */

function entry(originUrl: string | null, echoUrls: string[] = []) {
  return {
    id: `e-${originUrl ?? "none"}`,
    origin: originUrl ? { url: originUrl } : null,
    echoes: echoUrls.map((url) => ({ url })),
  }
}

describe("findEntryWithUrl", () => {
  it("origin 이 같은 URL 인 엔트리를 찾는다 — 살라 ajansspor 실사고", () => {
    const entries = [
      entry("https://ajansspor.com/haber/mohamed-salah-resmen-trabzonsporda-731926"),
      entry("https://bbc.co.uk/sport/other"),
    ]
    const hit = findEntryWithUrl(
      entries,
      // 두 번째 유입: www + 쿼리가 붙어도 같은 기사
      "https://www.ajansspor.com/haber/mohamed-salah-resmen-trabzonsporda-731926?ref=x",
      canonicalSourceUrl
    )
    expect(hit?.id).toBe(entries[0].id)
  })

  it("echo 로 접혀 있는 URL 도 같은 기사로 본다", () => {
    const entries = [entry("https://a.com/1", ["https://guardian.com/vini-story"])]
    const hit = findEntryWithUrl(
      entries,
      "https://www.guardian.com/vini-story/",
      canonicalSourceUrl
    )
    expect(hit?.id).toBe(entries[0].id)
  })

  it("없는 URL 이면 null — 새 엔트리가 정답", () => {
    const entries = [entry("https://a.com/1"), entry("https://b.com/2")]
    expect(findEntryWithUrl(entries, "https://c.com/3", canonicalSourceUrl)).toBeNull()
  })

  it("origin 이 내부 /post 경로인 훅 엔트리도 정확 일치로 잡는다", () => {
    const entries = [entry("/post/abc")]
    expect(findEntryWithUrl(entries, "/post/abc", canonicalSourceUrl)?.id).toBe("e-/post/abc")
    expect(findEntryWithUrl(entries, "/post/xyz", canonicalSourceUrl)).toBeNull()
  })
})
