"use client"

import { useState } from "react"
import { Loader2, Hammer, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface InvestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  teamId: string
  teamName: string
  availablePoints: number
  onSuccess: (result: {
    points_invested: number
    new_total_points: number
    new_level: number
    leveled_up: boolean
    available_after: number
  }) => void
}

export function InvestDialog({
  open,
  onOpenChange,
  teamId,
  teamName,
  availablePoints,
  onSuccess,
}: InvestDialogProps) {
  const [amount, setAmount] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const numAmount = parseInt(amount) || 0
  const canInvest = numAmount > 0 && numAmount <= availablePoints

  // 프리셋: 가용 잔액 기준 비율
  const presets = [
    { label: "10%", value: Math.max(1, Math.floor(availablePoints * 0.1)) },
    { label: "25%", value: Math.max(1, Math.floor(availablePoints * 0.25)) },
    { label: "50%", value: Math.max(1, Math.floor(availablePoints * 0.5)) },
    { label: "전부", value: availablePoints },
  ].filter((p) => p.value > 0 && p.value <= availablePoints)

  const handleInvest = async () => {
    if (!canInvest || isSubmitting) return
    setIsSubmitting(true)

    try {
      const res = await fetch("/api/stadiums/invest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId, amount: numAmount }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "보태기 실패",
          description: data.error || "포인트가 부족합니다.",
        })
        return
      }

      if (data.leveled_up) {
        toast({
          title: "레벨 업!",
          description: `${teamName} 경기장이 Lv.${data.new_level}로 업그레이드됐습니다!`,
        })
      } else {
        toast({
          title: "보태기 완료",
          description: `${numAmount.toLocaleString()}pt를 ${teamName} 경기장에 보탰습니다.`,
        })
      }

      onSuccess(data)
      onOpenChange(false)
      setAmount("")
    } catch {
      toast({
        variant: "destructive",
        title: "오류",
        description: "보태는 중 오류가 발생했습니다.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hammer className="h-5 w-5" />
            경기장 키우기
          </DialogTitle>
          <DialogDescription>
            예측으로 모은 포인트를 {teamName} 경기장에 보태보세요
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 가용 잔액 */}
          <div className="bg-muted/50 flex items-center justify-between rounded-lg px-3 py-2.5">
            <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <TrendingUp className="h-4 w-4" />
              사용 가능
            </span>
            <span className="font-bold tabular-nums">
              {availablePoints.toLocaleString()}
              <span className="text-muted-foreground ml-0.5 text-xs font-normal">pt</span>
            </span>
          </div>

          {/* 수량 입력 */}
          <div>
            <p className="mb-2 text-sm font-medium">보탤 포인트</p>
            <input
              type="number"
              inputMode="numeric"
              enterKeyHint="done"
              pattern="[0-9]*"
              min={1}
              max={availablePoints}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="포인트 입력"
              className="border-input bg-background focus:ring-primary/30 w-full rounded-lg border px-3 py-2.5 text-sm tabular-nums outline-none focus:ring-2"
            />
          </div>

          {/* 프리셋 버튼 */}
          {presets.length > 0 && (
            <div className="flex gap-1.5">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setAmount(String(preset.value))}
                  className={cn(
                    "flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all",
                    numAmount === preset.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}

          {/* 안내 */}
          <p className="text-muted-foreground text-[12px]">
            현금 결제 없이, 예측으로 얻은 포인트만 사용할 수 있어요.
          </p>

          {/* 투자 버튼 */}
          <Button
            onClick={handleInvest}
            disabled={!canInvest || isSubmitting}
            className="w-full"
            size="lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                보태는 중...
              </>
            ) : (
              <>
                <Hammer className="mr-2 h-4 w-4" />
                {numAmount > 0 ? `${numAmount.toLocaleString()}pt 보태기` : "보태기"}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
