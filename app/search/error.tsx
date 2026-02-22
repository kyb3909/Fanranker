"use client"

import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

export default function SearchError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <AlertTriangle className="h-10 w-10 mx-auto mb-4 text-destructive" />
        <h2 className="text-lg font-bold mb-2">검색 중 오류가 발생했습니다</h2>
        <p className="text-sm text-muted-foreground mb-6">
          일시적인 오류입니다. 다시 시도해주세요.
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => window.location.href = "/"}>홈으로</Button>
          <Button onClick={() => reset()}>다시 시도</Button>
        </div>
      </div>
    </div>
  )
}
