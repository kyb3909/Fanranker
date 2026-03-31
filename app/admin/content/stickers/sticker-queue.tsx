"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { CheckCircle2, XCircle, Loader2, ThumbsUp, ShoppingCart, MessageSquare } from "lucide-react"

interface Sticker {
  id: string
  name: string
  image_url: string
  media_type: string
  status: string
  price: number
  vote_count: number
  vote_threshold: number
  purchase_count: number
  use_count: number
  board_slug: string | null
  tags: string[] | null
  created_at: string
  approved_at: string | null
  rejected_at: string | null
  creator_id: string
  creator_nickname: string
}

type StatusFilter = "pending" | "approved" | "rejected" | "all"

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "대기", variant: "outline" },
  approved: { label: "승인", variant: "default" },
  rejected: { label: "거절", variant: "destructive" },
}

export function StickerQueue() {
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>("pending")

  const fetchStickers = async (status: StatusFilter) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/content/stickers?status=${status}`)
      if (!res.ok) throw new Error("로딩 실패")
      const data = await res.json()
      setStickers(data.stickers ?? [])
      setTotal(data.total ?? 0)
    } catch {
      toast({ variant: "destructive", title: "스티커 목록을 불러올 수 없습니다." })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStickers(filter)
  }, [filter])

  const handleAction = async (stickerId: string, action: "approve" | "reject") => {
    setActionLoading(stickerId)
    try {
      const res = await fetch("/api/admin/content/stickers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sticker_id: stickerId, action }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "처리 실패")
      }
      toast({ title: action === "approve" ? "승인되었습니다." : "거절되었습니다." })
      setStickers((prev) => prev.filter((s) => s.id !== stickerId))
      setTotal((prev) => prev - 1)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "오류",
        description: err instanceof Error ? err.message : "처리 실패",
      })
    } finally {
      setActionLoading(null)
    }
  }

  const filters: { key: StatusFilter; label: string }[] = [
    { key: "pending", label: "대기중" },
    { key: "approved", label: "승인됨" },
    { key: "rejected", label: "거절됨" },
    { key: "all", label: "전체" },
  ]

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        {filters.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
        <span className="text-muted-foreground ml-auto text-sm">총 {total}개</span>
      </div>

      {/* Sticker grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      ) : stickers.length === 0 ? (
        <div className="text-muted-foreground py-20 text-center">
          {filter === "pending" ? "대기 중인 스티커가 없습니다." : "스티커가 없습니다."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {stickers.map((sticker) => (
            <Card key={sticker.id} className="overflow-hidden">
              <CardContent className="p-4">
                {/* Sticker image */}
                <div className="bg-muted mb-3 flex aspect-square items-center justify-center rounded-lg">
                  <Image
                    src={sticker.image_url}
                    alt={sticker.name}
                    width={200}
                    height={200}
                    className="h-full w-full rounded-lg object-contain p-2"
                    unoptimized={sticker.media_type === "animated"}
                  />
                </div>

                {/* Info */}
                <div className="mb-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h3 className="truncate text-sm font-semibold">{sticker.name}</h3>
                    <Badge
                      variant={statusConfig[sticker.status]?.variant ?? "outline"}
                      className="text-[10px]"
                    >
                      {statusConfig[sticker.status]?.label ?? sticker.status}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">제작: {sticker.creator_nickname}</p>
                  <div className="text-muted-foreground flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-0.5">
                      <ThumbsUp className="h-3 w-3" />
                      {sticker.vote_count}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <ShoppingCart className="h-3 w-3" />
                      {sticker.purchase_count}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <MessageSquare className="h-3 w-3" />
                      {sticker.use_count}
                    </span>
                    <span className="ml-auto">{sticker.price}P</span>
                  </div>
                  {sticker.tags && sticker.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {sticker.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-muted-foreground text-[10px]">
                    {new Date(sticker.created_at).toLocaleDateString("ko-KR")}
                    {sticker.board_slug && ` · ${sticker.board_slug}`}
                  </p>
                </div>

                {/* Actions (pending only) */}
                {sticker.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={actionLoading === sticker.id}
                      onClick={() => handleAction(sticker.id, "approve")}
                    >
                      {actionLoading === sticker.id ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      )}
                      승인
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      disabled={actionLoading === sticker.id}
                      onClick={() => handleAction(sticker.id, "reject")}
                    >
                      <XCircle className="mr-1 h-3.5 w-3.5" />
                      거절
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
