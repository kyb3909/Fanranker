interface AdPlaceholderProps {
  variant: "banner" | "sidebar" | "inline"
}

/**
 * 시안 .ad-box 패턴 — paper 그라디언트 + 표준 광고 사이즈.
 * 너무 얇은 banner 가 다닥다닥 보이는 문제 → height 키워 prominent 배치.
 *
 * 표준 사이즈 (Google AdSense / Display Network):
 *  - banner   = Billboard 970x250 비율. lg max 720x250 으로 메인 col-span-6 fit.
 *  - sidebar  = Medium Rectangle 300x250 (가장 표준).
 *  - inline   = Mobile Banner 320x100 (모바일에서 잘 어울림).
 */
const VARIANT_CONFIG = {
  banner: {
    label: "광고",
    dimensions: "Billboard · 970×250",
    className: "w-full",
    style: { aspectRatio: "970 / 250", maxHeight: 250, minHeight: 160 } as const,
  },
  sidebar: {
    label: "광고",
    dimensions: "Medium Rectangle · 300×250",
    className: "w-full",
    style: { aspectRatio: "300 / 250", maxHeight: 250, minHeight: 220 } as const,
  },
  inline: {
    label: "광고",
    dimensions: "Mobile Banner · 320×100",
    className: "w-full",
    style: { aspectRatio: "320 / 100", maxHeight: 110, minHeight: 80 } as const,
  },
} as const

export function AdPlaceholder({ variant }: AdPlaceholderProps) {
  const config = VARIANT_CONFIG[variant]

  return (
    <div
      className={`${config.className} group relative flex flex-col items-center justify-center overflow-hidden rounded-xl`}
      style={{
        ...config.style,
        background: "#f7f6f3",
        border: "1px dashed var(--wc-line-2, #d8d3ca)",
        boxShadow: "var(--wc-shadow-1)",
      }}
    >
      {/* 데코 — 살짝의 그리드 패턴으로 미적 마감 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(var(--wc-line-2, #d8d3ca) 1px, transparent 1px), linear-gradient(90deg, var(--wc-line-2, #d8d3ca) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
      <div
        className="relative flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold tracking-[0.18em] uppercase"
        style={{
          color: "var(--wc-mute-2, #8B93A0)",
          background: "var(--wc-card, #ffffff)",
          boxShadow: "0 1px 2px rgba(26, 20, 22, 0.06)",
        }}
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--wc-gold, #ffd96b)" }}
        />
        {config.label}
      </div>
      <span
        className="relative mt-2 text-[11px] font-semibold tracking-wide"
        style={{ color: "var(--wc-mute-2, #8B93A0)" }}
      >
        {config.dimensions}
      </span>
    </div>
  )
}
