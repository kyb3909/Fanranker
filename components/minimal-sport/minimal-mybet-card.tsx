import { MinimalSideCard } from "./minimal-right-aside"

interface MinimalMyBetCardProps {
  wins?: number
  losses?: number
  weeklyCoin?: number
}

/**
 * 이번 주 내 예측 카드 (사이드).
 *
 * Spec (핸드오프):
 *  - 헤더: "이번 주 내 예측" + 우측 "적중률 N%" (b는 Archivo 14/900 brand)
 *  - 막대 그래프: 10px height, 999px radius, brand vs ink-3 분할
 *  - 하단: "이번 주 획득 코인" + Archivo 14/900 brand "● +N"
 *
 * 데이터 wiring 미정 — 1차는 prop 기본값 (Phase 후속 hook 연결).
 */
export function MinimalMyBetCard({
  wins = 17,
  losses = 8,
  weeklyCoin = 340,
}: MinimalMyBetCardProps) {
  const total = wins + losses
  const rate = total > 0 ? Math.round((wins / total) * 100) : 0

  return (
    <MinimalSideCard
      title="이번 주 내 예측"
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
          이번 주 획득 코인
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
