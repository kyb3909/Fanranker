"use client"

import { useState } from "react"
import useSWR from "swr"
import { Megaphone, Loader2, Pin } from "lucide-react"
import { fetcher } from "@/lib/swr"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"

interface NoticeState {
  canPostNotice: boolean
  isNotice: boolean
  canGlobalNotice: boolean
  isGlobalNotice: boolean
}

/**
 * 수정 화면 전용 — 공지 토글 두 종류.
 * - 게시판 공지: admin/MOD (canPostNotice) → 그 게시판 상단 고정
 * - 전체 공지: 관리자 전용 (canGlobalNotice) → 담벼락(홈) 최상단 고정
 * 스스로 권한+현재 상태를 fetch 하므로 postId 만 넘기면 됨. 권한 없으면 렌더 안 함.
 */
export function NoticeToggleButton({ postId }: { postId: string }) {
  const { data, mutate } = useSWR<NoticeState>(
    postId ? `/api/posts/${postId}/notice` : null,
    fetcher,
    { revalidateOnFocus: false }
  )
  const [busy, setBusy] = useState<"notice" | "global" | null>(null)

  if (!data?.canPostNotice && !data?.canGlobalNotice) return null

  const patch = async (
    field: "is_notice" | "is_global_notice",
    next: boolean,
    label: { on: string; off: string; onDesc?: string }
  ) => {
    if (busy) return
    setBusy(field === "is_notice" ? "notice" : "global")
    try {
      const res = await fetch(`/api/posts/${postId}/notice`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "오류",
          description: d.error || "변경에 실패했습니다.",
        })
        return
      }
      await mutate(
        (prev) =>
          prev
            ? {
                ...prev,
                ...(field === "is_notice" ? { isNotice: next } : { isGlobalNotice: next }),
              }
            : prev,
        { revalidate: false }
      )
      toast({ title: next ? label.on : label.off, description: next ? label.onDesc : undefined })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {data.canPostNotice && (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            patch("is_notice", !data.isNotice, {
              on: "공지로 등록됐어요",
              off: "공지에서 내렸어요",
              onDesc: "게시판 상단에 고정됩니다.",
            })
          }
          disabled={busy !== null}
          style={{ borderColor: "var(--wc-burgundy)", color: "var(--wc-burgundy)" }}
        >
          {busy === "notice" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Megaphone className="mr-2 h-4 w-4" />
          )}
          {data.isNotice ? "공지 해제" : "공지로 추가"}
        </Button>
      )}

      {data.canGlobalNotice && (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            patch("is_global_notice", !data.isGlobalNotice, {
              on: "전체 공지로 고정됐어요",
              off: "전체 공지에서 내렸어요",
              onDesc: "담벼락(홈) 최상단에 고정됩니다.",
            })
          }
          disabled={busy !== null}
          style={{ borderColor: "#C99A2E", color: "#946A12" }}
        >
          {busy === "global" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Pin className="mr-2 h-4 w-4" />
          )}
          {data.isGlobalNotice ? "전체 공지 해제" : "전체 공지로 고정"}
        </Button>
      )}
    </div>
  )
}
