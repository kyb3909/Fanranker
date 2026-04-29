import { MinimalSideCard } from "./minimal-right-aside"

interface MinimalMyBetCardProps {
  wins?: number
  losses?: number
  weeklyCoin?: number
  title?: string
  isLoggedOut?: boolean
}

/**
 * 내 예측 통계 카드 (사이드).
 * /api/sports/my-stats summary (correct/wrong/net_profit/accuracy) 기반.
 *
 * Spec (핸드오프):
 *  - 헤더: "이번 주 내 예측" + 우측 "적중률 N%" (b는 Archivo 14/900 brand)
 *  - 막대 그래프: 10px height, 999px radius, brand vs ink-3 분할
 *  - 하단: "이번 주 획득 코인" + Archivo 14/900 brand "● +N"
 *
 * 백엔드에 weekly endpoint 없음 → 누적 stats 표시 (title 변경으로 명확화).
 * 비로그인 시 안내 표시.
 */
export function MinimalMyBetCard({
  wins = 0,
  losses = 0,
  weeklyCoin = 0,
  title = "내 예측 통계",
  isLoggedOut = false,
}: MinimalMyBetCardProps) {
  const total = wins + losses
  const rate = total > 0 ? Math.round((wins / total) * 100) : 0

  if (isLoggedOut) {
    return (
      <MinimalSideCard title={title}>
        <p
          className="py-3 text-center text-[12px] font-medium"
          style={{ color: "var(--ms-ink-3)" }}
        >
          로그인하면 통계가 표시됩니다.
        </p>
      </MinimalSideCard>
    )
  }

  if (total === 0) {
    return (
      <MinimalSideCard title={title}>
        <p
          className="py-3 text-center text-[12px] font-medium"
          style={{ color: "var(--ms-ink-3)" }}
        >
          아직 예측 기록이 없어요.
        </p>
      </MinimalSideCard>
    )
  }

  return (
    <MinimalSideCard
      title={title}
      trailing={
        <span className="text-[12px] font-bold" style={{ color: "var(--ms-ink-2)" }}>
          적중률{" "}
          <b
            className="font-archivo text-[14px] font-extrabold"
            style={{ color: "var(--ms-brand)" }}
          >
            {rate}%
          </b>
        </span>
      }
    >
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--ms-line)" }}
        aria-label={`${wins}승 ${losses}패`}
      >
        <div style={{ flex: wins, backgroundColor: "var(--ms-brand)" }} />
        <div style={{ flex: losses, backgroundColor: "var(--ms-ink-3)" }} />
      </div>
      <div
        className="mt-2.5 flex items-center justify-between text-[11px] font-bold"
        style={{ color: "var(--ms-ink-2)" }}
      >
        <span>
          <b style={{ color: "var(--ms-brand)" }}>{wins}승</b>
          <span className="mx-1" style={{ color: "var(--ms-ink-3)" }}>
            ·
          </span>
          <b style={{ color: "var(--ms-ink-3)" }}>{losses}패</b>
        </span>
        <span className="flex items-center gap-1.5">
          순이익 코인
          <span
            className="font-archivo text-[14px] font-extrabold tabular-nums"
            style={{ color: "var(--ms-brand)" }}
          >
            ● +{weeklyCoin}
          </span>
        </span>
      </div>
    </MinimalSideCard>
  )
}
