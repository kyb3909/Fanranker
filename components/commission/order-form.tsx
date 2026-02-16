"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, AlertCircle } from "lucide-react"

interface Props {
  packageData: {
    id: string
    name: string
    type: string
    price_gold: number
    delivery_days: number
    max_revisions: number
    artist_id: string
  }
  userBalance: number
  onSubmit: (data: { title: string; description: string; reference_images: string[] }) => Promise<void>
}

export function CommissionOrderForm({ packageData, userBalance, onSubmit }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const hasEnough = userBalance >= packageData.price_gold
  const fee = Math.max(1, Math.floor(packageData.price_gold * 0.1))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('제목을 입력해주세요.'); return }
    if (!hasEnough) { setError('골드가 부족합니다.'); return }

    setLoading(true)
    setError('')
    try {
      await onSubmit({ title: title.trim(), description: description.trim(), reference_images: [] })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full h-9 px-3 bg-secondary text-sm text-foreground rounded-lg border border-transparent focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Package Summary */}
      <div className="bg-muted/50 border border-border rounded-xl p-4 space-y-2">
        <h3 className="font-bold text-sm text-foreground">{packageData.name}</h3>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>작업일: {packageData.delivery_days}일</span>
          <span>수정: {packageData.max_revisions}회</span>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-sm text-foreground">결제 금액</span>
          <span className="font-bold text-base text-primary">{packageData.price_gold.toLocaleString()}G</span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>완료 시 작가 수령 (수수료 10%)</span>
          <span>{(packageData.price_gold - fee).toLocaleString()}G</span>
        </div>
      </div>

      {/* Balance Check */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
        hasEnough ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
      }`}>
        <span>보유 골드</span>
        <span className="font-bold">{userBalance.toLocaleString()}G</span>
      </div>

      <div>
        <label className="text-xs font-medium text-foreground mb-1 block">의뢰 제목 *</label>
        <input className={inputClass} placeholder="예: 우리 캐릭터 일러스트 의뢰" value={title} onChange={e => setTitle(e.target.value)} />
      </div>

      <div>
        <label className="text-xs font-medium text-foreground mb-1 block">상세 설명</label>
        <textarea className={`${inputClass} h-28 py-2`} placeholder="원하는 스타일, 포즈, 분위기 등을 자세히 설명해주세요..." value={description} onChange={e => setDescription(e.target.value)} />
      </div>

      <Button type="submit" className="w-full" disabled={loading || !hasEnough}>
        {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {hasEnough ? `${packageData.price_gold.toLocaleString()}G 결제하고 주문하기` : '골드가 부족합니다'}
      </Button>
    </form>
  )
}
