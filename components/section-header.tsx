import type { ReactNode } from "react"

interface SectionHeaderProps {
  /** 상단 라벨 (버건디 eyebrow) — 없으면 생략 */
  label?: string
  /** 큰 제목 */
  title: ReactNode
  /** 설명 한 줄 — 없으면 생략 */
  description?: ReactNode
  /** 제목 태그 레벨 (기본 h1) */
  as?: "h1" | "h2"
  /** 밴드에 추가할 클래스 (간격 등 미세 조정용) */
  className?: string
  /** 밴드 인라인 스타일 오버라이드 (예: space-y 컨테이너 안에서 marginBottom:0) */
  style?: React.CSSProperties
}

/**
 * 페이지/섹션 상단 헤더를 흰색 밴드로 통일한다 (.wc-page-head).
 *
 * 회색 캔버스(#eef0f3) 위에 "라벨 + 제목 + 설명"을 흰 면으로 올려 정돈한다.
 * 밴드 아래 콘텐츠(목록·카드)는 이 컴포넌트에 넣지 말고 회색 위 흰 카드로 둔다.
 *
 * 주의: 이미 흰 카드/패널 안에 들어 있는 헤더에는 쓰지 말 것 (중복 래핑 금지).
 *
 * 색상 규약: 라벨 = 버건디(.wc-sec-eb), 제목 = ink, 설명 = ink-2 (옅은 회색 금지).
 */
export function SectionHeader({
  label,
  title,
  description,
  as = "h1",
  className,
  style,
}: SectionHeaderProps) {
  const Title = as
  return (
    <div
      className={`wc-page-head ${className ?? ""}`.trim()}
      style={{ marginBottom: 14, ...style }}
    >
      {label && <div className="wc-sec-eb">{label}</div>}
      <Title
        className="font-title text-[28px] font-extrabold sm:text-[34px]"
        style={{ letterSpacing: "-.03em", lineHeight: 1.15 }}
      >
        {title}
      </Title>
      {description && (
        <p className="mt-2 text-[14px]" style={{ color: "var(--wc-ink-2)", lineHeight: 1.6 }}>
          {description}
        </p>
      )}
    </div>
  )
}
