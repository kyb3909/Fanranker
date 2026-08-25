"use client"

import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { RefreshCw } from "lucide-react"
import { BettingMatchCard } from "./betting-match-card"
import type { GroupedMatch, SelectedBet } from "@/types/betting"

/** SportsEvent JSON-LD for SEO rich snippets */
function SportsEventSchema({ match }: { match: GroupedMatch }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${match.homeTeam} vs ${match.awayTeam}`,
    description: `${match.leagueCode} ${match.sport} - ${match.homeTeam} vs ${match.awayTeam} 승부예측`,
    startDate: match.matchTime,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: match.venue || match.leagueCode,
    },
    homeTeam: { "@type": "SportsTeam", name: match.homeTeam },
    awayTeam: { "@type": "SportsTeam", name: match.awayTeam },
    competitor: [
      { "@type": "SportsTeam", name: match.homeTeam },
      { "@type": "SportsTeam", name: match.awayTeam },
    ],
    sport: match.sport,
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  )
}

interface BettingTabProps {
  lastUpdated: Date | null
  /** 가장 이른 예측 마감까지 카운트다운 (use-betting-matches 가 1초 갱신) */
  deadlineCountdown?: string | null
  isLoading: boolean
  error: string | null
  filteredMatches: GroupedMatch[]
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
  onRefresh: () => void
}

export function BettingTab({
  lastUpdated,
  deadlineCountdown,
  isLoading,
  error,
  filteredMatches,
  selectedBets,
  selectedSport,
  onBetSelection,
  onRefresh,
}: BettingTabProps) {
  return (
    // 카드 사이 간격 8 → 10px: 카드 내부 인셋(14px)에 비해 붙어 있어 목록이 한 덩어리로 읽혔다
    <div className="space-y-2.5">
      {/* Today's matches header + deadline countdown */}

      {/* Loading/Error/Refresh status */}
      <div
        className="mb-2 flex items-center justify-between text-sm"
        style={{ color: "var(--wc-mute)" }}
      >
        <div className="flex items-center gap-2">
          {/* 마감 카운트다운 (2026-07-30 워룸) — 훅이 1초마다 계산해오던 값의 첫 소비처.
              MLB 처럼 킥오프가 새벽이어도 마감은 전날 23:00(데일리 플립)이라, 이 신호가
              없으면 유저가 마감을 놓친다. */}
          {deadlineCountdown && deadlineCountdown !== "마감됨" && (
            <span
              className="inline-flex items-center rounded-md px-2 py-[3px] text-[12px] font-bold"
              style={{
                background: "color-mix(in srgb, var(--wc-burgundy) 8%, transparent)",
                color: "var(--wc-burgundy)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              가장 빠른 마감 {deadlineCountdown} 전
            </span>
          )}
          {lastUpdated && (
            <span style={{ fontSize: 12, letterSpacing: "0.04em" }}>
              {/* ⚠️ 초는 빼고 시·분만 (2026-08-25). 종전엔 "오후 2:31:19" 처럼 초까지
                  찍었는데, 유저가 초 단위를 알아야 할 이유가 없고 데이터는 30초 주기라
                  숫자만 요란했다. 갱신 시각의 용도는 "얼마나 최신인가" 감각이지 시계가 아니다. */}
              업데이트 ·{" "}
              {lastUpdated.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[12px] font-bold transition-colors disabled:opacity-50"
          style={{
            background: "var(--wc-soft)",
            color: "var(--wc-burgundy)",
          }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>

      {/* Loading skeleton */}
      {isLoading && filteredMatches.length === 0 && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card
              key={i}
              className="overflow-hidden border-0"
              style={{ boxShadow: "var(--wc-shadow-1)", borderRadius: 8 }}
            >
              <div
                className="flex items-center justify-between px-3 py-1.5"
                style={{ background: "var(--wc-soft)" }}
              >
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="px-2 pb-1">
                <div className="flex items-center justify-center gap-2 py-1">
                  <Skeleton className="h-4 w-20" />
                  <span className="text-xs" style={{ color: "var(--wc-mute-2)" }}>
                    vs
                  </span>
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
              <div className="space-y-1.5 px-2 pb-2">
                <div
                  className="rounded-lg p-1.5"
                  style={{
                    background: "var(--wc-soft)",
                    border: "1px solid var(--wc-line)",
                  }}
                >
                  <Skeleton className="mb-1 h-4 w-12" />
                  <div className="grid grid-cols-3 gap-1">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <Skeleton key={j} className="h-12 rounded-md" />
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          className="flex flex-col items-center justify-center py-8"
          style={{ color: "var(--wc-down)" }}
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={onRefresh}
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-[13px] font-semibold transition-colors"
            style={{
              background: "var(--wc-burgundy)",
              color: "white",
            }}
          >
            다시 시도
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && filteredMatches.length === 0 && (
        <div
          className="flex flex-col items-center justify-center py-12"
          style={{ color: "var(--wc-mute)" }}
        >
          <p>예측 가능한 경기가 없습니다.</p>
        </div>
      )}

      {/* Match cards with SportsEvent schema */}
      {filteredMatches.map((groupedMatch) => (
        <div key={groupedMatch.matchKey}>
          <SportsEventSchema match={groupedMatch} />
          <BettingMatchCard
            groupedMatch={groupedMatch}
            selectedBets={selectedBets}
            selectedSport={selectedSport}
            onBetSelection={onBetSelection}
          />
        </div>
      ))}
    </div>
  )
}
