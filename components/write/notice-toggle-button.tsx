"use client"

import { useState } from "react"
import useSWR from "swr"
import { Megaphone, Loader2 } from "lucide-react"
import { fetcher } from "@/lib/swr"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"

/**
 * 수정 화면 전용 — admin/MOD 가 이 글을 그 게시판 공지로 추가/해제.
 * 스스로 권한+현재 공지여부를 fetch 하므로 postId 만 넘기면 됨. 권한 없으면 렌더 안 함.
 */
export function NoticeToggleButton({ postId }: { postId: string }) {
  const { data, mutate } = useSWR<{ canPostNotice: boolean; isNotice: boolean }>(
    postId ? `/api/posts/${postId}/notice` : null,
    fetcher,
    { revalidateOnFocus: false }
  )
  const [busy, setBusy] = useState(false)

  if (!data?.canPostNotice) return null
  const isNotice = data.isNotice

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/posts/${postId}/notice`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_notice: !isNotice }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; isNotice?: boolean }
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "오류",
          description: d.error || "변경에 실패했습니다.",
        })
        return
      }
      await mutate({ canPostNotice: true, isNotice: !!d.isNotice }, { revalidate: false })
      toast({
        title: !isNotice ? "공지로 등록됐어요" : "공지에서 내렸어요",
        description: !isNotice ? "게시판 상단에 고정됩니다." : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={toggle}
      disabled={busy}
      style={{ borderColor: "var(--wc-burgundy)", color: "var(--wc-burgundy)" }}
    >
      {busy ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Megaphone className="mr-2 h-4 w-4" />
      )}
      {isNotice ? "공지 해제" : "공지로 추가"}
    </Button>
  )
}
