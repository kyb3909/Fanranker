"use client"

import { useEffect } from "react"
import { trackEvent } from "@/lib/analytics/events"
import { usePostViewTracker } from "@/hooks/use-post-view-tracker"

/**
 * 사가 계측 (PM 토론 2026-08-04 #1 — "성공해도 증명할 숫자가 없다" 수리).
 *
 * - saga_view: 사가 문서 진입 (from_card = 떡밥 카드 경유 여부)
 * - 카드 경유(?from=기사id)면 그 기사가 사가 안에서 펼쳐져 실제로 읽히므로,
 *   원본 글의 조회수 비콘 + 15초 체류 post_read 를 글 상세와 동일하게 쏜다
 *   (언론사 지표가 사가 우회로 미기록되던 구멍 — 회의·현실 PM 공통 지적)
 */
function ArticleTracker({ postId }: { postId: string }) {
  usePostViewTracker(postId)
  return null
}

export function SagaViewTracker({ slug, fromPostId }: { slug: string; fromPostId?: string }) {
  useEffect(() => {
    trackEvent({ name: "saga_view", params: { saga_slug: slug, from_card: !!fromPostId } })
  }, [slug, fromPostId])

  return fromPostId ? <ArticleTracker postId={fromPostId} /> : null
}
