import { describe, it, expect } from "vitest"
import { sanitizeTipTapJSON } from "@/lib/tiptap/sanitize"

/** doc wrapper helper */
function doc(...content: unknown[]) {
  return { type: "doc", content }
}

function p(text: string, marks?: unknown[]) {
  const child: Record<string, unknown> = { type: "text", text }
  if (marks) child.marks = marks
  return { type: "paragraph", content: [child] }
}

describe("sanitizeTipTapJSON", () => {
  describe("root validation", () => {
    it("non-doc root는 null을 반환", () => {
      expect(sanitizeTipTapJSON({ type: "paragraph" })).toBeNull()
      expect(sanitizeTipTapJSON({ type: "script" })).toBeNull()
    })

    it("null / undefined / 원시값은 null", () => {
      expect(sanitizeTipTapJSON(null)).toBeNull()
      expect(sanitizeTipTapJSON(undefined)).toBeNull()
      expect(sanitizeTipTapJSON("hello")).toBeNull()
      expect(sanitizeTipTapJSON(42)).toBeNull()
    })

    it("빈 doc은 { type: 'doc' } 반환 (content 없음)", () => {
      expect(sanitizeTipTapJSON({ type: "doc" })).toEqual({ type: "doc" })
      expect(sanitizeTipTapJSON({ type: "doc", content: [] })).toEqual({ type: "doc" })
    })
  })

  describe("정상 노드 통과", () => {
    it("단순 텍스트 문단", () => {
      const input = doc(p("안녕하세요"))
      expect(sanitizeTipTapJSON(input)).toEqual({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "안녕하세요" }],
          },
        ],
      })
    })

    it("heading level 1-3 유지, textAlign 유지", () => {
      const input = doc({
        type: "heading",
        attrs: { level: 2, textAlign: "center" },
        content: [{ type: "text", text: "제목" }],
      })
      const result = sanitizeTipTapJSON(input)
      expect(result?.content?.[0].attrs).toEqual({ level: 2, textAlign: "center" })
    })

    it("허용된 marks (bold/italic/underline/strike/code) 유지", () => {
      const input = doc(
        p("굵게", [{ type: "bold" }]),
        p("기울임", [{ type: "italic" }]),
        p("밑줄", [{ type: "underline" }])
      )
      const result = sanitizeTipTapJSON(input)
      expect(result?.content?.[0].content?.[0].marks).toEqual([{ type: "bold" }])
      expect(result?.content?.[1].content?.[0].marks).toEqual([{ type: "italic" }])
      expect(result?.content?.[2].content?.[0].marks).toEqual([{ type: "underline" }])
    })

    it("link 마크 http/https/mailto 유지, target=_blank면 rel=noopener", () => {
      const input = doc(
        p("링크", [{ type: "link", attrs: { href: "https://example.com", target: "_blank" } }])
      )
      const result = sanitizeTipTapJSON(input)
      expect(result?.content?.[0].content?.[0].marks?.[0]).toEqual({
        type: "link",
        attrs: { href: "https://example.com", target: "_blank", rel: "noopener noreferrer" },
      })
    })

    it("이미지 http(s) src 유지, alt/title 500자 제한", () => {
      const input = doc({
        type: "image",
        attrs: { src: "https://cdn.example.com/a.png", alt: "캡션" },
      })
      const result = sanitizeTipTapJSON(input)
      expect(result?.content?.[0]).toEqual({
        type: "image",
        attrs: { src: "https://cdn.example.com/a.png", alt: "캡션" },
      })
    })

    it("embed (youtube) 통과, html은 sanitizeEmbedHtml로 재검증", () => {
      const input = doc({
        type: "embed",
        attrs: {
          provider: "youtube",
          url: "https://www.youtube.com/watch?v=abc",
          html: '<iframe src="https://www.youtube.com/embed/abc" width="560" height="315"></iframe>',
          title: "Video",
        },
      })
      const result = sanitizeTipTapJSON(input)
      const node = result?.content?.[0]
      expect(node?.type).toBe("embed")
      expect(node?.attrs?.provider).toBe("youtube")
      expect(node?.attrs?.url).toBe("https://www.youtube.com/watch?v=abc")
      expect(node?.attrs?.html).toContain("<iframe")
    })

    it("bulletList/orderedList/listItem 중첩 통과", () => {
      const input = doc({
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [p("첫 항목")],
          },
        ],
      })
      const result = sanitizeTipTapJSON(input)
      expect(result?.content?.[0].type).toBe("bulletList")
      expect(result?.content?.[0].content?.[0].type).toBe("listItem")
    })

    it("horizontalRule / hardBreak 그대로 유지", () => {
      const input = doc({ type: "horizontalRule" }, { type: "hardBreak" })
      const result = sanitizeTipTapJSON(input)
      expect(result?.content).toEqual([{ type: "horizontalRule" }, { type: "hardBreak" }])
    })
  })

  describe("공격 벡터 차단", () => {
    it("알 수 없는 노드 타입은 drop (script 주입)", () => {
      const input = doc({ type: "script", attrs: { src: "evil.js" } }, p("정상"))
      const result = sanitizeTipTapJSON(input)
      expect(result?.content).toHaveLength(1)
      expect(result?.content?.[0].type).toBe("paragraph")
    })

    it("image src=javascript: 차단 (이미지 노드 자체 drop)", () => {
      const input = doc({
        type: "image",
        // eslint-disable-next-line no-script-url
        attrs: { src: "javascript:alert(1)" },
      })
      const result = sanitizeTipTapJSON(input)
      expect(result?.content).toBeUndefined()
    })

    it("image src=data:image/... 차단", () => {
      const input = doc({
        type: "image",
        attrs: { src: "data:image/png;base64,iVBOR..." },
      })
      const result = sanitizeTipTapJSON(input)
      expect(result?.content).toBeUndefined()
    })

    it("link href=javascript: 차단 (마크만 drop, 텍스트 유지)", () => {
      const input = doc(p("클릭", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]))
      const result = sanitizeTipTapJSON(input)
      expect(result?.content?.[0].content?.[0].marks).toBeUndefined()
      expect(result?.content?.[0].content?.[0].text).toBe("클릭")
    })

    it("embed provider 화이트리스트 외 차단 (tiktok 등)", () => {
      const input = doc({
        type: "embed",
        attrs: { provider: "tiktok", url: "https://tiktok.com/xyz" },
      })
      const result = sanitizeTipTapJSON(input)
      expect(result?.content).toBeUndefined()
    })

    it("embed url unsafe scheme 차단", () => {
      const input = doc({
        type: "embed",
        attrs: { provider: "youtube", url: "javascript:alert(1)" },
      })
      const result = sanitizeTipTapJSON(input)
      expect(result?.content).toBeUndefined()
    })

    it("embed.html 내부 script 태그 제거 (sanitizeEmbedHtml 경유)", () => {
      const input = doc({
        type: "embed",
        attrs: {
          provider: "x",
          url: "https://x.com/user/status/1",
          html: '<blockquote class="twitter-tweet"><script>alert(1)</script>tweet</blockquote>',
        },
      })
      const result = sanitizeTipTapJSON(input)
      const html = result?.content?.[0].attrs?.html as string | undefined
      expect(html).toBeDefined()
      expect(html).not.toContain("<script")
    })

    it("알 수 없는 mark (xss) drop", () => {
      const input = doc(p("텍스트", [{ type: "xss", attrs: { onclick: "evil()" } }]))
      const result = sanitizeTipTapJSON(input)
      expect(result?.content?.[0].content?.[0].marks).toBeUndefined()
    })

    it("heading level 4+ 는 level 1로 fallback", () => {
      const input = doc({
        type: "heading",
        attrs: { level: 7 },
        content: [{ type: "text", text: "Huge" }],
      })
      const result = sanitizeTipTapJSON(input)
      expect(result?.content?.[0].attrs?.level).toBe(1)
    })

    it("paragraph에 알 수 없는 속성이 있으면 textAlign만 유지하고 나머지 drop", () => {
      const input = doc({
        type: "paragraph",
        attrs: { textAlign: "left", onclick: "evil()", dir: "rtl" },
        content: [{ type: "text", text: "ok" }],
      })
      const result = sanitizeTipTapJSON(input)
      expect(result?.content?.[0].attrs).toEqual({ textAlign: "left" })
    })

    it("paragraph textAlign 비정상 값은 drop", () => {
      const input = doc({
        type: "paragraph",
        attrs: { textAlign: "javascript:evil" },
        content: [{ type: "text", text: "ok" }],
      })
      const result = sanitizeTipTapJSON(input)
      expect(result?.content?.[0].attrs).toBeUndefined()
    })

    it("중첩된 악성 노드 재귀적으로 제거", () => {
      const input = doc({
        type: "blockquote",
        content: [
          p("정상"),
          { type: "script", text: "evil" },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "ok" },
              { type: "iframe", attrs: { src: "javascript:evil" } },
            ],
          },
        ],
      })
      const result = sanitizeTipTapJSON(input)
      const bq = result?.content?.[0]
      expect(bq?.type).toBe("blockquote")
      expect(bq?.content).toHaveLength(2) // script 제거됨
      const lastPara = bq?.content?.[1]
      expect(lastPara?.content).toHaveLength(1) // iframe 제거됨
    })
  })

  describe("idempotency", () => {
    it("sanitize 결과를 다시 sanitize해도 동일 (fixed point)", () => {
      const input = doc(p("텍스트", [{ type: "bold" }]), {
        type: "image",
        attrs: { src: "https://cdn.example.com/a.png", alt: "x" },
      })
      const once = sanitizeTipTapJSON(input)
      const twice = sanitizeTipTapJSON(once)
      expect(twice).toEqual(once)
    })
  })
})
