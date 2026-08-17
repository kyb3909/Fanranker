"use client"

/**
 * 포메이션 피치 — 선발 11명을 실제 배치대로 그린다 (2026-08-17, FotMob 참고).
 *
 * ## 왜 그릴 수 있나
 * soccerway 라인업의 STARTERS 배열이 **포지션 순서**다 (2026-08-16 실측: 아스널 4-2-3-1 이
 * 라야 → 화이트·모스케라·가브리엘·칼라피오리 → 기마랑이스·루이스스켈리 → 마두에케·
 * 외데고르·촐리스 → 하베르츠 순으로 옴). 포메이션 문자열("4-2-3-1")로 줄 수를 끊어
 * 순서대로 채우면 배치가 나온다 — 좌표 데이터 없이도 성립한다.
 *
 * ## 안전장치
 * 포메이션 숫자 합이 10(필드 플레이어)이 아니거나 선발이 11명이 아니면 **그리지 않는다**
 * (null 반환) — 호출부가 기존 목록으로 폴백한다. 틀린 배치는 없는 배치보다 나쁘다.
 */

interface PitchPlayer {
  label: string
  number: number | null
  goals?: number
  ownGoals?: number
  red?: boolean
  subOut?: string | null
}

/** "4-2-3-1" → [4,2,3,1] (GK 제외). 합이 10 이 아니면 null */
export function parseFormation(formation: string | null): number[] | null {
  if (!formation) return null
  const rows = formation.split(/[-–]/).map((n) => Number(n.trim()))
  if (rows.some((n) => !Number.isInteger(n) || n < 1 || n > 6)) return null
  if (rows.reduce((a, b) => a + b, 0) !== 10) return null
  return rows
}

/** 선발 11명 → [GK행, ...필드 행들] */
function toRows(starters: PitchPlayer[], formation: string | null): PitchPlayer[][] | null {
  const shape = parseFormation(formation)
  if (!shape || starters.length !== 11) return null
  const rows: PitchPlayer[][] = [[starters[0]]] // 0번 = 골키퍼
  let i = 1
  for (const n of shape) {
    rows.push(starters.slice(i, i + n))
    i += n
  }
  return rows
}

function PlayerDot({ p, invert }: { p: PitchPlayer; invert: boolean }) {
  const scored = (p.goals ?? 0) > 0 || (p.ownGoals ?? 0) > 0
  return (
    <div className="flex min-w-0 flex-col items-center gap-[3px]" style={{ width: 60 }}>
      <div className="relative">
        <span
          className="gn-num grid h-[26px] w-[26px] place-items-center rounded-full text-[11px] font-extrabold"
          style={{
            background: invert ? "var(--wc-card)" : "var(--wc-burgundy)",
            color: invert ? "var(--wc-burgundy)" : "#fff",
            border: invert ? "1.5px solid var(--wc-burgundy)" : "1.5px solid rgba(255,255,255,.5)",
          }}
        >
          {p.number ?? "·"}
        </span>
        {/* 득점·퇴장·교체아웃은 점 하나로 — 피치가 아이콘으로 뒤덮이면 배치가 안 읽힌다 */}
        {scored && (
          <span
            aria-label="득점"
            className="absolute -top-[2px] -right-[2px] h-[9px] w-[9px] rounded-full"
            style={{ background: "#f0c040", border: "1px solid rgba(0,0,0,.25)" }}
          />
        )}
        {p.red && (
          <span
            aria-label="퇴장"
            className="absolute -right-[3px] -bottom-[2px] rounded-[1px]"
            style={{ width: 7, height: 9, background: "#c2352f" }}
          />
        )}
        {p.subOut && (
          <span
            aria-label="교체 아웃"
            className="absolute -bottom-[2px] -left-[3px] text-[8px] leading-none font-bold"
            style={{ color: "#c2352f" }}
          >
            ▼
          </span>
        )}
      </div>
      <span
        className="w-full truncate text-center text-[10px] leading-tight font-bold"
        style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
        title={p.label}
      >
        {p.label}
      </span>
    </div>
  )
}

function HalfPitch({
  rows,
  invert,
  teamLabel,
  formation,
}: {
  rows: PitchPlayer[][]
  /** 원정팀은 위쪽에 뒤집어 그린다 (GK 가 맨 위) */
  invert: boolean
  teamLabel: string
  formation: string | null
}) {
  const ordered = invert ? rows : [...rows].reverse() // 홈은 공격이 위로 향하도록
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between px-2 pb-1">
        <span className="truncate text-[12px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
          {teamLabel}
        </span>
        {formation && (
          <span
            className="gn-num shrink-0 rounded-full px-1.5 py-[1px] text-[10px] font-bold"
            style={{ background: "var(--wc-wine-tint)", color: "var(--wc-burgundy)" }}
          >
            {formation}
          </span>
        )}
      </div>
      <div className="flex flex-col justify-around gap-3 py-3" style={{ minHeight: 210 }}>
        {ordered.map((row, i) => (
          <div key={i} className="flex items-start justify-evenly gap-1">
            {row.map((p, j) => (
              <PlayerDot key={j} p={p} invert={invert} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function FormationPitch({
  home,
  away,
}: {
  home: { teamLabel: string; formation: string | null; starters: PitchPlayer[] }
  away: { teamLabel: string; formation: string | null; starters: PitchPlayer[] }
}) {
  const homeRows = toRows(home.starters, home.formation)
  const awayRows = toRows(away.starters, away.formation)
  // 한쪽이라도 배치를 못 만들면 피치를 포기한다 (호출부가 목록으로 폴백)
  if (!homeRows || !awayRows) return null

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        // 잔디 스트라이프 — 이미지 없이 CSS 만으로 (번들 0)
        background:
          "repeating-linear-gradient(to bottom, var(--wc-pitch-a, #e8efe6) 0 34px, var(--wc-pitch-b, #e2ebe0) 34px 68px)",
        border: "1px solid var(--wc-line)",
      }}
    >
      <div className="flex flex-col">
        <HalfPitch rows={awayRows} invert teamLabel={away.teamLabel} formation={away.formation} />
        <div aria-hidden className="mx-4 h-px" style={{ background: "rgba(0,0,0,.14)" }} />
        <HalfPitch
          rows={homeRows}
          invert={false}
          teamLabel={home.teamLabel}
          formation={home.formation}
        />
      </div>
    </div>
  )
}
