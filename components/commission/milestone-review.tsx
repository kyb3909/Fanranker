"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, Check, RotateCcw } from "lucide-react"

interface Props {
  milestoneId: string
  milestoneTitle: string
  orderId: string
  deliverableNote: string | null
  revisionsUsed: number
  maxRevisions: number
  onAction: () => void
}

export function MilestoneReviewCard({ milestoneId, milestoneTitle, orderId, deliverableNote, revisionsUsed, maxRevisions, onAction }: Props) {
  const [feedback, setFeedback] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const canRevise = revisionsUsed < maxRevisions

  const handleApprove = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/commissions/orders/${orderId}/milestones/${milestoneId}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onAction()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '처리 실패')
    } finally {
      setLoading(false)
    }
  }

  const handleRevision = async () => {
    if (!feedback.trim()) { setError('수정 요청 내용을 입력해주세요.'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/commissions/orders/${orderId}/milestones/${milestoneId}/revision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onAction()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '처리 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-card border border-indigo-200 rounded-xl p-4 space-y-3">
      <h4 className="font-medium text-sm text-foreground">&ldquo;{milestoneTitle}&rdquo; 결과물 확인</h4>

      {deliverableNote && (
        <div className="bg-muted/50 rounded-lg px-3 py-2">
          <p className="text-xs text-muted-foreground mb-0.5">작가 메모</p>
          <p className="text-sm text-foreground">{deliverableNote}</p>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <textarea
        className="w-full h-16 px-3 py-2 bg-secondary text-sm text-foreground rounded-lg border border-transparent focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
        placeholder="피드백을 입력하세요 (선택사항, 수정 요청 시 필수)"
        value={feedback}
        onChange={e => setFeedback(e.target.value)}
      />

      <div className="flex gap-2">
        <Button onClick={handleApprove} disabled={loading} size="sm" className="flex-1 gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          승인
        </Button>
        <Button onClick={handleRevision} disabled={loading || !canRevise} size="sm" variant="outline" className="flex-1 gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          수정 요청 ({revisionsUsed}/{maxRevisions})
        </Button>
      </div>
    </div>
  )
}
