"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { ChevronDown, Lock } from "lucide-react"
import type { PredictionMatch } from "@/types/betting"
import { sportColorFill } from "@/types/betting"
import { BoardIcon } from "@/components/sidebar/board-icon"

const SPORT_HEADER_STYLES: Record<string, { bg: string; text: string }> = {
  축구: { bg: "bg-rose-50", text: "text-rose-700" },
  야구: { bg: "bg-blue-50", text: "text-blue-700" },
  농구: { bg: "bg-orange-50", text: "text-orange-700" },
  배구: { bg: "bg-purple-50", text: "text-purple-700" },
}

const DEFAULT_HEADER_STYLE = { bg: "bg-muted", text: "text-foreground" }

interface PredictionSlipCardProps {
  sport: string
  date: string
  status: string // "win" | "lose" | "pending"
  matches: PredictionMatch[]
  stake: number
  totalOdds: number
  profit: number
  /** true면 잠금 상태 — 상세 데이터 렌더링 안함 */
  locked?: boolean
  /** locked 상태에서 표시할 경기 수 (matches가 비어있을 때) */
  matchCount?: number
  /** locked 상태 확장 시 표시할 커스텀 콘텐츠 (e.g. 구매 버튼) */
  lockedContent?: React.ReactNode
}

// ─── 내부 헬퍼 ────────────────────────────────────────────

function getCellStyle(
  selectionKey: string,
  match: PredictionMatch,
  fillColor: { bg: string; text: string; border: string }
) {
  const isSelected = selectionKey === match.selection
  const isCorrectAnswer = match.correctAnswer === selectionKey
  const matchResult = match.result

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

  // 적중한 내 선택: primary 배경 + 흰 글씨
  if (matchResult === "win" && isSelected) {
    return {
      container: "bg-primary text-primary-foreground",
      text: "text-primary-foreground",
      icon: "✓",
    }
  }

  // 미적중한 내 선택: 연한 배경 + 흐린 텍스트
  if (matchResult === "lose" && isSelected) {
    return {
      container: "bg-muted/60 border border-border",
      text: "text-muted-foreground",
      icon: "✗",
    }
  }

  // 정답 (내가 안 골랐지만 이게 정답): primary 테두리
  if (matchResult === "lose" && isCorrectAnswer) {
    return {
      container: "border-2 border-primary/40 bg-primary/5",
      text: "text-primary",
      icon: "✓",
    }
  }

  // 나머지 (선택도 아니고 정답도 아님)
  return { container: "bg-muted/20", text: "text-muted-foreground/50", icon: null as string | null }
}

function MatchResultBadge({ result }: { result: string }) {
  if (result === "win") {
    return (
      <span className="bg-primary text-primary-foreground inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold">
        ✓ 적중
      </span>
    )
  }
  if (result === "lose") {
    return (
      <span className="bg-muted text-muted-foreground inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold">
        ✗ 미적중
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
      결과 대기
    </span>
  )
}

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
    <div className={`odds-btn rounded-lg px-2 py-2.5 text-center ${style.container}`}>
      <div className={`truncate text-xs ${style.text}`}>
        {style.icon && <span className="mr-0.5">{style.icon}</span>}
        {displayLabel}
      </div>
      {odds > 0 && (
        <div className={`font-[family-name:var(--font-display)] text-sm font-bold ${style.text}`}>
          {odds}
        </div>
      )}
    </div>
  )
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────

export function PredictionSlipCard({
  sport,
  date,
  status,
  matches,
  stake,
  totalOdds,
  profit,
  locked = false,
  matchCount,
  lockedContent,
}: PredictionSlipCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const headerStyle = SPORT_HEADER_STYLES[sport] || DEFAULT_HEADER_STYLE
  const displayMatchCount = matchCount ?? matches.length

  return (
    <Card
      className="overflow-hidden border-0"
      style={{
        background: "var(--wc-card, #ffffff)",
        boxShadow: "var(--wc-shadow-1)",
      }}
    >
      {/* ───── 클릭 가능한 헤더 (항상 표시) ───── */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className={`flex w-full items-center justify-between p-2 text-xs ${headerStyle.bg} transition-colors hover:brightness-95`}
      >
        <div className="flex items-center gap-2">
          {locked && <Lock className="text-muted-foreground h-3 w-3" />}
          <span className={`font-semibold ${headerStyle.text}`}>
            <BoardIcon slug={sport} className="mr-1 inline-block h-3 w-3 align-[-2px]" />
            {sport}
          </span>
          {date && <span className="text-muted-foreground">{date}</span>}
          <span className="text-muted-foreground">{displayMatchCount}경기</span>
        </div>
        <div className="flex items-center gap-1.5">
          {locked ? (
            <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-medium">
              잠금
            </span>
          ) : (
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                status === "win"
                  ? "bg-primary text-primary-foreground"
                  : status === "lose"
                    ? "bg-muted text-muted-foreground"
                    : "bg-amber-50 text-amber-600"
              }`}
            >
              {status === "win" ? "✓ 적중" : status === "lose" ? "✗ 미적중" : "대기중"}
            </span>
          )}
          <ChevronDown
            className={`text-muted-foreground h-3.5 w-3.5 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {/* ───── 확장 영역 ───── */}
      {isExpanded &&
        (locked ? (
          /* ── locked: 민감 데이터 렌더링 안함 ── */
          <div className="px-4 py-5 text-center">
            <Lock className="text-muted-foreground mx-auto mb-2 h-6 w-6" />
            <p className="text-muted-foreground text-sm font-medium">구매 후 확인 가능</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              배점, 선택지 등 상세 정보는 열람 후 확인할 수 있습니다.
            </p>
            {lockedContent && <div className="mt-3">{lockedContent}</div>}
          </div>
        ) : (
          /* ── expanded: 전체 상세 ── */
          <div className="space-y-2 p-3">
            {matches.map((match, idx) => {
              const fillColor = sportColorFill[sport] || sportColorFill["축구"]
              const isOverUnder = match.selection === "오버" || match.selection === "언더"
              const hasDrawOdds = !isOverUnder && sport === "축구"

              return (
                <div key={idx} className="bg-card overflow-hidden rounded-lg border">
                  <div className="bg-muted text-muted-foreground flex items-center justify-between px-3 py-1.5 text-xs">
                    <span>{match.league}</span>
                    <MatchResultBadge result={match.result} />
                  </div>

                  {isOverUnder ? (
                    <div className="grid grid-cols-2 gap-1 p-2">
                      <OddsCell
                        displayLabel="오버"
                        selectionKey="오버"
                        odds={match.overOdds ?? match.odds}
                        match={match}
                        fillColor={fillColor}
                      />
                      <OddsCell
                        displayLabel="언더"
                        selectionKey="언더"
                        odds={match.underOdds ?? match.odds}
                        match={match}
                        fillColor={fillColor}
                      />
                    </div>
                  ) : (
                    <div
                      className={`grid p-2 ${hasDrawOdds ? "grid-cols-3" : "grid-cols-2"} gap-1`}
                    >
                      <OddsCell
                        displayLabel={match.home || "홈팀"}
                        selectionKey="홈팀"
                        odds={match.homeOdds ?? match.odds}
                        match={match}
                        fillColor={fillColor}
                      />
                      {hasDrawOdds && (
                        <OddsCell
                          displayLabel="무"
                          selectionKey="무"
                          odds={match.drawOdds ?? match.odds}
                          match={match}
                          fillColor={fillColor}
                        />
                      )}
                      <OddsCell
                        displayLabel={match.away || "원정팀"}
                        selectionKey="원정팀"
                        odds={match.awayOdds ?? match.odds}
                        match={match}
                        fillColor={fillColor}
                      />
                    </div>
                  )}

                  {match.result === "lose" && match.correctAnswer && (
                    <div className="border-t px-3 py-1.5 text-xs">
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          <span className="text-muted-foreground">내 선택:</span> ✗{" "}
                          {match.selection}
                        </span>
                        <span className="text-primary">
                          <span className="text-muted-foreground">정답:</span> ✓{" "}
                          {match.correctAnswer}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <div className="text-muted-foreground text-xs">
                사용 볼: {stake.toLocaleString()}볼 | 총배점: {totalOdds}배
              </div>
              <div
                className={`text-sm font-semibold ${
                  status === "win"
                    ? "text-primary"
                    : status === "lose"
                      ? "text-muted-foreground"
                      : "text-muted-foreground"
                }`}
              >
                {status === "pending"
                  ? "대기중"
                  : `${profit > 0 ? "+" : ""}${profit.toLocaleString()}볼`}
              </div>
            </div>
          </div>
        ))}
    </Card>
  )
}
