import { describe, it, expect } from "vitest"
import { renderTipTapToHTML } from "@/lib/tiptap/render-html"

/**
 * TipTap JSON → 서버 HTML (2026-07-30 워룸: 기사 본문 SSR — SEO 절단 수리).
 * 지키는 계약:
 *   1. 텍스트·이미지가 정적 HTML 로 나온다 (검색엔진이 본문을 읽는 목적 그 자체)
 *   2. 텍스트는 이스케이프된다 (본문에 태그 문자열이 있어도 마크업으로 안 나감)
 *   3. 임베드는 data-attr 컨테이너로만 — html 페이로드가 마크업으로 실행되지 않는다
 *   4. 깨진 입력은 null (상세 페이지를 막지 않고 클라 렌더로 폴백)
 */
describe("renderTipTapToHTML", () => {
  it("텍스트·마크·이미지를 정적 HTML 로 렌더한다", () => {
    const html = renderTipTapToHTML({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "본문 문단", marks: [{ type: "bold" }] }],
        },
        { type: "image", attrs: { src: "/storage/posts/a.webp", alt: "" } },
      ],
    })
    expect(html).toContain("<strong>본문 문단</strong>")
    expect(html).toContain('src="/storage/posts/a.webp"')
    // 빈 alt 는 의미 있는 fallback 으로 채워진다 (뷰어와 동일 규칙)
    expect(html).toContain('alt="게시물 이미지"')
  })

  it("텍스트를 이스케이프한다", () => {
    const html = renderTipTapToHTML({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }] },
      ],
    })
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("임베드는 data-attr 컨테이너로만 나간다 (html 페이로드 미실행)", () => {
    const html = renderTipTapToHTML({
      type: "doc",
      content: [
        {
          type: "embed",
          attrs: {
            provider: "x",
            url: "https://x.com/a/status/1",
            html: '<blockquote class="twitter-tweet">t</blockquote>',
          },
        },
      ],
    })
    expect(html).toContain('data-type="embed"')
    expect(html).toContain('data-provider="x"')
    // html 페이로드는 속성 값 안에 갇힌다 — 따옴표가 &quot; 로 이스케이프돼
    // 속성 밖으로 탈출할 수 없다 (속성 내부의 <> 는 마크업으로 파싱되지 않음)
    expect(html).toContain('data-html="<blockquote class=&quot;twitter-tweet&quot;>')
    expect(html).not.toContain('class="twitter-tweet"')
  })

  it("깨진 입력은 null (폴백)", () => {
    expect(renderTipTapToHTML(null)).toBeNull()
    expect(renderTipTapToHTML("문자열 본문")).toBeNull()
    expect(renderTipTapToHTML({ type: "doc", content: [{ type: "없는노드" }] })).toBeNull()
  })
})
