"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react"
import type { GroupedMatch, SelectedBet, SportsGame } from "./betting-types"
import {
  sportColors,
  sportColorFill,
  SPORT_ICONS,
  getGameTypeLabel,
  formatMatchTime,
} from "./betting-types"

interface BettingMatchCardProps {
  groupedMatch: GroupedMatch
  selectedBets: SelectedBet[]
  selectedSport: string | null
  onBetSelection: (
    gameId: string,
    matchKey: string,
    selection: string,
    sport: string,
    gameType: string,
    handicap: number | null,
    overUnderLine: number | null,
    odds?: number
  ) => void
}

export function BettingMatchCard({
  groupedMatch,
  selectedBets,
  selectedSport,
  onBetSelection,
}: BettingMatchCardProps) {
  const fillColor = sportColorFill[groupedMatch.sport] || sportColorFill["축구"]
  const headerColor = sportColors[groupedMatch.sport] || sportColors["축구"]
  const hasSelectionFromThisMatch = selectedBets.some((b) => b.matchKey === groupedMatch.matchKey)

  // 메인(승무패/승패) vs 나머지(핸디캡·언오버·합계). 메인은 항상 보이고 나머지는 토글.
  // 신 매핑(2026-05): 승패2way/승1패/승5패 도 메인 마켓 (1차 옵션).
  const isMainType = (gameType: string) =>
    gameType === "일반" ||
    gameType === "S일반" ||
    gameType === "승패2way" ||
    gameType === "승1패" ||
    gameType === "승5패"

  // 배당이 비어있는 row 제외 — betman 측 마켓 미오픈/배당 미수신 케이스.
  // sync.sh 가 odds=0 row 도 저장하므로 UI 레벨에서 가드. row 제거 + 모든 row 가
  // 비면 카드 자체 hide 해서 사용자가 클릭해도 진입 불가능하게.
  const hasAnyOdds = (g: SportsGame) => {
    if (g.game_type === "SUM" || g.game_type === "SSUM") {
      return (Number(g.odd_odds) || 0) > 0 || (Number(g.even_odds) || 0) > 0
    }
    if (g.game_type.includes("언더오버")) {
      return (Number(g.over_odds) || 0) > 0 || (Number(g.under_odds) || 0) > 0
    }
    return (Number(g.home_odds) || 0) > 0 || (Number(g.away_odds) || 0) > 0
  }
  const visibleGames = groupedMatch.games.filter(hasAnyOdds)
  const mainGames = visibleGames.filter((g) => isMainType(g.game_type))
  const otherGames = visibleGames.filter((g) => !isMainType(g.game_type))

  // 다른 옵션 영역에 이미 선택된 베팅이 있다면 펼친 상태로 시작 (예: 페이지 재방문).
  const [expanded, setExpanded] = useState(() =>
    selectedBets.some((b) => otherGames.some((g) => g.id === b.gameId))
  )

  const otherLabels = Array.from(
    new Set(
      otherGames.map((g) =>
        getGameTypeLabel(g.game_type, g.sport, g.draw_odds != null && Number(g.draw_odds) > 0)
      )
    )
  ).join("·")

  const renderGameBlock = (game: SportsGame) => {
    const isSUM = game.game_type === "SUM" || game.game_type === "SSUM"
    const isOverUnder = game.game_type.includes("언더오버")
    // 3-way 여부는 draw_odds 존재로 판별 (sport 만으로는 신 매핑 KBO 승무패 못 잡음).
    // 옛 매핑 sport=농구 → 무승부 X, 신 매핑 betTypId=2/5 → game_type 자체에 무승부 X.
    const has3Way =
      game.draw_odds !== null && game.draw_odds !== undefined && Number(game.draw_odds) > 0
    const baseLabel = getGameTypeLabel(game.game_type, game.sport, has3Way)
    // is_half_time 마킹은 route.ts 에서 매치 그룹 내 dedup 휴리스틱으로 부착.
    // raw type 에 이미 S prefix 가 있으면 baseLabel 에 "· 전반" 이 들어있어 중복 회피.
    const gameTypeLabel =
      game.is_half_time && !baseLabel.includes("· 전반") ? `${baseLabel} · 전반` : baseLabel
    const selectedBet = selectedBets.find((b) => b.gameId === game.id)
    const sportMismatch = selectedSport !== null && selectedSport !== game.sport
    const gameBetClosed = game.is_bettable === false
    const isDisabled = sportMismatch || (hasSelectionFromThisMatch && !selectedBet) || gameBetClosed

    let options: Array<{ value: string; label: string; odds?: number }>
    if (isSUM) {
      options = [
        { value: "odd", label: "홀", odds: game.odd_odds },
        { value: "even", label: "짝", odds: game.even_odds },
      ]
    } else if (isOverUnder) {
      options = [
        { value: "over", label: "오버", odds: game.over_odds },
        { value: "under", label: "언더", odds: game.under_odds },
      ]
    } else {
      options = [
        { value: "home", label: groupedMatch.homeTeam, odds: game.home_odds },
        ...(has3Way ? [{ value: "draw", label: "무", odds: game.draw_odds }] : []),
        { value: "away", label: groupedMatch.awayTeam, odds: game.away_odds },
      ]
    }

    const isTwoColumn = isSUM || isOverUnder || !has3Way

    // 옵션별 배당 누락 시 해당 버튼만 disable — row 단위 hasAnyOdds 통과해도
    // 일부 옵션(예: 3-way 의 무 odds 만 누락)이 비어있을 수 있는 방어.
    const optionUnavailable = (oddsVal?: number) => !oddsVal || Number(oddsVal) <= 0

    return (
      <div key={game.id} className="bg-muted/50 rounded-lg border p-2">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-medium">
              {gameTypeLabel}
            </Badge>
            {/* Handicap badge */}
            {game.game_type.includes("핸디캡") &&
              (game.handicap !== null && game.handicap !== 0 ? (
                <Badge
                  variant="outline"
                  className="border-primary/40 bg-primary/15 text-primary px-1.5 py-0 text-[11px] font-medium"
                >
                  {groupedMatch.homeTeam.slice(0, 3)} {game.handicap > 0 ? "+" : ""}
                  {game.handicap}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-muted text-muted-foreground border-border px-1.5 py-0 text-[11px]"
                >
                  핸디캡 정보 없음
                </Badge>
              ))}
            {/* Over/Under line badge */}
            {game.game_type.includes("언더오버") &&
              (game.over_under_line !== null && game.over_under_line !== undefined ? (
                <Badge
                  variant="outline"
                  className="border-purple-300 bg-purple-100 px-1.5 py-0 text-[11px] font-medium text-purple-800"
                >
                  기준 {game.over_under_line}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-muted text-muted-foreground border-border px-1.5 py-0 text-[11px]"
                >
                  기준선 정보 없음
                </Badge>
              ))}
          </div>
          {gameBetClosed && <span className="text-primary text-xs font-medium">마감</span>}
          {sportMismatch && !gameBetClosed && (
            <span className="text-xs text-orange-500">다른 종목</span>
          )}
        </div>
        <div className={`grid gap-1.5 ${isTwoColumn ? "grid-cols-2" : "grid-cols-3"}`}>
          {options.map((opt) => {
            const optDisabled = isDisabled || optionUnavailable(opt.odds)
            return (
              <button
                key={opt.value}
                className={`odds-btn rounded-md px-2 py-2.5 text-center transition-all ${
                  selectedBet?.selection === opt.value
                    ? `${fillColor.bg} ${fillColor.text} border ${fillColor.border}`
                    : "bg-card hover:bg-accent border"
                } ${optDisabled ? "cursor-not-allowed opacity-50" : ""}`}
                onClick={() =>
                  !optDisabled &&
                  onBetSelection(
                    game.id,
                    groupedMatch.matchKey,
                    opt.value,
                    game.sport,
                    game.game_type,
                    game.handicap,
                    game.over_under_line,
                    opt.odds
                  )
                }
                disabled={optDisabled}
                aria-label={`${opt.label} 선택, 배점 ${opt.odds ? opt.odds.toFixed(2) : "없음"}`}
                aria-pressed={selectedBet?.selection === opt.value}
              >
                <div className="text-foreground/85 truncate text-sm">{opt.label}</div>
                <div
                  className={`font-[family-name:var(--font-display)] text-base font-bold ${selectedBet?.selection === opt.value ? "" : "text-foreground"}`}
                >
                  {opt.odds ? opt.odds.toFixed(2) : "-"}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // 모든 row 가 odds 없으면 카드 자체 hide — 사용자에게 진입 불가능한 카드 노출 X.
  if (visibleGames.length === 0) return null

  return (
    <Card
      className={`overflow-hidden border-0 shadow-sm ${hasSelectionFromThisMatch ? "ring-primary ring-2" : ""}`}
    >
      {/* Match Header — 종목별 파스텔 그라데이션 (축구 emerald · 야구 blue · 농구 orange · 배구 purple) */}
      <div
        className={`${headerColor.bg} ${headerColor.text} flex items-center justify-between px-3 py-2`}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-base">{SPORT_ICONS[groupedMatch.sport] || "⚽"}</span>
          <span className="text-sm font-semibold">{groupedMatch.leagueCode}</span>
        </div>
        <div className="flex items-center gap-1 text-sm opacity-90">
          <Clock className="h-3.5 w-3.5" />
          <span>{formatMatchTime(groupedMatch.matchTime)}</span>
        </div>
      </div>

      {/* Teams */}
      <div className="px-2 pb-1.5">
        <div className="flex items-center justify-center gap-2 py-1.5 sm:gap-3">
          <span className="max-w-[40%] min-w-0 truncate text-base font-bold">
            {groupedMatch.homeTeam}
          </span>
          <span className="text-foreground/80 shrink-0 text-sm">vs</span>
          <span className="max-w-[40%] min-w-0 truncate text-base font-bold">
            {groupedMatch.awayTeam}
          </span>
        </div>
      </div>

      {/* Game Types — 메인(승무패)는 항상 표시, 나머지는 토글로 펼침.
          펼친 상태에선 접기 버튼이 추가 옵션 아래(맨 끝)로 이동.
          승무패 데이터 누락 시엔 전체를 인라인으로 보여 토글만 외로이 떠있는 상황 방지. */}
      <div className="space-y-2 px-2 pb-2">
        {mainGames.length > 0 ? mainGames.map(renderGameBlock) : otherGames.map(renderGameBlock)}

        {mainGames.length > 0 &&
          otherGames.length > 0 &&
          (expanded ? (
            <>
              {otherGames.map(renderGameBlock)}
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-expanded={true}
                className="text-muted-foreground hover:text-foreground hover:bg-muted/40 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-colors sm:min-h-0"
              >
                옵션 접기
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-expanded={false}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/40 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-colors sm:min-h-0"
            >
              다른 옵션 보기 ({otherLabels}) +{otherGames.length}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          ))}
      </div>

      {/* Selection Status */}
      {hasSelectionFromThisMatch && (
        <div className="px-2 pb-2">
          <div className="flex items-center justify-center gap-1.5 rounded bg-emerald-50 py-1.5 text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">선택됨</span>
          </div>
        </div>
      )}
    </Card>
  )
}
