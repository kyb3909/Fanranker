import { describe, expect, it } from "vitest"
import { sanitizeTipTapJSON } from "@/lib/tiptap/sanitize"

/**
 * video 노드 (2026-09-03). 확장은 8월부터 있었는데 sanitize 허용 목록에 없어 API 를 거치면
 * 조용히 잘렸다 — 레딧 밈 영상을 우리 스토리지 mp4 로 싣는 첫 사용처에서 드러남.
 */
describe("sanitizeTipTapJSON — video", () => {
  it("자체 스토리지 mp4 는 통과, src 만 남긴다", () => {
    const out = sanitizeTipTapJSON({
      type: "doc",
      content: [
        {
          type: "video",
          attrs: { src: "/storage/posts/agg/meme/abc.mp4", onload: "alert(1)", poster: "x" },
        },
      ],
    })
    expect(out?.content?.[0]).toEqual({
      type: "video",
      attrs: { src: "/storage/posts/agg/meme/abc.mp4" },
    })
  })

  it("https 외부 mp4 도 통과", () => {
    const out = sanitizeTipTapJSON({
      type: "doc",
      content: [{ type: "video", attrs: { src: "https://example.com/a.mp4" } }],
    })
    expect(out?.content?.[0]?.type).toBe("video")
  })

  it("javascript:·data: 는 노드째 drop, src 없는 노드도 drop", () => {
    const out = sanitizeTipTapJSON({
      type: "doc",
      content: [
        { type: "video", attrs: { src: "javascript:alert(1)" } },
        { type: "video", attrs: { src: "data:video/mp4;base64,AAAA" } },
        { type: "video" },
        { type: "paragraph", content: [{ type: "text", text: "본문" }] },
      ],
    })
    expect(out?.content?.map((n) => n.type)).toEqual(["paragraph"])
  })
})
