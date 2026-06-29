import { Info } from "lucide-react"
import { WorldcupRulesContent } from "./worldcup-rules-content"

/**
 * 승부 예측 규칙 상시 카드 — 베팅 슬립 아래에 노출.
 * 모달을 안 보고 닫는 사용자를 위해 규칙을 항상 보이게 한다.
 */
export function WorldcupRulesCard() {
  return (
    <div
      style={{
        background: "var(--wc-card)",
        border: "1px solid var(--wc-line)",
        borderRadius: 12,
        boxShadow: "var(--wc-shadow-1)",
        padding: "16px 18px",
        marginTop: 12,
      }}
    >
      <div
        className="flex items-center gap-1.5"
        style={{ fontSize: 14, fontWeight: 800, color: "var(--wc-ink)", marginBottom: 10 }}
      >
        <Info className="h-4 w-4" aria-hidden style={{ color: "var(--wc-burgundy)" }} />
        승부 예측 규칙
      </div>
      <WorldcupRulesContent />
    </div>
  )
}
