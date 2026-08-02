"use client"

import { useEffect } from "react"
import { reportClientError } from "@/lib/client-error"
import { trackEvent } from "@/lib/analytics/events"

/** 이 시간 이상 화면에 떠 있어야 "읽었다"로 센다 */
const READ_DWELL_MS = 15_000

/**
 * 글 상세 진입 시 조회수 증가 비콘 (POST /api/posts/[id]/view).
 *
 * 원래 post-detail-content 의 useEffect 였으나 컴포넌트 분리 과정에서 유실됨
 * (e2c69c5 도입 → 2026-06-11 복구). 서버가 IP 해시 기반 1시간 중복 제한을
 * 처리하므로 클라이언트는 마운트당 1회만 쏘면 된다 (StrictMode 중복도 흡수됨).
 *
 * 여기에 더해 **읽기(체류) 계측**을 같이 쏜다 (2026-08-02). 조회수는 스쳐 지나간 것도
 * 세기 때문에 "실제로 읽혔는가"를 못 보여준다 — 언론사 협상에서 필요한 건 후자다.
 * 탭이 백그라운드로 가면 시간을 멈춰, 열어두고 딴짓한 시간은 빼고 센다.
 */
export function usePostViewTracker(postId: string | number) {
  useEffect(() => {
    fetch(`/api/posts/${postId}/view`, { method: "POST" }).catch((error) => {
      // 비핵심 비콘 — 토스트 없이 보고만
      reportClientError("post.view", error)
    })
  }, [postId])

  useEffect(() => {
    let visibleMs = 0
    let since: number | null = document.visibilityState === "visible" ? Date.now() : null
    let fired = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const fire = () => {
      if (fired) return
      fired = true
      timer = null
      trackEvent({ name: "post_read", params: { post_id: String(postId) } })
    }

    const schedule = () => {
      if (fired || since === null) return
      timer = setTimeout(fire, Math.max(0, READ_DWELL_MS - visibleMs))
    }

    const pause = () => {
      if (since !== null) {
        visibleMs += Date.now() - since
        since = null
      }
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (fired || since !== null) return
        since = Date.now()
        schedule()
      } else {
        pause()
      }
    }

    schedule()
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      if (timer) clearTimeout(timer)
    }
  }, [postId])
}
