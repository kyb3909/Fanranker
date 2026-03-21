import { isProbablyDirectImageUrl } from "@/lib/image-paste-url"

/**
 * TipTap JSON에서 임베드 노드를 추출하는 유틸리티 함수
 */

export interface EmbedNode {
  type: "embed"
  attrs: {
    provider: "youtube" | "instagram" | "x"
    url: string
    html?: string
    title?: string
    thumbnail_url?: string
    author_name?: string
  }
}

const URL_PATTERNS = {
  youtube: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:p|reel)\/([a-zA-Z0-9_-]+)/,
  x: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/(?:#!\/)?(\w+)\/status(?:es)?\/(\d+)/,
}

/**
 * URL에서 provider를 감지하고 EmbedNode를 생성
 */
function detectEmbedFromUrl(url: string): EmbedNode | null {
  const ytMatch = url.match(URL_PATTERNS.youtube)
  if (ytMatch) {
    const videoId = ytMatch[1]
    return {
      type: "embed",
      attrs: {
        provider: "youtube",
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail_url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      },
    }
  }

  if (URL_PATTERNS.instagram.test(url)) {
    const normalized = url.startsWith("http") ? url : `https://${url}`
    return {
      type: "embed",
      attrs: {
        provider: "instagram",
        url: normalized,
      },
    }
  }

  if (URL_PATTERNS.x.test(url)) {
    const normalized = url.startsWith("http") ? url : `https://${url}`
    return {
      type: "embed",
      attrs: {
        provider: "x",
        url: normalized,
      },
    }
  }

  return null
}

/**
 * TipTap JSON에서 모든 embed 노드를 재귀적으로 추출
 */
export function extractEmbedsFromTipTapJSON(content: any): EmbedNode[] {
  const embeds: EmbedNode[] = []

  if (!content || typeof content !== "object") {
    return embeds
  }

  // 현재 노드가 embed인 경우
  if (content.type === "embed" && content.attrs) {
    embeds.push(content as EmbedNode)
  }

  // 텍스트 노드에서 임베드 URL 감지 (link mark가 있는 경우)
  if (content.type === "text" && content.marks) {
    const linkMark = content.marks.find((m: any) => m.type === "link")
    if (linkMark?.attrs?.href) {
      const embed = detectEmbedFromUrl(linkMark.attrs.href)
      if (embed) embeds.push(embed)
    }
  }

  // 텍스트 노드에서 URL 패턴 직접 감지 (mark 없이 URL만 붙여넣은 경우)
  if (content.type === "text" && typeof content.text === "string" && !content.marks) {
    const text = content.text.trim()
    if (text.match(/^https?:\/\//)) {
      const embed = detectEmbedFromUrl(text)
      if (embed) embeds.push(embed)
    }
  }

  // content 배열이 있는 경우 재귀적으로 탐색
  if (Array.isArray(content.content)) {
    content.content.forEach((node: any) => {
      embeds.push(...extractEmbedsFromTipTapJSON(node))
    })
  }

  return embeds
}

/**
 * TipTap JSON에서 첫 번째 embed 노드만 추출 (피드 미리보기용)
 */
export function extractFirstEmbedFromTipTapJSON(content: any): EmbedNode | null {
  const embeds = extractEmbedsFromTipTapJSON(content)
  return embeds.length > 0 ? embeds[0] : null
}

/**
 * TipTap JSON에서 첫 번째 image 노드의 src (피드 썸네일 fallback용)
 */
export function extractFirstImageSrcFromTipTapJSON(content: unknown): string | null {
  if (!content || typeof content !== "object") return null
  const node = content as {
    type?: string
    text?: string
    marks?: { type?: string; attrs?: { href?: string } }[]
    attrs?: { src?: string }
    content?: unknown[]
  }
  if (node.type === "image" && typeof node.attrs?.src === "string" && node.attrs.src) {
    return node.attrs.src
  }
  if (node.type === "text") {
    const rawText = typeof node.text === "string" ? node.text.trim() : ""
    if (isProbablyDirectImageUrl(rawText)) return rawText

    const linkHref = node.marks?.find((mark) => mark.type === "link")?.attrs?.href?.trim()
    if (linkHref && isProbablyDirectImageUrl(linkHref)) return linkHref
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      const found = extractFirstImageSrcFromTipTapJSON(child)
      if (found) return found
    }
  }
  return null
}

export function extractAllImageSrcsFromTipTapJSON(content: unknown): string[] {
  const results: string[] = []
  const seen = new Set<string>()

  function visit(node: unknown) {
    if (!node || typeof node !== "object") return
    const current = node as {
      type?: string
      text?: string
      marks?: { type?: string; attrs?: { href?: string } }[]
      attrs?: { src?: string }
      content?: unknown[]
    }

    const push = (src?: string) => {
      if (!src || seen.has(src)) return
      seen.add(src)
      results.push(src)
    }

    if (current.type === "image" && typeof current.attrs?.src === "string" && current.attrs.src) {
      push(current.attrs.src)
    }

    if (current.type === "text") {
      const rawText = typeof current.text === "string" ? current.text.trim() : ""
      if (isProbablyDirectImageUrl(rawText)) push(rawText)

      const linkHref = current.marks?.find((mark) => mark.type === "link")?.attrs?.href?.trim()
      if (linkHref && isProbablyDirectImageUrl(linkHref)) push(linkHref)
    }

    if (Array.isArray(current.content)) {
      for (const child of current.content) visit(child)
    }
  }

  visit(content)
  return results
}
