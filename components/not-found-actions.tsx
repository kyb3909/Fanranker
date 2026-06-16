"use client"

import Link from "@/components/ui/app-link"
import { useRouter } from "next/navigation"

/** 404 페이지 액션 — 담벼락(홈) 이동 + 이전 페이지(히스토리 없으면 홈 폴백). */
export function NotFoundActions() {
  const router = useRouter()
  return (
    <div className="mt-7 flex items-center justify-center gap-3">
      <Link
        href="/"
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center justify-center rounded-[10px] px-5 text-sm font-bold transition-colors"
      >
        담벼락으로 돌아가기
      </Link>
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) router.back()
          else router.push("/")
        }}
        className="border-border bg-card text-foreground hover:bg-muted/50 inline-flex h-11 items-center justify-center rounded-[10px] border px-5 text-sm font-bold transition-colors"
      >
        이전 페이지
      </button>
    </div>
  )
}
