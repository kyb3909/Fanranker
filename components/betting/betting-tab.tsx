"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { RefreshCw, Calendar, Clock } from "lucide-react"
import { BettingMatchCard } from "./betting-match-card"
import type { TodayInfo, GroupedMatch, SelectedBet } from "./betting-types"

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
  todayInfo: TodayInfo | null
  deadlineCountdown: string | null
  lastUpdated: Date | null
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
  todayInfo,
  deadlineCountdown,
  lastUpdated,
  isLoading,
  error,
  filteredMatches,
  selectedBets,
  selectedSport,
  onBetSelection,
  onRefresh,
}: BettingTabProps) {
  return (
    <div className="space-y-2">
      {/* Today's matches header + deadline countdown */}
      <Card className="bg-accent/5 border-accent/30 border px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="bg-accent/10 shrink-0 rounded-full p-1.5">
              <Calendar className="text-accent h-4 w-4" />
            </div>
            <span className="text-accent text-[14px] font-semibold">오늘의 경기</span>
            {todayInfo && (
              <span className="text-muted-foreground text-[12px]">({todayInfo.label})</span>
            )}
          </div>
          {deadlineCountdown && deadlineCountdown !== "마감됨" && (
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-orange-600">
              <Clock className="h-3.5 w-3.5" />
              <span>다음 마감 {deadlineCountdown}</span>
            </div>
          )}
          {deadlineCountdown === "마감됨" && (
            <span className="text-[12px] font-medium text-red-500">베팅 마감</span>
          )}
        </div>
      </Card>

      {/* Loading/Error/Refresh status */}
      <div className="text-muted-foreground mb-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {lastUpdated && <span>마지막 업데이트: {lastUpdated.toLocaleTimeString("ko-KR")}</span>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="h-7 px-2"
        >
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      {/* Loading skeleton */}
      {isLoading && filteredMatches.length === 0 && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="overflow-hidden border-0 shadow-sm">
              <div className="bg-accent/30 flex items-center justify-between px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="px-2 pb-1">
                <div className="flex items-center justify-center gap-2 py-1">
                  <Skeleton className="h-4 w-20" />
                  <span className="text-muted-foreground text-xs">vs</span>
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
              <div className="space-y-1.5 px-2 pb-2">
                <div className="bg-muted/50 rounded-lg border p-1.5">
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
        <div className="text-destructive flex flex-col items-center justify-center py-8">
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={onRefresh} className="mt-2">
            다시 시도
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && filteredMatches.length === 0 && (
        <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
          <p>베팅 가능한 경기가 없습니다.</p>
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
