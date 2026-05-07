"use client"

import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

export function BackButton() {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={() => router.back()}
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
