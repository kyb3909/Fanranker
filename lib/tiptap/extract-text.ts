/**
 * TipTap JSON에서 피드 미리보기용 텍스트 추출
 *
 * 이미지/임베드 URL은 미리보기에서 제외(URL 텍스트가 그대로 노출되는 것 방지).
 */

import { isProbablyDirectImageUrl } from "@/lib/image-paste-url"
import type { TipTapNode } from "@/types/post"

/** 임베드 URL 패턴 (YouTube, Instagram, X/Twitter) */
export const EMBED_URL_RE =
  /(?:youtube\.com\/(?:watch|shorts\/|embed\/)|youtu\.be\/|instagram\.com\/(?:p|reel)\/|(?:twitter|x)\.com\/\w+\/status)/i

export function isMediaUrl(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed.startsWith("http")) return false
  return isProbablyDirectImageUrl(trimmed) || EMBED_URL_RE.test(trimmed)
}

/**
 * TipTap JSON 트리를 재귀 순회하며 순수 텍스트만 추출.
 * 이미지/임베드 URL 텍스트는 제외.
 */
export function extractTextFromTipTapJSON(content: TipTapNode): string {
  if (!content || typeof content !== "object") {
    return ""
  }

  if (content.type === "text" && content.text) {
    if (isMediaUrl(content.text)) return ""
    return content.text
  }

  if (Array.isArray(content.content)) {
    return content.content
      .map((node) => extractTextFromTipTapJSON(node))
      .filter(Boolean)
      .join(" ")
  }

  return ""
}
