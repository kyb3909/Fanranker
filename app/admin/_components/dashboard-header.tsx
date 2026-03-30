"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"

export function DashboardHeader() {
  const [lastRefreshed, setLastRefreshed] = useState(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const router = useRouter()

  const handleRefresh = () => {
    setIsRefreshing(true)
    router.refresh()
    setLastRefreshed(new Date())
    setTimeout(() => setIsRefreshing(false), 1000)
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-foreground text-2xl font-bold">대시보드</h1>
        <p className="text-muted-foreground text-sm" suppressHydrationWarning>
          마지막 갱신:{" "}
          {lastRefreshed.toLocaleString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
        <RefreshCw className={`mr-1.5 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        새로고침
      </Button>
    </div>
  )
}
