/**
 * 사료 등급 칩 — 사가 지면 전체의 단일 규약.
 *
 * 사이트 전체 유채색이 버건디 하나다. 그래서 등급은 색을 늘리지 않고 **채움 3단
 * 사다리**로만 말한다 (2026-08-18 실록 리디자인에서 확정):
 *
 *   잉크 채움 = 오피셜(확정)  ·  버건디 외곽 = 유력  ·  실선 외곽 = 루머
 *
 * ⚠️ 이 규약을 여기 한 곳에 둔 이유가 있다. 2026-08-18 에 실록만 고치고 이적 사가
 *    상세(app/saga/[slug]/page.tsx)는 같이 안 고쳐서, **같은 등급이 두 페이지에서
 *    다른 색으로** 그려지고 있었다 — 상세 쪽에는 초록(#0E7A3C)·금색(#946A12)
 *    팔레트가 그대로 남아, 실록이 버리기로 한 그 색이 옆 페이지에 살아 있었다.
 *    (2026-08-29 통합) 새 사가 지면을 만들면 자기 색을 만들지 말고 이걸 쓸 것.
 *
 * radius 4 = 상태 칩 (radius 8 소속 칩과 형태로 구분 — 홈 피드가 8을 쓴다).
 */

export type SagaTier = "official" | "tier1" | "rumor"

/**
 * 칩 톤 — 등급 사다리를 일반화한 것. 사가 지면의 모든 칩이 이 넷 중 하나다.
 *   ink  = 확정·완료 (오피셜)
 *   wine = 우리가 쓴 것·유력 (리포트, tier1)
 *   line = 미확정 (루머·이적설, 리포트 없는 기록)
 *   soft = 분류만 하는 중립 칩 (경기·기사·뉴스)
 */
export type ChipTone = "ink" | "wine" | "line" | "soft"

/** 칩 라벨은 지면마다 다르다 — 시즌 문서는 "이적설", 이적 사가 상세는 "루머" */
export const TIER_LABEL: Record<SagaTier, string> = {
  official: "오피셜",
  tier1: "유력",
  rumor: "루머",
}

/** align-middle: 칩이 헤드라인 문단 안에 인라인으로 들어가는 경우가 있다 */
export const TIER_CHIP_BASE =
  "inline-block shrink-0 rounded-[4px] px-[7px] py-[2px] align-middle text-[12px] leading-[1.5] font-extrabold"

export function chipStyle(tone: ChipTone): React.CSSProperties {
  if (tone === "ink") return { background: "var(--wc-ink)", color: "var(--wc-card)" }
  if (tone === "wine")
    return { color: "var(--wc-burgundy)", boxShadow: "inset 0 0 0 1px var(--wc-burgundy)" }
  if (tone === "line")
    return { color: "var(--wc-mute-2)", boxShadow: "inset 0 0 0 1px var(--wc-line-2)" }
  return { background: "var(--wc-soft)", color: "var(--wc-mute)" }
}

export function tierChipStyle(tier: SagaTier): React.CSSProperties {
  return chipStyle(tier === "official" ? "ink" : tier === "tier1" ? "wine" : "line")
}

/** 경기·기사처럼 등급이 없는 사료 — 사다리 밖의 중립 칩 */
export const NEUTRAL_CHIP_STYLE = chipStyle("soft")

export function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  return (
    <span className={TIER_CHIP_BASE} style={chipStyle(tone)}>
      {children}
    </span>
  )
}

export function TierChip({ tier, label }: { tier: SagaTier; label?: string }) {
  return (
    <span className={TIER_CHIP_BASE} style={tierChipStyle(tier)}>
      {label ?? TIER_LABEL[tier]}
    </span>
  )
}
