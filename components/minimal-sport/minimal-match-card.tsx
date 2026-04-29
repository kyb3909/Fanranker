"use client"

import type { GroupedMatch, SportsGame } from "@/components/betting/betting-types"

const SPORT_ICONS: Record<string, string> = {
  축구: "⚽",
  농구: "🏀",
  야구: "⚾",
  배구: "🏐",
}

interface BetOption {
  key: string
  label: string
  odds: number | null | undefined
}

interface BetGroup {
  groupKey: string
  label: string
  note?: string
  options: BetOption[]
}

/**
 * 게임 한 개를 핸드오프의 BetGroup 형태로 변환.
 * game_type 문자열 패턴 (기존 betting-match-card.tsx 분기 재사용):
 *  - "SUM"/"SSUM" → 홀짝 (합계)
 *  - "언더오버" 포함 → 오버/언더
 *  - "핸디캡" 포함 → 승/(무)/패 + 핸디캡 라벨
 *  - 기타 → 승/(무)/패 (농구는 무 없음)
 */
function gameToBetGroup(game: SportsGame, homeTeam: string, awayTeam: string): BetGroup {
  const isSUM = game.game_type === "SUM" || game.game_type === "SSUM"
  const isOverUnder = game.game_type.includes("언더오버")
  const isHandicap = game.game_type.includes("핸디캡")
  const isBasketball = game.sport === "농구"

  if (isSUM) {
    return {
      groupKey: game.id,
      label: "합계",
      options: [
        { key: "odd", label: "홀", odds: game.odd_odds },
        { key: "even", label: "짝", odds: game.even_odds },
      ],
    }
  }
  if (isOverUnder) {
    return {
      groupKey: game.id,
      label: "언오버",
      note:
        game.over_under_line !== null && game.over_under_line !== undefined
          ? `기준 ${game.over_under_line}`
          : undefined,
      options: [
        { key: "over", label: "오버", odds: game.over_odds },
        { key: "under", label: "언더", odds: game.under_odds },
      ],
    }
  }
  // 승무패 또는 핸디캡
  const baseOptions: BetOption[] = [
    { key: "home", label: homeTeam, odds: game.home_odds },
    ...(!isBasketball ? [{ key: "draw", label: "무", odds: game.draw_odds }] : []),
    { key: "away", label: awayTeam, odds: game.away_odds },
  ]
  return {
    groupKey: game.id,
    label: isHandicap ? "핸디캡" : isBasketball ? "승패" : "승무패",
    note:
      isHandicap && game.handicap !== null && game.handicap !== 0
        ? `${homeTeam.slice(0, 3)} ${game.handicap > 0 ? "+" : ""}${game.handicap}`
        : undefined,
    options: baseOptions,
  }
}

function MinimalBetButton({
  option,
  selected,
  onClick,
}: {
  option: BetOption
  selected: boolean
  onClick: () => void
}) {
  if (option.odds == null) {
    return (
      <button
        type="button"
        disabled
        className="flex h-12 cursor-not-allowed flex-col items-center justify-center gap-0.5 rounded-[10px] border opacity-40"
        style={{
          backgroundColor: "var(--ms-surface)",
          borderColor: "var(--ms-line)",
        }}
      >
        <span className="text-[12px]" style={{ color: "var(--ms-ink-3)" }}>
          {option.label}
        </span>
        <span
          className="font-archivo text-[14px] font-extrabold"
          style={{ color: "var(--ms-ink-3)" }}
        >
          —
        </span>
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-[10px] border transition-colors ${
        selected ? "" : "hover:border-[var(--ms-ink)]"
      }`}
      style={{
        backgroundColor: selected ? "var(--ms-ink)" : "var(--ms-surface)",
        borderColor: selected ? "var(--ms-ink)" : "var(--ms-line)",
      }}
    >
      <span
        className="text-[12px] font-semibold"
        style={{ color: selected ? "rgba(255,255,255,0.7)" : "var(--ms-ink-2)" }}
      >
        {option.label}
      </span>
      <span
        className="font-archivo text-[16px] font-extrabold tabular-nums"
        style={{ color: selected ? "#ffffff" : "var(--ms-ink)" }}
      >
        {option.odds.toFixed(2)}
      </span>
    </button>
  )
}

function MinimalBetGroupRow({
  group,
  selected,
  onPick,
}: {
  group: BetGroup
  selected: string | undefined
  onPick: (key: string) => void
}) {
  const optsClass = group.options.length === 3 ? "grid-cols-3" : "grid-cols-2"
  return (
    <div className="grid grid-cols-[90px_1fr] items-center gap-3">
      <div className="flex flex-col gap-1">
        <b className="text-[12px] font-extrabold" style={{ color: "var(--ms-ink)" }}>
          {group.label}
        </b>
        {group.note && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold"
            style={{
              backgroundColor: "var(--ms-brand-soft)",
              color: "var(--ms-brand)",
            }}
          >
            {group.note}
          </span>
        )}
      </div>
      <div className={`grid gap-2 ${optsClass}`}>
        {group.options.map((opt) => (
          <MinimalBetButton
            key={opt.key}
            option={opt}
            selected={selected === opt.key}
            onClick={() => onPick(opt.key)}
          />
        ))}
      </div>
    </div>
  )
}

export interface MinimalMatchCardPicks {
  [groupKey: string]: string
}

interface MinimalMatchCardProps {
  match: GroupedMatch
  picks: MinimalMatchCardPicks
  onPick: (groupKey: string, optionKey: string) => void
  hot?: boolean
}

/**
 * Minimal Sport MatchCard.
 *
 * Spec (핸드오프):
 * - card: surface, 1px line, 16px radius
 * - match-head: 14×20 padding, 1px line bottom, league icon + name + (HOT pill) + time
 * - match-teams: 22×20 padding, [44px badge + name] VS [name + 44px badge]
 * - bet-groups: 14×20 padding, 10px gap
 *   - bet-group: [90px label] [1fr options grid]
 *   - bet 버튼: 10×14 padding, 1px line, 16px Archivo odds
 *   - selected: ink 배경 + 흰 텍스트
 */
export function MinimalMatchCard({ match, picks, onPick, hot }: MinimalMatchCardProps) {
  const ico = SPORT_ICONS[match.sport] ?? "⚽"
  const dateObj = new Date(match.matchTime)
  const dateLabel = `${String(dateObj.getMonth() + 1).padStart(2, "0")}.${String(
    dateObj.getDate()
  ).padStart(2, "0")}`
  const timeLabel = dateObj
    .toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s/g, " ")

  const groups: BetGroup[] = match.games.map((g) =>
    gameToBetGroup(g, match.homeTeam, match.awayTeam)
  )

  return (
    <article
      className="overflow-hidden rounded-2xl border bg-[var(--ms-surface)]"
      style={{ borderColor: "var(--ms-line)" }}
    >
      {/* Match head */}
      <header
        className="flex items-center gap-2 px-5 py-3.5 text-[12px]"
        style={{
          color: "var(--ms-ink-3)",
          borderBottom: "1px solid var(--ms-line)",
          background: "linear-gradient(90deg, var(--ms-bg) 0%, var(--ms-surface) 100%)",
        }}
      >
        <span aria-hidden>{ico}</span>
        <span className="text-[13px] font-extrabold" style={{ color: "var(--ms-ink)" }}>
          {match.leagueCode}
        </span>
        {hot && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-extrabold text-white"
            style={{ backgroundColor: "var(--ms-ink)" }}
          >
            🔥 HOT
          </span>
        )}
        <span className="font-archivo ml-auto tabular-nums">
          {dateLabel}{" "}
          <b className="font-extrabold" style={{ color: "var(--ms-ink)" }}>
            {timeLabel}
          </b>
        </span>
      </header>

      {/* Teams */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-5 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-lg"
            style={{
              backgroundColor: "var(--ms-brand-soft)",
              borderColor: "var(--ms-line)",
            }}
            aria-hidden
          >
            {ico}
          </div>
          <div
            className="truncate text-[16px] leading-tight font-extrabold"
            style={{ color: "var(--ms-ink)", letterSpacing: "-0.02em" }}
          >
            {match.homeTeam}
          </div>
        </div>
        <div
          className="font-archivo text-[22px] font-extrabold"
          style={{ color: "var(--ms-ink-3)" }}
        >
          VS
        </div>
        <div className="flex min-w-0 flex-row-reverse items-center gap-3 justify-self-end">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-lg"
            style={{
              backgroundColor: "var(--ms-brand-soft)",
              borderColor: "var(--ms-line)",
            }}
            aria-hidden
          >
            {ico}
          </div>
          <div
            className="truncate text-right text-[16px] leading-tight font-extrabold"
            style={{ color: "var(--ms-ink)", letterSpacing: "-0.02em" }}
          >
            {match.awayTeam}
          </div>
        </div>
      </div>

      {/* Bet groups */}
      <div
        className="flex flex-col gap-3.5 px-5 py-3.5"
        style={{ borderTop: "1px solid var(--ms-line)" }}
      >
        {groups.length === 0 ? (
          <div className="py-2 text-center text-[12px]" style={{ color: "var(--ms-ink-3)" }}>
            배당 정보가 아직 없습니다.
          </div>
        ) : (
          groups.map((g) => (
            <MinimalBetGroupRow
              key={g.groupKey}
              group={g}
              selected={picks[g.groupKey]}
              onPick={(opt) => onPick(g.groupKey, opt)}
            />
          ))
        )}
      </div>
    </article>
  )
}
