"use client"

import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

export function BackButton({ fallbackHref }: { fallbackHref?: string }) {
  const router = useRouter()

  function handleBack() {
    // 앱 안에서 이동해 왔으면 이전 페이지로 그대로 복귀(담벼락·게시판 목록·검색 등).
    // 외부/직접 진입(공유 링크·새 탭·북마크)이라 돌아갈 곳이 없으면 fallback(해당 게시판 목록)으로.
    const ref = typeof document !== "undefined" ? document.referrer : ""
    const cameFromSameSite = ref !== "" && ref.startsWith(window.location.origin)
    if (window.history.length > 1 && (cameFromSameSite || ref === "")) {
      router.back()
    } else {
      router.push(fallbackHref ?? "/")
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold transition-colors"
      style={{
        color: "var(--wc-mute)",
        background: "transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--wc-burgundy)"
        e.currentTarget.style.background = "var(--wc-soft)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--wc-mute)"
        e.currentTarget.style.background = "transparent"
      }}
    >
      <ArrowLeft className="h-4 w-4" />
      돌아가기
    </button>
  )
}
