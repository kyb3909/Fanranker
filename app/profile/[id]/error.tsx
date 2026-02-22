"use client"

import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

export default function ProfileError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <AlertTriangle className="h-10 w-10 mx-auto mb-4 text-destructive" />
        <h2 className="text-lg font-bold mb-2">프로필을 불러올 수 없습니다</h2>
        <p className="text-sm text-muted-foreground mb-6">
          사용자를 찾을 수 없거나 일시적인 오류가 발생했습니다.
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => window.location.href = "/"}>홈으로</Button>
          <Button onClick={() => reset()}>다시 시도</Button>
        </div>
      </div>
    </div>
  )
}
