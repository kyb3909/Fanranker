"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, Upload } from "lucide-react"

interface Props {
  milestoneId: string
  milestoneTitle: string
  orderId: string
  onSubmitted: () => void
}

export function MilestoneSubmitForm({ milestoneId, milestoneTitle, orderId, onSubmitted }: Props) {
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/commissions/orders/${orderId}/milestones/${milestoneId}/submit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliverable_note: note, deliverable_images: [] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onSubmitted()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '제출 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h4 className="font-medium text-sm text-foreground flex items-center gap-2">
        <Upload className="h-4 w-4 text-primary" />
        &ldquo;{milestoneTitle}&rdquo; 결과물 제출
      </h4>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <textarea
        className="w-full h-20 px-3 py-2 bg-secondary text-sm text-foreground rounded-lg border border-transparent focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
        placeholder="결과물에 대한 메모를 입력하세요..."
        value={note}
        onChange={e => setNote(e.target.value)}
      />
      <Button onClick={handleSubmit} disabled={loading} size="sm" className="w-full">
        {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        결과물 제출
      </Button>
    </div>
  )
}
