import type { ReactNode } from "react"

interface MinimalRightAsideProps {
  children: ReactNode
}

/**
 * Minimal Sport Right Aside slot.
 *
 * 페이지마다 카드 구성이 다름 (담벼락: PrizeCard + TalkList,
 * 예측: PrizeCard + MyBetCard + TalkList) 이므로 children slot 패턴.
 */
export function MinimalRightAside({ children }: MinimalRightAsideProps) {
  return <div className="flex flex-col gap-3">{children}</div>
}

/**
 * 사이드 카드 공통 wrapper — 12px radius, 1px line, 14px 20px padding.
 */
export function MinimalSideCard({
  title,
  trailing,
  children,
}: {
  title?: ReactNode
  trailing?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      className="rounded-xl border bg-[var(--ms-surface)] px-5 py-3.5"
      style={{ borderColor: "var(--ms-line)" }}
    >
      {(title || trailing) && (
        <div className="mb-2 flex items-center justify-between">
          {title && (
            <h4
              className="text-[14px] leading-tight font-extrabold"
              style={{ color: "var(--ms-ink)" }}
            >
              {title}
            </h4>
          )}
          {trailing}
        </div>
      )}
      {children}
    </section>
  )
}
