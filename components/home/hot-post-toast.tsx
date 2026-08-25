"use client"

import Link from "@/components/ui/app-link"
import { Flame, X } from "lucide-react"
import { useHotPostAlerts } from "@/hooks/use-hot-post-alerts"

/**
 * 하단 실시간 인기글 토스트 (펨코 실베 문법).
 *
 * 활성 조건: 홈 "feed" 탭에서만 enabled=true.
 * 위치: 하단 중앙, 모바일은 탭바 위(bottom-20), 데스크톱은 bottom-8.
 */
export function HotPostToast({
  enabled,
  followedSlugs,
}: {
  enabled: boolean
  followedSlugs: string[]
}) {
  const { toast, dismiss, mute30Min } = useHotPostAlerts({ enabled, followedSlugs })

  if (!toast) return null

  return (
    <div
      className="animate-in slide-in-from-bottom-4 fade-in fixed bottom-20 left-1/2 z-40 -translate-x-1/2 duration-300 sm:bottom-8"
      role="status"
      aria-live="polite"
    >
      <div className="flex max-w-[90vw] items-center gap-2 rounded-full border border-orange-200/70 bg-white px-3 py-2 shadow-xl shadow-orange-500/15">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-orange-50">
          <Flame className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
        </div>
        <Link href={`/post/${toast.id}`} onClick={dismiss} className="min-w-0 flex-1">
          <div className="text-[12px] font-bold text-orange-600">
            🔥 {toast.community_name || "커뮤니티"} 인기글 등극
          </div>
          <div className="max-w-[240px] truncate text-[13px] font-semibold text-gray-900 sm:max-w-[380px]">
            {toast.title}
          </div>
        </Link>
        <button
          type="button"
          onClick={mute30Min}
          aria-label="30분간 알림 끄기"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
