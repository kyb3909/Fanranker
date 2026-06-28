"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { Loader2, ExternalLink, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"

const TipTapContent = dynamic(
  () => import("@/components/editor/tiptap-content").then((m) => m.TipTapContent),
  { ssr: false }
)

export interface ReviewItem {
  id: string
  title: string
  content: unknown
  tags: string[]
  sourceUrl: string | null
  originUrl: string | null
  scores: Record<string, unknown>
  createdAt: string
}

export function NewsReviewClient({ items: initial }: { items: ReviewItem[] }) {
  const [items, setItems] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)

  async function act(id: string, action: "publish" | "reject") {
    if (busy) return
    setBusy(id)
    try {
      const res = await fetch("/api/admin/news-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; post_id?: string }
      if (!res.ok) {
        toast({ variant: "destructive", title: "오류", description: d.error || "처리 실패" })
        return
      }
      setItems((prev) => prev.filter((it) => it.id !== id))
      toast({
        title: action === "publish" ? "발행 완료" : "반려 완료",
        description: action === "publish" ? "축구 게시판에 게시됐습니다." : undefined,
      })
    } finally {
      setBusy(null)
    }
  }

  if (items.length === 0) {
    return (
      <div className="text-muted-foreground mt-10 rounded-lg border border-dashed p-10 text-center text-sm">
        검수할 초안이 없습니다.
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-5">
      {items.map((it) => (
        <div key={it.id} className="bg-card rounded-xl border p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-bold">{it.title}</h2>
            <span className="text-muted-foreground shrink-0 text-xs">
              {new Date(it.createdAt).toLocaleString("ko-KR")}
            </span>
          </div>

          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {typeof it.scores.credibility !== "undefined" && (
              <span>신뢰도 {String(it.scores.credibility)}</span>
            )}
            {typeof it.scores.importance !== "undefined" && (
              <span>중요도 {String(it.scores.importance)}</span>
            )}
            {it.tags.length > 0 && <span>#{it.tags.join(" #")}</span>}
            {it.sourceUrl && (
              <a
                href={it.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                원문 <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {it.originUrl && (
              <a
                href={it.originUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                r/soccer <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="bg-background mt-3 max-h-[420px] overflow-auto rounded-lg border p-3">
            {it.content ? (
              <TipTapContent content={it.content} />
            ) : (
              <span className="text-muted-foreground text-sm">(본문 없음)</span>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <Button onClick={() => act(it.id, "publish")} disabled={busy !== null} size="sm">
              {busy === it.id ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-4 w-4" />
              )}
              발행
            </Button>
            <Button
              onClick={() => act(it.id, "reject")}
              disabled={busy !== null}
              size="sm"
              variant="outline"
            >
              <X className="mr-1.5 h-4 w-4" />
              반려
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
