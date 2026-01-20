/**
 * TipTap JSON에서 임베드 노드를 추출하는 유틸리티 함수
 */

export interface EmbedNode {
  type: 'embed'
  attrs: {
    provider: 'youtube' | 'instagram' | 'x'
    url: string
    html?: string
    title?: string
    thumbnail_url?: string
    author_name?: string
  }
}

/**
 * TipTap JSON에서 모든 embed 노드를 재귀적으로 추출
 */
export function extractEmbedsFromTipTapJSON(
  content: any
): EmbedNode[] {
  const embeds: EmbedNode[] = []

  if (!content || typeof content !== 'object') {
    return embeds
  }

  // 현재 노드가 embed인 경우
  if (content.type === 'embed' && content.attrs) {
    embeds.push(content as EmbedNode)
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
export function extractFirstEmbedFromTipTapJSON(
  content: any
): EmbedNode | null {
  const embeds = extractEmbedsFromTipTapJSON(content)
  return embeds.length > 0 ? embeds[0] : null
}

