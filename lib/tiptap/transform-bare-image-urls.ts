import { isProbablyDirectImageUrl } from "@/lib/image-paste-url"

const EMBED_PATTERNS: { provider: "youtube" | "instagram" | "x"; re: RegExp }[] = [
  {
    provider: "youtube",
    re: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  },
  {
    provider: "instagram",
    re: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:p|reel)\/([a-zA-Z0-9_-]+)/,
  },
  {
    provider: "x",
    re: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/(?:#!\/)?(\w+)\/status(?:es)?\/(\d+)/,
  },
]

function detectEmbedProvider(url: string): "youtube" | "instagram" | "x" | null {
  for (const { provider, re } of EMBED_PATTERNS) {
    if (re.test(url)) return provider
  }
  return null
}

function extractSingleParagraphUrl(node: Record<string, unknown>): string | null {
  if (node.type !== "paragraph" || !Array.isArray(node.content) || node.content.length !== 1)
    return null
  const child = node.content[0] as Record<string, unknown>
  if (child.type !== "text" || typeof child.text !== "string") return null

  const text = child.text.trim()
  const marks = child.marks as unknown[] | undefined
  let url = text

  if (marks && marks.length > 0) {
    if (!Array.isArray(marks) || marks.length !== 1) return null
    const m = marks[0] as { type?: string; attrs?: { href?: string } }
    if (m.type !== "link" || m.attrs?.href?.trim() !== text) return null
    url = m.attrs!.href!.trim()
  }

  if (!/^https?:\/\//i.test(url)) return null
  return url
}

/**
 * 문단에 URL만 있을 때 image / embed 노드로 승격 (기존 글 읽기 전용 표시용)
 */
function tryLiftParagraph(node: Record<string, unknown>): Record<string, unknown>[] | null {
  const url = extractSingleParagraphUrl(node)
  if (!url) return null

  const embedProvider = detectEmbedProvider(url)
  if (embedProvider) {
    return [{ type: "embed", attrs: { provider: embedProvider, url, html: null } }]
  }

  if (isProbablyDirectImageUrl(url)) {
    return [
      { type: "image", attrs: { src: url, alt: "" } },
      { type: "paragraph", content: [] },
    ]
  }

  return null
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
