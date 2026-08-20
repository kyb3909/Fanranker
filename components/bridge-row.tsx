import Link from "@/components/ui/app-link"

/**
 * 도선 행 (2026-08-20 UX 패널 — "순환이 작동하는 지면은 뉴스 상세뿐").
 *
 * 지면 끝에서 다음 지면으로 흘리는 표준 문법: 와인 틴트 행 + 좌 제목 + 우 버건디
 * 액션 (8/20 불판 배너·승부예측 도선과 같은 모양). 페이지 하단이 푸터로 추락하는
 * 데드엔드를 봉합할 때 이걸 쓴다 — 새 모양을 발명하지 말 것.
 */
export function BridgeRow({
  href,
  title,
  action,
}: {
  href: string
  title: string
  action: string
}) {
  return (
    <Link
      href={href}
      className="flex items-baseline justify-between rounded-xl px-4 py-3 no-underline transition-colors hover:bg-[var(--wc-tint)]"
      style={{ background: "var(--wc-wine-tint)", border: "1px solid var(--wc-line)" }}
    >
      <span className="text-[13.5px] font-bold" style={{ color: "var(--wc-ink)" }}>
        {title}
      </span>
      <span className="text-[12.5px] font-bold" style={{ color: "var(--wc-burgundy)" }}>
        {action}
      </span>
    </Link>
  )
}
