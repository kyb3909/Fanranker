"use client"

import Link from "next/link"
import { useRef, useEffect, useState } from "react"
import useSWR from "swr"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { fetcher } from "@/lib/swr"
import { toast } from "@/hooks/use-toast"
import { useBrowserNotifications } from "@/hooks/use-browser-notifications"
import { Bell, BellOff, Loader2, Newspaper, RefreshCw, Trash2 } from "lucide-react"

interface NewsTickerItem {
  id: number
  source_id: string
  community_slug: string
  headline_kr: string | null
  original_title: string
  importance: number
  category: string | null
  ticker_tag: string | null
  posted_at: string
  created_at: string
}

interface NewsCrawlerDashboardData {
  items: NewsTickerItem[]
  counts: {
    newLastHour: number
    newLast24Hours: number
  }
  fetchedAt: string
}

export function DashboardNewsCrawler() {
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const { permission, requestPermission, notify } = useBrowserNotifications()
  const prevNewCount = useRef<number | null>(null)

  const { data, isLoading, mutate } = useSWR<NewsCrawlerDashboardData>(
    "/api/admin/content/ticker/dashboard?limit=8",
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true }
  )

  useEffect(() => {
    if (!data || permission !== "granted") return
    if (prevNewCount.current !== null && data.counts.newLastHour > prevNewCount.current) {
      const diff = data.counts.newLastHour - prevNewCount.current
      notify("새 뉴스 감지", { body: `${diff}건 추가됨 · 최근 1시간 ${data.counts.newLastHour}건` })
    }
    prevNewCount.current = data.counts.newLastHour
  }, [data, notify, permission])

  const handleDelete = async (itemId: number) => {
    if (!confirm("이 뉴스 아이템을 즉시 삭제하시겠습니까?")) return
    setDeletingId(itemId)
    try {
      const response = await fetch(`/api/admin/content/ticker?id=${itemId}`, { method: "DELETE" })
      const json = await response.json()
      if (!response.ok) {
        throw new Error(json.error || "삭제에 실패했습니다.")
      }
      toast({ title: "삭제 완료", description: "뉴스 아이템을 삭제했습니다." })
      await mutate()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "삭제 실패",
        description: error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다.",
      })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Newspaper className="h-4 w-4" />
            뉴스 크롤링 모니터
          </CardTitle>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="destructive">NEW 1시간 {data?.counts.newLastHour ?? 0}건</Badge>
            <Badge variant="secondary">24시간 {data?.counts.newLast24Hours ?? 0}건</Badge>
            {data?.fetchedAt && (
              <span>갱신: {new Date(data.fetchedAt).toLocaleTimeString("ko-KR")}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={requestPermission}
            disabled={permission === "granted"}
          >
            {permission === "granted" ? (
              <>
                <Bell className="mr-1 h-4 w-4" />
                알림 활성
              </>
            ) : (
              <>
                <BellOff className="mr-1 h-4 w-4" />
                알림 허용
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            새로고침
          </Button>
          <Button size="sm" asChild>
            <Link href="/admin/content/ticker">전체 관리</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && !data ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        ) : data?.items.length ? (
          <div className="space-y-2">
            {data.items.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {item.community_slug || "-"}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {item.source_id}
                    </Badge>
                    {item.ticker_tag && (
                      <Badge variant="outline" className="text-xs">
                        {item.ticker_tag}
                      </Badge>
                    )}
                    <span className="text-muted-foreground text-xs">
                      {new Date(item.created_at).toLocaleString("ko-KR")}
                    </span>
                  </div>
                  <p className="truncate text-sm font-medium">
                    {item.headline_kr || item.original_title}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive h-8 w-8 shrink-0"
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                  title="즉시 삭제"
                >
                  {deletingId === item.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            최근 뉴스 아이템이 없습니다.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
