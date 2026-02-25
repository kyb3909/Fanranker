"use client"

import { Card } from "@/components/ui/card"
import type { PredictionMatch } from "./betting-types"
import { sportColorFill, SPORT_ICONS } from "./betting-types"

const SPORT_HEADER_STYLES: Record<string, { bg: string; text: string }> = {
  축구: { bg: "bg-rose-50", text: "text-rose-700" },
  야구: { bg: "bg-blue-50", text: "text-blue-700" },
  농구: { bg: "bg-orange-50", text: "text-orange-700" },
  배구: { bg: "bg-purple-50", text: "text-purple-700" },
}

const DEFAULT_HEADER_STYLE = { bg: "bg-muted", text: "text-foreground" }

export interface PredictionSlipCardProps {
  sport: string
  date: string
  status: string // "win" | "lose" | "pending"
  matches: PredictionMatch[]
  stake: number
  totalOdds: number
  profit: number
}

/**
 * 각 그리드 셀의 시각 상태를 결정.
 * selectionKey: 이 셀이 대표하는 선택지 식별자 ("홈팀" | "원정팀" | "무" | "오버" | "언더")
 */
function getCellStyle(
  selectionKey: string,
  match: PredictionMatch,
  fillColor: { bg: string; text: string; border: string }
) {
  const isSelected = selectionKey === match.selection
  const isCorrectAnswer = match.correctAnswer === selectionKey
  const matchResult = match.result

  // pending: 선택된 셀만 스포츠 색상 하이라이트
  if (matchResult === "pending") {
    if (isSelected) {
      return {
        container: `${fillColor.bg} ${fillColor.border} border`,
        text: fillColor.text,
        icon: null as string | null,
      }
    }
    return { container: "bg-muted/50", text: "text-muted-foreground", icon: null as string | null }
  }

  // won: 내 선택 = 정답 → 초록 ✓
  if (matchResult === "win" && isSelected) {
    return { container: "border border-green-300 bg-green-50", text: "text-green-700", icon: "✓" }
  }

  // lost + 내 선택(오답) → 빨강 ✗
  if (matchResult === "lose" && isSelected) {
    return { container: "border border-red-300 bg-red-50", text: "text-red-600", icon: "✗" }
  }

  // lost + 정답 → 초록 테두리 ✓
  if (matchResult === "lose" && isCorrectAnswer) {
    return {
      container: "border border-green-300 bg-green-50/60",
      text: "text-green-700",
      icon: "✓",
    }
  }

  // 기본: 비선택, 비정답
  return { container: "bg-muted/50", text: "text-muted-foreground", icon: null as string | null }
}

function MatchResultBadge({ result }: { result: string }) {
  if (result === "win") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
        ✓ 적중
      </span>
    )
  }
  if (result === "lose") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
        ✗ 미적중
      </span>
    )
  }
  return (
    <span className="bg-muted text-muted-foreground inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium">
      결과 대기
    </span>
  )
}

/**
 * 그리드 셀 하나.
 * displayLabel: 화면에 표시할 텍스트 (팀명 또는 "무", "오버", "언더")
 * selectionKey: match.selection과 비교할 키 ("홈팀" | "원정팀" | "무" | "오버" | "언더")
 */
function OddsCell({
  displayLabel,
  selectionKey,
  odds,
  match,
  fillColor,
}: {
  displayLabel: string
  selectionKey: string
  odds: number
  match: PredictionMatch
  fillColor: { bg: string; text: string; border: string }
}) {
  const style = getCellStyle(selectionKey, match, fillColor)

  return (
    <div className={`rounded-lg p-2 text-center ${style.container}`}>
      <div className={`truncate text-xs ${style.text}`}>
        {style.icon && <span className="mr-0.5">{style.icon}</span>}
        {displayLabel}
      </div>
      {odds > 0 && <div className={`text-sm font-bold ${style.text}`}>{odds}</div>}
    </div>
  )
}

export function PredictionSlipCard({
  sport,
  date,
  status,
  matches,
  stake,
  totalOdds,
  profit,
}: PredictionSlipCardProps) {
  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      {/* 슬립 헤더 */}
      <div
        className={`flex items-center justify-between p-2 text-xs ${
          (SPORT_HEADER_STYLES[sport] || DEFAULT_HEADER_STYLE).bg
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`font-semibold ${(SPORT_HEADER_STYLES[sport] || DEFAULT_HEADER_STYLE).text}`}
          >
            {SPORT_ICONS[sport] || "🎯"} {sport}
          </span>
          <span className="text-muted-foreground">{date}</span>
        </div>
        <div
          className={`rounded px-2 py-0.5 text-xs font-semibold ${
            status === "win"
              ? "bg-green-100 text-green-700"
              : status === "lose"
                ? "bg-red-100 text-red-700"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {status === "win" ? "✓ 적중" : status === "lose" ? "✗ 미적중" : "대기중"}
        </div>
      </div>

      {/* 경기 목록 */}
      <div className="space-y-2 p-3">
        {matches.map((match, idx) => {
          const fillColor = sportColorFill[sport] || sportColorFill["축구"]
          const isOverUnder = match.selection === "오버" || match.selection === "언더"
          const hasDrawOdds = !isOverUnder && sport === "축구"

          return (
            <div key={idx} className="bg-card overflow-hidden rounded-lg border">
              {/* 리그 + 경기별 결과 배지 */}
              <div className="bg-muted text-muted-foreground flex items-center justify-between px-3 py-1.5 text-xs">
                <span>{match.league}</span>
                <MatchResultBadge result={match.result} />
              </div>

              {/* 선택지 그리드 */}
              {isOverUnder ? (
                <div className="grid grid-cols-2 gap-1 p-2">
                  <OddsCell
                    displayLabel="오버"
                    selectionKey="오버"
                    odds={match.odds}
                    match={match}
                    fillColor={fillColor}
                  />
                  <OddsCell
                    displayLabel="언더"
                    selectionKey="언더"
                    odds={match.odds}
                    match={match}
                    fillColor={fillColor}
                  />
                </div>
              ) : (
                <div className={`grid p-2 ${hasDrawOdds ? "grid-cols-3" : "grid-cols-2"} gap-1`}>
                  <OddsCell
                    displayLabel={match.home || "홈팀"}
                    selectionKey="홈팀"
                    odds={match.odds}
                    match={match}
                    fillColor={fillColor}
                  />
                  {hasDrawOdds && (
                    <OddsCell
                      displayLabel="무"
                      selectionKey="무"
                      odds={match.odds}
                      match={match}
                      fillColor={fillColor}
                    />
                  )}
                  <OddsCell
                    displayLabel={match.away || "원정팀"}
                    selectionKey="원정팀"
                    odds={match.odds}
                    match={match}
                    fillColor={fillColor}
                  />
                </div>
              )}

              {/* lost일 때: 내 선택 / 정답 텍스트 1줄씩 명시 */}
              {match.result === "lose" && match.correctAnswer && (
                <div className="border-t px-3 py-1.5 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="text-red-600">
                      <span className="text-muted-foreground">내 선택:</span> ✗ {match.selection}
                    </span>
                    <span className="text-green-700">
                      <span className="text-muted-foreground">정답:</span> ✓ {match.correctAnswer}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* 배팅금 / 배당 / 손익 요약 */}
        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <div className="text-muted-foreground text-xs">
            배팅금: {stake.toLocaleString()}볼 | 총배당: {totalOdds}배
          </div>
          <div
            className={`text-sm font-semibold ${
              status === "win"
                ? "text-green-600"
                : status === "lose"
                  ? "text-red-600"
                  : "text-muted-foreground"
            }`}
          >
            {status === "pending"
              ? "대기중"
              : `${profit > 0 ? "+" : ""}${profit.toLocaleString()}볼`}
          </div>
        </div>
      </div>
    </Card>
  )
}
