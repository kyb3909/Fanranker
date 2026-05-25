"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[stadium/error-boundary]", error)
  }, [error])

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <AlertTriangle className="text-destructive mx-auto mb-4 h-12 w-12" />
        <h2 className="mb-2 text-xl font-bold">문제가 발생했습니다</h2>
        <p className="text-muted-foreground mb-6 text-sm">
          페이지를 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.
        </p>
        <div className="flex justify-center gap-3">
          <button
            className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium shadow-sm transition-colors"
            onClick={() => (window.location.href = "/")}
          >
            홈으로
          </button>
          <button
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow transition-colors"
            onClick={() => reset()}
          >
            다시 시도
          </button>
        </div>
      </div>
    </div>
  )
}
