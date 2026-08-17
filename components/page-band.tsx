import type { ReactNode } from "react"

interface PageBandProps {
  /** 라틴 대문자 키커 — 크기로 겨루지 않고 자간으로만 존재한다 */
  kicker?: string
  /** 한글 디스플레이 제목 */
  title: ReactNode
  /** 설명 한 줄 */
  description?: ReactNode
  /** 우측 지표 슬롯 (카운트 등) */
  aside?: ReactNode
  /** 제목 태그 레벨 (기본 h1) */
  as?: "h1" | "h2"
  /**
   * 밴드 아래로 걸쳐 나가는 콘텐츠 (운동장 게시판 카드).
   * 넘기면 밴드의 overflow 클리핑이 풀리고 하단 패딩이 사라진다.
   */
  children?: ReactNode
}

/**
 * 페이지 상단 다크 밴드 — 시안 A "매치데이"의 다크 존 (전 페이지 공용).
 *
 * 담벼락(MatchdayBand)·운동장과 **같은 크기·같은 풀블리드 폭**으로 페이지 정체성을
 * 선언한다. 본문 칼럼 안에 든 라운드 카드로 만들면 페이지마다 폭과 모서리가 달라져
 * 일관성이 깨진다 → 반드시 그리드 바깥, 최상단에 둘 것.
 *
 * 타이포 규약 (docs/design-review-2026-07-27/type-accent.md)
 * - 키커: 콘덴스드 라틴 대문자, 자간 0.2em, 13px 상한
 * - 제목: 한글 디스플레이(어그로체 Bold). 이미 Bold 라 font-weight 를 더 얹으면
 *   브라우저가 합성 볼드로 뭉갠다 → 700 고정
 * - 다크 위 얇은 획 보정: text-shadow 0.5px(blur 0). 순백은 쓰지 않는다
 *
 * 밴드 안에 긴 글·목록·폼을 넣지 말 것 — 읽기 영역은 라이트가 낫다.
 */
export function PageBand({
  kicker,
  title,
  description,
  aside,
  as = "h1",
  children,
}: PageBandProps) {
  const Title = as
  return (
    <section className={children ? "gn-band gn-band-open" : "gn-band"}>
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <div
          className={`flex flex-wrap items-end gap-x-6 gap-y-3 pt-8 ${children ? "pb-6" : "pb-8"}`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
              <Title
                className="text-[30px] leading-none sm:text-[42px]"
                style={{
                  fontFamily: "var(--font-display-ko), var(--font-title)",
                  fontWeight: 700,
                  letterSpacing: "-0.04em",
                  color: "var(--gn-cream)",
                  textShadow: "0.5px 0 currentColor",
                }}
              >
                {title}
              </Title>
              {kicker && (
                <span
                  className="gn-num text-[12.5px] font-bold uppercase"
                  style={{ letterSpacing: "0.2em", color: "var(--gn-bg-100)" }}
                >
                  {kicker}
                </span>
              )}
            </div>
            {description && (
              <p
                className="mt-3 max-w-[46ch] text-[14.5px]"
                style={{ color: "var(--gn-cream-dim)", wordBreak: "keep-all" }}
              >
                {description}
              </p>
            )}
          </div>
          {aside && <div className="shrink-0 text-right">{aside}</div>}
        </div>
        {children}
      </div>
    </section>
  )
}

/** 밴드 우측 지표 — 큰 숫자 + 라틴 대문자 라벨 (운동장 Open Boards 등) */
export function PageBandStat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <>
      <span
        className="gn-num block text-[34px] leading-none font-bold"
        style={{ color: "var(--gn-cream)" }}
      >
        {value}
      </span>
      {/* ⚠️ 자간은 **마지막 글자 뒤에도** 붙는다. 우측 정렬 슬롯이라 그 여백이 지면 밖으로
          밀려 마지막 글자가 잘렸다 (2026-08-18 실측: `160 MATCHES` 의 S). 자간만큼 되민다. */}
      <span
        className="gn-num mt-1.5 block text-[12px] font-bold uppercase"
        style={{ letterSpacing: "0.18em", marginRight: "-0.18em", color: "#8d8794" }}
      >
        {label}
      </span>
    </>
  )
}
