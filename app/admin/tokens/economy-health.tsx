import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Coins, Award } from "lucide-react"

export type TypeAgg = Record<string, { count: number; sum: number }>

const TOKEN_TYPE_LABELS: Record<string, string> = {
  daily_reset: "일일 리셋 (발행)",
  prediction_spent: "예측 사용 (소비)",
  refund: "환불",
  admin_adjustment: "관리자 조정",
}

const GOLD_TYPE_LABELS: Record<string, string> = {
  purchase: "구매 (충전)",
  prediction_purchase: "예측 구매",
  reward: "보상 지급",
  admin_adjustment: "관리자 조정",
  commission_escrow_hold: "커미션 에스크로 보류",
  commission_escrow_release: "커미션 에스크로 지급",
  commission_escrow_refund: "커미션 에스크로 환불",
}

function HealthCard({
  title,
  icon: Icon,
  iconClass,
  agg,
  labels,
  unit,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  iconClass: string
  agg: TypeAgg
  labels: Record<string, string>
  unit: string
}) {
  const entries = Object.entries(agg).sort((a, b) => Math.abs(b[1].sum) - Math.abs(a[1].sum))
  const net = entries.reduce((s, [, v]) => s + v.sum, 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${iconClass}`} />
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-xs">최근 7일 거래 없음</p>
        ) : (
          <>
            {entries.map(([type, v]) => (
              <div key={type} className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">{labels[type] ?? type}</span>
                <span className="font-mono text-xs">
                  {v.sum > 0 ? "+" : ""}
                  {v.sum.toLocaleString()} {unit}
                  <span className="text-muted-foreground ml-1">({v.count})</span>
                </span>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t pt-2 font-medium">
              <span className="text-xs">순흐름 (7일)</span>
              <span className={`font-mono text-xs ${net >= 0 ? "text-green-600" : "text-primary"}`}>
                {net > 0 ? "+" : ""}
                {net.toLocaleString()} {unit}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * 최근 7일 토큰/골드 거래를 종류별로 집계해 경제 흐름을 표시.
 * 발행 vs 소비 균형을 한눈에 보기 위함.
 */
export function EconomyHealthCards({
  token,
  gold,
}: {
  token: TypeAgg
  gold: TypeAgg
  periodDays: number
}) {
  return (
    <div className="mb-6 space-y-3">
      <h2 className="text-lg font-semibold">경제 흐름 (최근 7일)</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <HealthCard
          title="토큰 (볼)"
          icon={Coins}
          iconClass="text-yellow-500"
          agg={token}
          labels={TOKEN_TYPE_LABELS}
          unit="볼"
        />
        <HealthCard
          title="골드"
          icon={Award}
          iconClass="text-amber-500"
          agg={gold}
          labels={GOLD_TYPE_LABELS}
          unit="G"
        />
      </div>
    </div>
  )
}
