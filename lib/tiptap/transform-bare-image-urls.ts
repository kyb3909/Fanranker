import { isProbablyDirectImageUrl } from "@/lib/image-paste-url"

function linkHrefIfSingleLink(marks: unknown): string | null {
  if (!Array.isArray(marks) || marks.length !== 1) return null
  const m = marks[0] as { type?: string; attrs?: { href?: string } }
  if (m.type !== "link" || typeof m.attrs?.href !== "string") return null
  return m.attrs.href.trim()
}

/**
 * 문단에 이미지 URL만 있는 경우 image 노드로 승격 (기존 글 표시용)
 */
function tryLiftParagraph(node: Record<string, unknown>): Record<string, unknown>[] | null {
  if (node.type !== "paragraph" || !Array.isArray(node.content) || node.content.length !== 1) {
    return null
  }
  const child = node.content[0] as Record<string, unknown>
  if (child.type !== "text" || typeof child.text !== "string") return null

  const text = child.text.trim()
  const marks = child.marks as unknown[] | undefined
  let url = text

  if (marks && marks.length > 0) {
    const href = linkHrefIfSingleLink(marks)
    if (!href || href !== text) return null
    url = href
  }

  if (!/^https?:\/\//i.test(url) || !isProbablyDirectImageUrl(url)) return null

  return [
    { type: "image", attrs: { src: url, alt: "" } },
    { type: "paragraph", content: [] },
  ]
}

function transformNode(node: unknown): unknown | unknown[] {
  if (!node || typeof node !== "object") return node
  const n = node as Record<string, unknown>

  const lifted = tryLiftParagraph(n)
  if (lifted) return lifted

  if (Array.isArray(n.content)) {
    const newContent: unknown[] = []
    for (const child of n.content) {
      const t = transformNode(child)
      if (Array.isArray(t)) newContent.push(...t)
      else newContent.push(t)
    }
    return { ...n, content: newContent }
  }

  return node
}

export function transformBareImageUrlsInTipTapJSON(doc: unknown): unknown {
  if (!doc || typeof doc !== "object") return doc
  const d = doc as Record<string, unknown>
  if (d.type !== "doc" || !Array.isArray(d.content)) return doc

  const newContent: unknown[] = []
  for (const child of d.content) {
    const t = transformNode(child)
    if (Array.isArray(t)) newContent.push(...t)
    else newContent.push(t)
  }
  return { ...d, content: newContent }
}
