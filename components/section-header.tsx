import type { ReactNode } from "react"

interface SectionHeaderProps {
  /** 상단 라벨 (라틴 대문자 키커) — 없으면 생략 */
  label?: string
  /** 큰 제목 */
  title: ReactNode
  /** 설명 한 줄 — 없으면 생략 */
  description?: ReactNode
  /** 제목 우측 슬롯 (카운트·상태 등) */
  aside?: ReactNode
  /** 제목 태그 레벨 (기본 h1) */
  as?: "h1" | "h2"
  /** 밴드에 추가할 클래스 (간격 등 미세 조정용) */
  className?: string
  /** 밴드 인라인 스타일 오버라이드 (예: space-y 컨테이너 안에서 marginBottom:0) */
  style?: React.CSSProperties
}

/**
 * 페이지/섹션 상단 헤더 — 시안 A "매치데이"의 다크 존.
 *
 * 회색 캔버스 위에 다크 블록으로 "키커 + 제목 + 설명"을 올려 페이지 정체성을 선언한다.
 * 밴드 아래 콘텐츠(목록·카드)는 이 컴포넌트에 넣지 말고 라이트 카드로 둔다 — 긴 글과
 * 목록은 라이트가 읽기 좋다.
 *
 * 타이포 규약 (docs/design-review-2026-07-27/type-accent.md)
 * - 키커: 라틴 대문자 + 콘덴스드(--font-cond), 자간 0.2em, 13px 상한.
 *   크기로 겨루지 않고 자간으로만 존재한다.
 * - 제목: 한글 디스플레이(--font-display-ko = 어그로체 Bold). 이미 Bold 라
 *   font-weight 를 더 얹으면 합성 볼드로 뭉갠다.
 * - 다크 위 얇은 획 보정: text-shadow 0.5px(blur 0)로 획만 보강. 순백은 쓰지 않는다.
 *
 * 주의: 이미 다크 면 안에 들어 있는 헤더에는 쓰지 말 것 (중복 래핑 금지).
 */
export function SectionHeader({
  label,
  title,
  description,
  aside,
  as = "h1",
  className,
  style,
}: SectionHeaderProps) {
  const Title = as
  return (
    <div
      className={`gn-band overflow-hidden rounded-xl px-5 py-6 sm:px-7 sm:py-7 ${className ?? ""}`.trim()}
      style={{ marginBottom: 14, ...style }}
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          {label && (
            <div
              className="gn-num text-[12px] font-bold uppercase"
              style={{ letterSpacing: "0.2em", color: "var(--gn-bg-100)" }}
            >
              {label}
            </div>
          )}
          <Title
            className="mt-1.5 text-[26px] sm:text-[32px]"
            style={{
              fontFamily: "var(--font-display-ko), var(--font-title)",
              fontWeight: 700,
              letterSpacing: "-0.035em",
              lineHeight: 1.14,
              color: "var(--gn-cream)",
              textShadow: "0.5px 0 currentColor",
            }}
          >
            {title}
          </Title>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      {description && (
        <p className="mt-2.5 text-[14px]" style={{ color: "var(--gn-cream-dim)", lineHeight: 1.6 }}>
          {description}
        </p>
      )}
    </div>
  )
}
