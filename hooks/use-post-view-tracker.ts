"use client"

import { useEffect } from "react"
import { reportClientError } from "@/lib/client-error"

/**
 * 글 상세 진입 시 조회수 증가 비콘 (POST /api/posts/[id]/view).
 *
 * 원래 post-detail-content 의 useEffect 였으나 컴포넌트 분리 과정에서 유실됨
 * (e2c69c5 도입 → 2026-06-11 복구). 서버가 IP 해시 기반 1시간 중복 제한을
 * 처리하므로 클라이언트는 마운트당 1회만 쏘면 된다 (StrictMode 중복도 흡수됨).
 */
export function usePostViewTracker(postId: string | number) {
  useEffect(() => {
    fetch(`/api/posts/${postId}/view`, { method: "POST" }).catch((error) => {
      // 비핵심 비콘 — 토스트 없이 보고만
      reportClientError("post.view", error)
    })
  }, [postId])
}
