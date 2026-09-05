"use client"

interface PitchPlayer {
  label: string
  number: number | null
  goals?: number
  ownGoals?: number
  red?: boolean
  subOut?: string | null
}

/** LFA 선발 순서(GK → 수비 → 공격)를 포메이션 행으로 표시한다. */
export function parseFormation(formation: string | null): number[] | null {
  if (!formation) return null
  const rows = formation.split(/[-–]/).map((n) => Number(n.trim()))
  if (rows.some((n) => !Number.isInteger(n) || n < 1 || n > 6)) return null
  return rows.reduce((a, b) => a + b, 0) === 10 ? rows : null
}

interface PitchSide {
  teamLabel: string
  formation: string | null
  starters: PitchPlayer[]
}

export function canShowFormation(side: PitchSide): boolean {
  return side.starters.length === 11 && parseFormation(side.formation) !== null
}

function TeamPitch({ side, away }: { side: PitchSide; away: boolean }) {
  const shape = parseFormation(side.formation)!
  let offset = 1
  const rows = [
    [side.starters[0]],
    ...shape.map((count) => {
      const row = side.starters.slice(offset, offset + count)
      offset += count
      return row
    }),
  ].reverse()
  return (
    <section
      aria-label={side.teamLabel + " 포메이션"}
      className="min-w-0 overflow-hidden rounded-xl border border-[var(--wc-line)]"
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ background: "var(--wc-card)" }}
      >
        <div className="min-w-0">
          <p className="text-[12px]" style={{ color: "var(--wc-mute)" }}>
            {away ? "AWAY" : "HOME"}
          </p>
          <h3 className="text-[14px] font-bold" style={{ color: "var(--wc-ink)" }}>
            {side.teamLabel}
          </h3>
        </div>
        <span
          className="gn-num shrink-0 rounded-full px-3 py-1 text-[13px] font-bold"
          style={{ background: "var(--wc-soft)", color: "var(--wc-ink)" }}
        >
          {side.formation}
        </span>
      </div>
      <div
        className="relative overflow-hidden px-2 py-5"
        style={{ background: "color-mix(in srgb, var(--wc-go) 9%, var(--wc-card))" }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 320 400"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-3 h-[calc(100%-24px)] w-[calc(100%-24px)]"
          fill="none"
          stroke="var(--wc-go)"
          strokeWidth="1"
          opacity="0.2"
        >
          <rect x="1" y="1" width="318" height="398" rx="2" />
          <path d="M1 200H319 M80 1V65H240V1 M120 1V25H200V1 M80 399V335H240V399 M120 399V375H200V399" />
          <circle cx="160" cy="200" r="42" />
          <circle cx="160" cy="200" r="2" fill="var(--wc-go)" />
        </svg>
        <div className="relative flex min-h-[360px] flex-col justify-between gap-5">
          {rows.map((row, i) => (
            <div key={i} className="flex items-start justify-evenly gap-1">
              {row.map((p, j) => (
                <div
                  key={j}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
                  style={{ maxWidth: 88 }}
                >
                  <div className="relative">
                    <span
                      className="gn-num grid size-8 place-items-center rounded-full border border-[var(--wc-burgundy)] text-[12px] font-extrabold shadow-sm"
                      style={{
                        background: away ? "var(--wc-card)" : "var(--wc-burgundy)",
                        color: away ? "var(--wc-burgundy)" : "var(--wc-card)",
                      }}
                    >
                      {p.number ?? "·"}
                    </span>
                    {((p.goals ?? 0) > 0 || (p.ownGoals ?? 0) > 0) && (
                      <span
                        role="img"
                        aria-label={(p.goals ?? 0) > 0 ? "득점" : "자책골"}
                        className="absolute -top-1 -right-2 rounded-full px-0.5 text-[12px]"
                        style={{ background: "var(--wc-card)", color: "var(--wc-ink)" }}
                      >
                        ⚽
                      </span>
                    )}
                    {p.red && (
                      <span
                        role="img"
                        aria-label="퇴장"
                        className="absolute -right-1 -bottom-1 h-3 w-2 rounded-sm"
                        style={{ background: "var(--wc-down)" }}
                      />
                    )}
                    {p.subOut && (
                      <span
                        role="img"
                        aria-label="교체 아웃"
                        className="absolute -bottom-1 -left-2 text-[12px]"
                        style={{ color: "var(--wc-down)" }}
                      >
                        ▼
                      </span>
                    )}
                  </div>
                  <span
                    className="line-clamp-2 w-full text-center text-[12px] leading-4 font-semibold break-words"
                    style={{ color: "var(--wc-ink)" }}
                    title={p.label}
                  >
                    {p.label}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function FormationPitch({
  home,
  away,
  activeSide = 0,
}: {
  home: PitchSide
  away: PitchSide
  activeSide?: number
}) {
  if (!canShowFormation(home) || !canShowFormation(away)) return null
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[home, away].map((side, i) => (
        <div key={i} className={activeSide === i ? "min-w-0" : "hidden min-w-0 sm:block"}>
          <TeamPitch side={side} away={i === 1} />
        </div>
      ))}
    </div>
  )
}
