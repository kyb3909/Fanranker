import { MinimalSideCard } from "./minimal-right-aside"

interface PrizeRow {
  pos: string
  emoji: string
  name: string
  pct?: string
}

const DEFAULT_PRIZES: PrizeRow[] = [
  { pos: "W1", emoji: "🎁", name: "치킨 기프티콘", pct: "32%" },
  { pos: "W2", emoji: "☕", name: "스벅 1만원", pct: "24%" },
  { pos: "W3", emoji: "🍔", name: "버거킹 세트", pct: "18%" },
  { pos: "W4", emoji: "🥤", name: "메가커피", pct: "8%" },
]

interface MinimalPrizeCardProps {
  monthLabel?: string
  prizes?: PrizeRow[]
  showSubLabel?: boolean
}

/**
 * 이달의 상품 카드.
 * 핸드오프: 헤더("4월 이달의 상품" + "1위 증정" pill) → 4 row → CTA("정답 확인하기").
 * 데이터 흐름이 미정 — 기본 더미 prize 표시 (실데이터 연결은 Phase 후속).
 */
export function MinimalPrizeCard({
  monthLabel,
  prizes = DEFAULT_PRIZES,
  showSubLabel = false,
}: MinimalPrizeCardProps) {
  const month = monthLabel ?? `${new Date().getMonth() + 1}월 이달의 상품`

  return (
    <MinimalSideCard
      title={month}
      trailing={
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
          style={{
            backgroundColor: "var(--ms-brand-soft)",
            color: "var(--ms-brand)",
          }}
        >
          1위 증정
        </span>
      }
    >
      {showSubLabel && (
        <div
          className="font-archivo mb-2 text-[9px] font-extrabold"
          style={{ color: "var(--ms-ink-3)", letterSpacing: "0.18em" }}
        >
          MONTHLY PRIZE
        </div>
      )}
      <ul className="flex flex-col gap-1.5">
        {prizes.map((p) => (
          <li
            key={p.pos}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px]"
            style={{ backgroundColor: "var(--ms-bg)" }}
          >
            <span
              className="font-archivo w-7 shrink-0 text-[11px] font-extrabold"
              style={{ color: "var(--ms-brand)" }}
            >
              {p.pos}
            </span>
            <span className="text-[14px]" aria-hidden>
              {p.emoji}
            </span>
            <span className="min-w-0 flex-1 truncate font-bold" style={{ color: "var(--ms-ink)" }}>
              {p.name}
            </span>
            {p.pct && (
              <span
                className="font-archivo text-[12px] font-extrabold tabular-nums"
                style={{ color: "var(--ms-brand)" }}
              >
                {p.pct}
              </span>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-3 h-9 w-full rounded-xl text-[12px] font-bold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: "var(--ms-ink)" }}
      >
        정답 확인하기
      </button>
    </MinimalSideCard>
  )
}
