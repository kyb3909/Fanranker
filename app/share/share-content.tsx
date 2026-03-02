"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { ALL_COMMUNITIES } from "@/lib/constants/communities"
import { CommunitySidebar } from "@/components/community-sidebar"
import { ActivitySidebar } from "@/components/activity-sidebar"

interface TopicItem {
  label: string
  count: number
  color: string
}

type ShareData = Record<string, TopicItem[]>

export function ShareContent() {
  const [data, setData] = useState<ShareData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/topic-share")
      .then((r) => r.json())
      .then((d) => setData(d.data || {}))
      .catch(() => setData({}))
      .finally(() => setLoading(false))
  }, [])

  return (
    <main
      id="main-content"
      className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 sm:py-6"
      tabIndex={-1}
    >
      <div className="grid grid-cols-12 gap-5 lg:gap-6">
        {/* Left sidebar */}
        <aside className="col-span-3 hidden lg:block">
          <div className="sticky top-16">
            <CommunitySidebar />
          </div>
        </aside>

        {/* Main content */}
        <section className="col-span-12 lg:col-span-6">
          <div className="mb-5">
            <h1 className="text-xl font-bold">토픽 점유율</h1>
            <p className="text-muted-foreground mt-0.5 text-[13px]">게시판별 토픽 언급 비율</p>
          </div>

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="animate-pulse p-4">
                  <div className="bg-muted mb-3 h-5 w-24 rounded" />
                  <div className="bg-muted h-7 w-full rounded-full" />
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {ALL_COMMUNITIES.map((community) => {
                const items = data?.[community.slug]
                if (!items || items.length === 0) return null
                return (
                  <TopicShareCard
                    key={community.slug}
                    emoji={community.emoji}
                    name={community.name}
                    items={items}
                  />
                )
              })}
              {data && Object.keys(data).length === 0 && (
                <div className="text-muted-foreground py-16 text-center text-sm">
                  아직 분석할 글이 충분하지 않습니다
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right sidebar */}
        <aside className="col-span-3 hidden lg:block">
          <div className="sticky top-16">
            <ActivitySidebar />
          </div>
        </aside>
      </div>
    </main>
  )
}

function TopicShareCard({
  emoji,
  name,
  items,
}: {
  emoji: string
  name: string
  items: TopicItem[]
}) {
  const total = items.reduce((s, t) => s + t.count, 0)
  const topics = items.filter((t) => t.label !== "기타")
  const other = items.find((t) => t.label === "기타")
  const maxCount = Math.max(...topics.map((t) => t.count), 1)

  return (
    <Card className="p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-base">{emoji}</span>
          <span className="text-[15px] font-bold">{name}</span>
        </div>
        <span className="text-muted-foreground text-[12px]">{total}건</span>
      </div>

      {/* Stacked bar */}
      <div className="bg-secondary mb-3 flex h-6 overflow-hidden rounded-md">
        {topics.map((t, i) => {
          const pct = (t.count / total) * 100
          if (pct < 1.5) return null
          return (
            <div
              key={i}
              className={`${t.color} flex items-center justify-center`}
              style={{ width: `${pct}%` }}
              title={`${t.label} ${pct.toFixed(1)}%`}
            >
              {pct >= 10 && (
                <span className="truncate px-0.5 text-[10px] font-bold text-white drop-shadow-sm">
                  {t.label}
                </span>
              )}
            </div>
          )
        })}
        {other && <div className="bg-muted flex flex-1 items-center justify-center" />}
      </div>

      {/* Legend rows */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {topics.map((t, i) => {
          const pct = (t.count / total) * 100
          return (
            <div key={i} className="flex items-center gap-1.5 py-0.5">
              <div className={`h-2.5 w-2.5 shrink-0 rounded-sm ${t.color}`} />
              <span className="truncate text-[13px]">{t.label}</span>
              <span className="text-muted-foreground ml-auto shrink-0 text-[12px] tabular-nums">
                {pct.toFixed(1)}%
              </span>
            </div>
          )
        })}
        {other && (
          <div className="flex items-center gap-1.5 py-0.5">
            <div className="bg-muted h-2.5 w-2.5 shrink-0 rounded-sm" />
            <span className="text-muted-foreground text-[13px]">기타</span>
            <span className="text-muted-foreground ml-auto shrink-0 text-[12px] tabular-nums">
              {((other.count / total) * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </Card>
  )
}
