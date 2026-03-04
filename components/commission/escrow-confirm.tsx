"use client"

import { Button } from "@/components/ui/button"
import { AlertCircle, Shield } from "lucide-react"

interface Props {
  packageName: string
  priceGold: number
  userBalance: number
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export function EscrowConfirmDialog({ packageName, priceGold, userBalance, onConfirm, onCancel, loading }: Props) {
  const fee = Math.max(1, Math.floor(priceGold * 0.1))
  const artistReceives = priceGold - fee
  const hasEnough = userBalance >= priceGold

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md mx-4 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-base text-foreground">에스크로 결제 확인</h3>
        </div>

        <p className="text-xs text-muted-foreground">
          결제 금액은 플랫폼에서 안전하게 보관됩니다. 작업이 완료되면 작가에게 지급됩니다.
        </p>

        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">패키지</span>
            <span className="text-foreground font-medium">{packageName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">결제 금액</span>
            <span className="text-foreground font-bold">{priceGold.toLocaleString()}G</span>
          </div>
          <div className="border-t border-border pt-2 flex justify-between text-xs text-muted-foreground">
            <span>작가 수령 (수수료 10% 차감)</span>
            <span>{artistReceives.toLocaleString()}G</span>
          </div>
        </div>

        <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
          hasEnough ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-primary/10 border border-primary/30 text-primary'
        }`}>
          <span>보유 골드</span>
          <span className="font-bold">{userBalance.toLocaleString()}G</span>
        </div>

        {!hasEnough && (
          <div className="flex items-center gap-2 text-sm text-primary">
            <AlertCircle className="h-4 w-4" />
            골드가 {(priceGold - userBalance).toLocaleString()}G 부족합니다.
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
            취소
          </Button>
          <Button className="flex-1" onClick={onConfirm} disabled={!hasEnough || loading}>
            {loading ? '처리 중...' : '결제하기'}
          </Button>
        </div>
      </div>
    </div>
  )
}
