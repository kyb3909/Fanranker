"use client"

import { useState } from "react"
import useSWR from "swr"
import { Star, Loader2 } from "lucide-react"
import { fetcher } from "@/lib/swr"
import { toast } from "@/hooks/use-toast"

interface NoticeState {
  canGlobalNotice: boolean
  isHero: boolean
}

/**
 * 관리자 전용 — 이 글을 홈 히어로(Top Story)에 걸고 내리는 토글 (2026-08-03).
 *
 * 글 수정 화면이 아니라 **상세 페이지**에 두는 이유: 히어로 후보는 대부분 봇 발행
 * 뉴스인데 글 수정은 작성자만 가능해서(app/api/posts/[id]/route.ts) 관리자가 수정
 * 화면에 못 들어간다. 상세에서 바로 거는 게 유일하게 자연스러운 동선.
 *
 * 권한·상태는 기존 /api/posts/[id]/notice 를 그대로 쓴다 (전체 공지와 같은 admin 게이트).
 * 권한 없으면 아무것도 렌더하지 않는다.
 */
export function HeroPinButton({ postId }: { postId: string }) {
  const { data, mutate } = useSWR<NoticeState>(
    postId ? `/api/posts/${postId}/notice` : null,
    fetcher,
    { revalidateOnFocus: false }
  )
  const [busy, setBusy] = useState(false)

  if (!data?.canGlobalNotice) return null

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      const next = !data.isHero
      const res = await fetch(`/api/posts/${postId}/notice`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_hero: next }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast({ variant: "destructive", title: "오류", description: d.error || "변경 실패" })
        return
      }
      await mutate((prev) => (prev ? { ...prev, isHero: next } : prev), { revalidate: false })
      toast({
        title: next ? "메인에 걸었어요" : "메인에서 내렸어요",
        description: next ? "홈 히어로(Top Story)에 노출됩니다." : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] font-bold disabled:opacity-50"
      style={{
        borderColor: data.isHero ? "var(--wc-burgundy)" : "var(--wc-line)",
        color: data.isHero ? "var(--wc-burgundy)" : "var(--wc-mute)",
        background: data.isHero ? "rgba(139,30,63,.06)" : "transparent",
      }}
      aria-pressed={data.isHero}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Star className={`h-3.5 w-3.5 ${data.isHero ? "fill-current" : ""}`} />
      )}
      {data.isHero ? "메인에서 내리기" : "메인에 걸기"}
    </button>
  )
}
