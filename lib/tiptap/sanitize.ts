/**
 * TipTap JSON 서버 사이드 sanitizer.
 *
 * 클라이언트에서 보낸 TipTap JSON은 신뢰할 수 없다. 악의적 사용자가 임의의
 * 노드 타입/속성(예: {type:"script"}, image.src="javascript:...")을 주입하면
 * 렌더 시점에 저장형 XSS로 이어질 수 있다.
 *
 * 방어 전략: 편집기(components/editor/tiptap-editor.tsx)가 실제로 생성하는
 * 노드/속성만 허용하는 whitelist. 알 수 없는 것은 drop.
 *
 * audit: docs/audit-2026-04-17.md §보안-11 (M1)
 */

import { sanitizeEmbedHtml } from "@/lib/sanitize-embed"

const ALLOWED_MARKS = new Set<string>(["bold", "italic", "strike", "code", "underline", "link"])

const ALLOWED_NODES = new Set<string>([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "image",
  "embed",
])

const ALLOWED_EMBED_PROVIDERS = new Set<string>(["youtube", "instagram", "x"])
const ALLOWED_TEXT_ALIGN = new Set<string>(["left", "center", "right"])
const ALLOWED_HEADING_LEVELS = new Set<number>([1, 2, 3])

export interface TipTapMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface TipTapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
  marks?: TipTapMark[]
  text?: string
}

/**
 * URL scheme이 안전한지 확인. 기본적으로 http(s)만 허용.
 * link 마크에서는 mailto도 허용 가능.
 */
function isSafeUrl(url: unknown, allowedSchemes: readonly string[] = ["http:", "https:"]): boolean {
  if (typeof url !== "string" || url.length === 0) return false
  try {
    const parsed = new URL(url)
    return allowedSchemes.includes(parsed.protocol)
  } catch {
    return false
  }
}

function getString(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined
  const value = (obj as Record<string, unknown>)[key]
  return typeof value === "string" ? value : undefined
}

function sanitizeMarks(marks: unknown): TipTapMark[] | undefined {
  if (!Array.isArray(marks)) return undefined
  const result: TipTapMark[] = []
  for (const m of marks) {
    if (!m || typeof m !== "object") continue
    const type = (m as { type?: unknown }).type
    if (typeof type !== "string" || !ALLOWED_MARKS.has(type)) continue

    if (type === "link") {
      const href = getString((m as { attrs?: unknown }).attrs, "href")
      if (!isSafeUrl(href, ["http:", "https:", "mailto:"])) continue
      const target = getString((m as { attrs?: unknown }).attrs, "target")
      const attrs: Record<string, unknown> = { href }
      if (target === "_blank") {
        attrs.target = "_blank"
        attrs.rel = "noopener noreferrer"
      }
      result.push({ type: "link", attrs })
    } else {
      // bold/italic/strike/code/underline은 attrs 없음
      result.push({ type })
    }
  }
  return result.length > 0 ? result : undefined
}

function sanitizeEmbedAttrs(attrs: unknown): Record<string, unknown> | null {
  if (!attrs || typeof attrs !== "object") return null
  const provider = getString(attrs, "provider")
  const url = getString(attrs, "url")
  if (!provider || !ALLOWED_EMBED_PROVIDERS.has(provider)) return null
  if (!isSafeUrl(url)) return null

  const out: Record<string, unknown> = { provider, url }

  const title = getString(attrs, "title")
  if (title) out.title = title.slice(0, 500)

  const thumbnail = getString(attrs, "thumbnail_url")
  if (thumbnail && isSafeUrl(thumbnail)) out.thumbnail_url = thumbnail

  const author = getString(attrs, "author_name")
  if (author) out.author_name = author.slice(0, 200)

  // html: 반드시 sanitize-embed로 재검증. 실패/비어있음은 drop (embed-card가 재fetch).
  const html = getString(attrs, "html")
  if (html) {
    try {
      const safe = sanitizeEmbedHtml(html, provider)
      if (safe) out.html = safe
    } catch {
      // drop
    }
  }

  return out
}

function sanitizeImageAttrs(attrs: unknown): Record<string, unknown> | null {
  if (!attrs || typeof attrs !== "object") return null
  const src = getString(attrs, "src")
  if (!isSafeUrl(src)) return null // javascript:, data: 등 차단
  const out: Record<string, unknown> = { src }
  const alt = getString(attrs, "alt")
  if (alt) out.alt = alt.slice(0, 500)
  const title = getString(attrs, "title")
  if (title) out.title = title.slice(0, 500)
  return out
}

function sanitizeTextAlignAttrs(attrs: unknown): Record<string, unknown> | undefined {
  const ta = getString(attrs, "textAlign")
  if (ta && ALLOWED_TEXT_ALIGN.has(ta)) return { textAlign: ta }
  return undefined
}

function sanitizeHeadingAttrs(attrs: unknown): Record<string, unknown> {
  const level = (attrs as { level?: unknown })?.level
  const out: Record<string, unknown> = {
    level: typeof level === "number" && ALLOWED_HEADING_LEVELS.has(level) ? level : 1,
  }
  const aligned = sanitizeTextAlignAttrs(attrs)
  if (aligned) out.textAlign = aligned.textAlign
  return out
}

function sanitizeNode(node: unknown): TipTapNode | null {
  if (!node || typeof node !== "object") return null
  const n = node as TipTapNode
  if (typeof n.type !== "string" || !ALLOWED_NODES.has(n.type)) return null

  const out: TipTapNode = { type: n.type }

  // Text node
  if (n.type === "text") {
    if (typeof n.text !== "string") return null
    out.text = n.text
    const marks = sanitizeMarks(n.marks)
    if (marks) out.marks = marks
    return out
  }

  // 노드별 속성 whitelist
  switch (n.type) {
    case "heading":
      out.attrs = sanitizeHeadingAttrs(n.attrs)
      break
    case "paragraph": {
      const aligned = sanitizeTextAlignAttrs(n.attrs)
      if (aligned) out.attrs = aligned
      break
    }
    case "image": {
      const attrs = sanitizeImageAttrs(n.attrs)
      if (!attrs) return null // src 없거나 unsafe면 이미지 drop
      out.attrs = attrs
      break
    }
    case "embed": {
      const attrs = sanitizeEmbedAttrs(n.attrs)
      if (!attrs) return null
      out.attrs = attrs
      break
    }
    // doc/paragraph(기본)/bulletList/orderedList/listItem/blockquote/codeBlock/
    // horizontalRule/hardBreak 는 attrs 미허용 (기본 동작)
    default:
      break
  }

  // 재귀 content
  if (Array.isArray(n.content)) {
    const content: TipTapNode[] = []
    for (const child of n.content) {
      const sanitized = sanitizeNode(child)
      if (sanitized) content.push(sanitized)
    }
    if (content.length > 0) out.content = content
  }

  return out
}

/**
 * TipTap JSON doc을 sanitize한다.
 * 반환값:
 *  - 정상: `{ type: "doc", content: [...] }` (새 객체, 원본 미변경)
 *  - root가 doc이 아니거나 완전히 invalid: `null` — route handler에서 400 반환
 *
 * 본 함수는 pure하며 외부 I/O 없음. sanitizeEmbedHtml만 동기적으로 호출.
 */
export function sanitizeTipTapJSON(content: unknown): TipTapNode | null {
  const result = sanitizeNode(content)
  if (!result || result.type !== "doc") return null
  return result
}
