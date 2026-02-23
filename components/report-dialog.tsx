"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"

const REPORT_REASONS = [
  { value: "discrimination", label: "차별적 표현", card: "red" },
  { value: "advertising", label: "광고/스팸", card: "red" },
  { value: "profanity", label: "욕설/비하", card: "yellow" },
  { value: "abuse", label: "어뷰징", card: "yellow" },
  { value: "political", label: "정치적 게시글", card: "yellow" },
] as const

interface ReportDialogProps {
  targetType: "post" | "comment"
  targetId: string | number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReportDialog({ targetType, targetId, open, onOpenChange }: ReportDialogProps) {
  const [reason, setReason] = useState<string>("")
  const [description, setDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!reason) {
      toast({ variant: "destructive", title: "사유를 선택해주세요." })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId: String(targetId),
          reason,
          description: description.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "신고 접수에 실패했습니다.")
      }

      toast({ title: "신고가 접수되었습니다.", description: "관리자가 검토 후 조치하겠습니다." })
      onOpenChange(false)
      setReason("")
      setDescription("")
    } catch (error) {
      toast({
        variant: "destructive",
        title: "신고 실패",
        description: error instanceof Error ? error.message : "오류가 발생했습니다.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>신고하기</DialogTitle>
          <DialogDescription>
            {targetType === "post" ? "게시글" : "댓글"}을 신고합니다. 사유를 선택해주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 사유 선택 */}
          <div className="space-y-2">
            {REPORT_REASONS.map((r) => (
              <label
                key={r.value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  reason === r.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="sr-only"
                />
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold text-white ${
                    r.card === "red" ? "bg-red-500" : "bg-yellow-500"
                  }`}
                >
                  {r.card === "red" ? "레드" : "옐로"}
                </span>
                <span className="text-sm font-medium">{r.label}</span>
                {reason === r.value && (
                  <span className="ml-auto text-primary text-sm">✓</span>
                )}
              </label>
            ))}
          </div>

          {/* 상세 설명 */}
          <div className="space-y-2">
            <Label htmlFor="report-description" className="text-sm text-muted-foreground">
              상세 설명 (선택)
            </Label>
            <Textarea
              id="report-description"
              placeholder="추가 설명이 있다면 작성해주세요..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px] resize-none"
              maxLength={500}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={!reason || isSubmitting}>
            {isSubmitting ? "접수 중..." : "신고 접수"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
