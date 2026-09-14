"use client"
import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { Button } from "@/components/ui/button"
type Reward = {
  id: string
  seller_id: string
  amount: number
  description: string | null
  attempts: number
  last_error: string | null
}
export function SellerRewardQueue() {
  const { data, error, mutate, isLoading } = useSWR<{ rewards: Reward[] }>(
    "/api/admin/seller-rewards",
    fetcher
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  async function retry(id: string) {
    if (busy) return
    setBusy(id)
    setMessage("")
    try {
      const res = await fetch("/api/admin/seller-rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const result = await res.json()
      if (!res.ok || !result.success) throw new Error(result.error || "지급에 실패했습니다.")
      setMessage(result.duplicate ? "기존 지급을 확인했습니다." : "지급을 완료했습니다.")
      await mutate()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "지급 요청에 실패했습니다.")
      await mutate().catch(() => undefined)
    } finally {
      setBusy(null)
    }
  }
  if (isLoading) return <p role="status">불러오는 중입니다.</p>
  if (error)
    return (
      <div role="alert">
        목록을 불러오지 못했습니다. <Button onClick={() => mutate()}>다시 불러오기</Button>
      </div>
    )
  return (
    <div className="space-y-3">
      {message && <p role="status">{message}</p>}
      {!data?.rewards.length && <p>미지급 항목이 없습니다.</p>}
      {data?.rewards.map((row) => (
        <div key={row.id} className="rounded-xl border p-4">
          <p>
            {row.description || "판매 수익"} · {row.amount.toLocaleString()} 골드
          </p>
          <p className="text-muted-foreground text-sm">
            {row.seller_id} · 시도 {row.attempts}회
          </p>
          {row.last_error && <p className="text-destructive my-2 text-sm">{row.last_error}</p>}
          <Button disabled={busy !== null} onClick={() => retry(row.id)}>
            {busy === row.id ? "처리 중…" : "지급 재시도"}
          </Button>
        </div>
      ))}
    </div>
  )
}
