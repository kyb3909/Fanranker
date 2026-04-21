"use client"

import { useMemo, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Lock, TrendingUp, Target, Flame, Loader2, ChevronDown, ChevronUp } from "lucide-react"
import { formatRelativeTime } from "@/lib/utils/date"
import type { PredictionMatch } from "@/components/betting/betting-types"

interface PredictionGame {
  home_team_name: string
  away_team_name: string
  match_time: string
  game_type: string
  sport: string
  result: string | null
}

interface Prediction {
  id: string
  game_id: string
  prediction: string
  status: string
  game: PredictionGame
}

interface SlipGroup {
  slipId: string
  sport: string
  date: string
  status: string
  matchCount: number
  // 항상 공개 (locked/unlocked 공통)
  analysisTitle: string | null
  totalOddsRange: string
  // Unlocked에서만 유의미한 값 (locked일 때 0/null/[])
  stake: number
  totalOdds: number
  profit: number
  matches: PredictionMatch[]
  analysisText: string | null
}

interface ActivityData {
  id: string
  user_id: string
  round_id: string
  sport: string
  prediction_count: number
  created_at: string
  profile: {
    nickname: string
    avatar_url: string | null
  }
  stats: {
    accuracy: number
    net_profit: number
    current_streak: number
  } | null
  round: {
    year: number
    round: number
    status: string
  } | null
  is_purchased: boolean
  is_free?: boolean
  predictions: Prediction[] | null
  slipGroups?: SlipGroup[] | null
}

const SPORT_LABELS: Record<string, string> = {
  축구: "축구",
  야구: "야구",
  농구: "농구",
  배구: "배구",
}

const SPORT_EMOJI: Record<string, string> = {
  축구: "⚽",
  야구: "⚾",
  농구: "🏀",
  배구: "🏐",
}

/**
 * 카드 액센트 컬러 — 사이트 브랜드(버건디/와인레드) 기반.
 * 종목 구분은 이모지(⚽⚾🏀🏐) + "축구 N경기" 라벨로 이미 충분.
 * 과거 종목별 형광색(emerald/sky/orange/purple)은 브랜드 아이덴티티와 충돌 → 단일 브랜드 톤으로 통일.
 */
const BRAND_CARD_COLOR = {
  header: "bg-primary/90", // 버건디 헤더
  text: "text-primary", // 흰 배지 위 액센트
  toggle: "text-primary hover:text-primary/80",
  cardShadow: "shadow-md shadow-primary/10",
  border: "border-primary/10",
} as const
const SPORT_COLOR: Record<string, typeof BRAND_CARD_COLOR> = {
  축구: BRAND_CARD_COLOR,
  야구: BRAND_CARD_COLOR,
  농구: BRAND_CARD_COLOR,
  배구: BRAND_CARD_COLOR,
}
const SPORT_COLOR_DEFAULT = BRAND_CARD_COLOR

function formatActivityDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })
}

/** 경기 시간 라벨: "4/4 (토) 19:30" */
function formatMatchTimeLabel(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  } catch {
    return ""
  }
}

export function PredictionActivityCard({
  activity,
  onPurchase,
  isFollowed = false,
  isFollowLoading = false,
  onFollow,
}: {
  activity: ActivityData
  onPurchase: (activityId: string) => Promise<Prediction[] | null>
  isFollowed?: boolean
  isFollowLoading?: boolean
  onFollow?: () => void
}) {
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [localSlipGroups, setLocalSlipGroups] = useState<SlipGroup[] | null>(
    activity.slipGroups || null
  )
  const [localPredictions, setLocalPredictions] = useState<Prediction[] | null>(
    activity.predictions
  )
  const [isPurchased, setIsPurchased] = useState(activity.is_purchased)
  const [isFree, setIsFree] = useState(activity.is_free || false)
  // 기본은 모든 슬립 접힘 — 사용자가 "내용 보기" 토글로만 본문/경기 펼침.
  const [expandedSlips, setExpandedSlips] = useState<Set<string>>(new Set())

  const toggleSlip = (slipId: string) => {
    setExpandedSlips((prev) => {
      const next = new Set(prev)
      if (next.has(slipId)) next.delete(slipId)
      else next.add(slipId)
      return next
    })
  }

  const handlePurchase = async () => {
    setIsPurchasing(true)
    try {
      const result = await onPurchase(activity.id)
      if (result) {
        setLocalPredictions(result)
        setIsPurchased(true)
        setLocalSlipGroups(buildSlipGroupsFromPredictions(result, activity.sport))
      }
    } finally {
      setIsPurchasing(false)
    }
  }

  const sportLabel = SPORT_LABELS[activity.sport] || activity.sport
  const sportEmoji = SPORT_EMOJI[activity.sport] || "🎯"
  const sportColor = SPORT_COLOR[activity.sport] || SPORT_COLOR_DEFAULT
  const contentUnlocked = isPurchased || isFree

  // slipGroups가 없고 unlocked predictions만 있는 경우 자동 변환 → 렌더 일관성 유지.
  const effectiveSlipGroups = useMemo<SlipGroup[] | null>(() => {
    if (localSlipGroups && localSlipGroups.length > 0) return localSlipGroups
    if (localPredictions && localPredictions.length > 0 && contentUnlocked) {
      return buildSlipGroupsFromPredictions(localPredictions, activity.sport)
    }
    return null
  }, [localSlipGroups, localPredictions, contentUnlocked, activity.sport])

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white ${sportColor.border} ${sportColor.cardShadow}`}
    >
      {/* Header: 종목 컬러 solid 블록 + 흰 텍스트/배지 */}
      <div className={`${sportColor.header} px-4 py-4`}>
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 flex-shrink-0 ring-2 ring-white/70">
            <AvatarImage
              src={activity.profile.avatar_url || "/placeholder-user.jpg"}
              alt={activity.profile.nickname}
            />
            <AvatarFallback className={`text-sm font-bold ${sportColor.text} bg-white`}>
              {activity.profile.nickname?.[0] || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[14px] font-bold text-white">{activity.profile.nickname}</span>
              {onFollow && (
                <button
                  type="button"
                  onClick={onFollow}
                  disabled={isFollowLoading}
                  className={`h-5 rounded-full px-2 text-[10px] font-semibold transition-colors ${
                    isFollowed
                      ? "bg-white/20 text-white/90 hover:bg-white/30"
                      : "bg-white text-gray-800 shadow-sm hover:bg-white/90"
                  }`}
                >
                  {isFollowLoading ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : isFollowed ? (
                    "팔로잉"
                  ) : (
                    "팔로우"
                  )}
                </button>
              )}
              {activity.stats && activity.stats.accuracy > 0 && (
                <span
                  className={`inline-flex h-5 items-center gap-0.5 rounded-full bg-white px-1.5 text-[10px] font-bold shadow-sm ${sportColor.text}`}
                >
                  <Target className="h-2.5 w-2.5" />
                  {activity.stats.accuracy.toFixed(1)}%
                </span>
              )}
              {activity.stats && activity.stats.current_streak > 0 && (
                <span className="inline-flex h-5 items-center gap-0.5 rounded-full bg-white/90 px-1.5 text-[10px] font-bold text-orange-600 shadow-sm">
                  <Flame className="h-2.5 w-2.5" />
                  {activity.stats.current_streak}연승
                </span>
              )}
              {activity.stats && activity.stats.net_profit > 0 && (
                <span className="inline-flex h-5 items-center gap-0.5 rounded-full bg-white/90 px-1.5 text-[10px] font-bold text-emerald-600 shadow-sm">
                  <TrendingUp className="h-2.5 w-2.5" />+{activity.stats.net_profit.toFixed(0)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-white/80">
              {formatActivityDate(activity.created_at)} ·{" "}
              {formatRelativeTime(new Date(activity.created_at))}
            </p>
          </div>
        </div>
      </div>

      {/* 슬립 섹션 루프 — 기본 collapsed, "내용 보기" 토글로 펼침 */}
      {effectiveSlipGroups && effectiveSlipGroups.length > 0
        ? effectiveSlipGroups.map((group) => {
            const slipLocked = !contentUnlocked
            const title = group.analysisTitle || `${sportLabel} ${group.matchCount}경기 조합`
            const oddsText = slipLocked ? group.totalOddsRange : `${group.totalOdds.toFixed(2)}배`
            const statusDot = !slipLocked ? getStatusDot(group.status) : null
            const isExpanded = expandedSlips.has(group.slipId)
            const canExpand = !slipLocked && (!!group.analysisText || group.matches.length > 0)

            return (
              <div key={group.slipId} className="border-t border-gray-100 px-4 pt-4 pb-3">
                {/* Meta + 상태 pill */}
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-semibold text-gray-500">
                    {sportEmoji} {sportLabel} {group.matchCount}경기
                  </span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                      slipLocked ? "bg-gray-100 text-gray-600" : "bg-primary/90 text-white"
                    }`}
                  >
                    {oddsText}
                  </span>
                  {statusDot && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${statusDot.pillClass}`}
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${statusDot.dotClass}`}
                        aria-hidden="true"
                      />
                      {statusDot.label}
                    </span>
                  )}
                </div>

                {/* HERO: 분석글 제목 */}
                <h3 className="text-[16px] leading-snug font-bold tracking-tight text-gray-900">
                  {title}
                </h3>

                {/* Expanded 상세 — 📝 분석 / 🎯 예측 섹션 분리 */}
                {!slipLocked && isExpanded && (
                  <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
                    {/* 📝 분석 섹션 */}
                    {group.analysisText && (
                      <section>
                        <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-gray-500 uppercase">
                          <span aria-hidden="true">📝</span>
                          <span>분석</span>
                        </h4>
                        <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                          <p className="text-[13.5px] leading-relaxed whitespace-pre-line text-gray-800">
                            {group.analysisText}
                          </p>
                        </div>
                      </section>
                    )}

                    {/* 🎯 예측 섹션 */}
                    {group.matches.length > 0 && (
                      <section>
                        <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-gray-500 uppercase">
                          <span aria-hidden="true">🎯</span>
                          <span>예측 {group.matches.length}경기</span>
                        </h4>
                        <div className="space-y-2">
                          {group.matches.map((m, i) => (
                            <PredictionMatchCard key={`${group.slipId}-match-${i}`} match={m} />
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                )}

                {/* Action: locked CTA / unlocked 토글 */}
                <div className="mt-3.5">
                  {slipLocked ? (
                    <Button
                      onClick={handlePurchase}
                      disabled={isPurchasing}
                      className="bg-primary hover:bg-primary/90 shadow-primary/30 h-11 w-full gap-2 text-[14px] font-bold text-white shadow-md"
                    >
                      {isPurchasing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          구매 중...
                        </>
                      ) : (
                        <>
                          <Lock className="h-4 w-4" />
                          500G로 열람
                        </>
                      )}
                    </Button>
                  ) : canExpand ? (
                    <button
                      type="button"
                      onClick={() => toggleSlip(group.slipId)}
                      className={`flex w-full items-center justify-center gap-1 rounded-lg py-2 text-[13px] font-bold transition-colors ${sportColor.toggle} hover:bg-gray-50`}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? (
                        <>
                          접기
                          <ChevronUp className="h-4 w-4" />
                        </>
                      ) : (
                        <>
                          내용 보기
                          <ChevronDown className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })
        : null}
    </div>
  )
}

/** 상태 → pill/도트 컬러 + 라벨. 도박 신호(빨강) 피하기 위해 lose는 중성 slate. */
function getStatusDot(
  status: string
): { label: string; dotClass: string; pillClass: string } | null {
  switch (status) {
    case "win":
      return {
        label: "적중",
        dotClass: "bg-white",
        pillClass: "bg-emerald-500/85 text-white shadow-sm shadow-emerald-500/30",
      }
    case "lose":
      return {
        label: "미적중",
        dotClass: "bg-slate-400",
        pillClass: "bg-slate-100 text-slate-600",
      }
    case "pending":
      return {
        label: "진행중",
        dotClass: "bg-white",
        pillClass: "bg-amber-500 text-white shadow-sm shadow-amber-500/30",
      }
    case "cancelled":
      return {
        label: "취소",
        dotClass: "bg-slate-400",
        pillClass: "bg-slate-100 text-slate-500",
      }
    default:
      return null
  }
}

/** selection 한글 라벨 → 내부 키 매핑 */
function selectionToKey(selection?: string): string | null {
  if (!selection) return null
  const map: Record<string, string> = {
    홈팀: "home",
    원정팀: "away",
    무: "draw",
    오버: "over",
    언더: "under",
  }
  return map[selection] || null
}

/** 경기별 결과 pill */
function getMatchResultPill(result: string): { label: string; className: string } | null {
  switch (result) {
    case "win":
      return { label: "적중", className: "bg-emerald-500/85 text-white" }
    case "lose":
      return { label: "미적중", className: "bg-slate-200 text-slate-600" }
    case "pending":
      return { label: "진행중", className: "bg-amber-500 text-white" }
    default:
      return null
  }
}

/** 배당률 셀 — 내 선택/정답 여부에 따라 하이라이트 */
function OddsCell({
  label,
  subLabel,
  odds,
  isSelected,
  isCorrect,
}: {
  label: string
  subLabel?: string
  odds: number | undefined | null
  isSelected: boolean
  isCorrect: boolean
}) {
  const oddsValue = odds && odds > 0 ? odds.toFixed(2) : "-"
  const base = "rounded-md border px-2 py-1.5 text-center transition-colors"
  const stateClass = isSelected
    ? isCorrect
      ? "border-emerald-500/70 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/30"
      : "border-primary bg-primary/90 text-white"
    : isCorrect
      ? "border-emerald-300/60 bg-emerald-50/60 text-emerald-600"
      : "border-gray-200 bg-white text-gray-500"
  return (
    <div className={`${base} ${stateClass}`}>
      <div className="truncate text-[11px] font-semibold">{label}</div>
      {subLabel && <div className="text-[9px] opacity-70">{subLabel}</div>}
      <div className="mt-0.5 text-[13px] font-bold tabular-nums">{oddsValue}</div>
    </div>
  )
}

/** 경기 상세 카드 — 리그/유형/시간/경기장/스코어/핸디캡/언오버 기준 + 배당 테이블 + 내 선택 + 결과 */
function PredictionMatchCard({ match }: { match: PredictionMatch }) {
  const gameType = match.gameType || "일반"
  const isUnderOver = gameType === "언더오버"
  const isHandicap = gameType === "핸디캡"
  const selectionKey = selectionToKey(match.selection)
  const correctKey = selectionToKey(match.correctAnswer)
  const resultPill = getMatchResultPill(match.result)
  const hasScore = match.homeScore != null && match.awayScore != null
  const matchTimeText = match.matchTime ? formatMatchTimeLabel(match.matchTime) : null
  const lineValue = isUnderOver ? match.overUnderLine : isHandicap ? match.handicap : null

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-3">
      {/* Top: 리그 + 경기유형(+라인값) + 결과 */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {match.league && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-700">
              {match.league}
            </span>
          )}
          <span className="bg-primary/90 rounded px-1.5 py-0.5 text-[10px] font-bold text-white">
            {gameType}
            {lineValue != null && (
              <span className="ml-0.5 tabular-nums">
                {lineValue > 0 ? ` +${lineValue}` : ` ${lineValue}`}
              </span>
            )}
          </span>
        </div>
        {resultPill && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${resultPill.className}`}
          >
            {resultPill.label}
          </span>
        )}
      </div>

      {/* 경기 시간 + 경기장 */}
      {(matchTimeText || match.venue) && (
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
          {matchTimeText && <span className="tabular-nums">🕒 {matchTimeText}</span>}
          {match.venue && <span className="truncate">🏟 {match.venue}</span>}
        </div>
      )}

      {/* 경기 (팀 vs 팀 + 스코어) */}
      <div className="flex items-center gap-2 text-[14px] font-semibold text-gray-900">
        <span className="truncate">{match.home}</span>
        {hasScore ? (
          <span className="rounded-md bg-gray-900 px-2 py-0.5 text-[13px] font-bold tracking-wide text-white tabular-nums">
            {match.homeScore} - {match.awayScore}
          </span>
        ) : (
          <span className="text-gray-400">vs</span>
        )}
        <span className="truncate">{match.away}</span>
      </div>

      {/* 배당 테이블 */}
      {isUnderOver ? (
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <OddsCell
            label="오버"
            odds={match.overOdds}
            isSelected={selectionKey === "over"}
            isCorrect={correctKey === "over"}
          />
          <OddsCell
            label="언더"
            odds={match.underOdds}
            isSelected={selectionKey === "under"}
            isCorrect={correctKey === "under"}
          />
        </div>
      ) : (
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          <OddsCell
            label={match.home}
            subLabel="홈"
            odds={match.homeOdds}
            isSelected={selectionKey === "home"}
            isCorrect={correctKey === "home"}
          />
          <OddsCell
            label="무"
            odds={match.drawOdds}
            isSelected={selectionKey === "draw"}
            isCorrect={correctKey === "draw"}
          />
          <OddsCell
            label={match.away}
            subLabel="원정"
            odds={match.awayOdds}
            isSelected={selectionKey === "away"}
            isCorrect={correctKey === "away"}
          />
        </div>
      )}

      {/* 내 선택 요약 + 정답 비교 */}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-gray-100 pt-2 text-[11px]">
        <span className="text-gray-500">
          내 선택: <span className="font-bold text-gray-900">{match.selection}</span>
          {match.odds > 0 && <span className="text-gray-500"> · {match.odds.toFixed(2)}배</span>}
        </span>
        {match.correctAnswer && match.correctAnswer !== match.selection && (
          <span className="text-gray-500">
            정답: <span className="font-bold text-emerald-600">{match.correctAnswer}</span>
          </span>
        )}
      </div>
    </article>
  )
}

// Purchase API 응답(predictions)으로부터 slipGroups 빌드
function buildSlipGroupsFromPredictions(
  predictions: Prediction[],
  activitySport: string
): SlipGroup[] {
  const game0 = predictions[0]?.game
  const sport = game0?.sport || activitySport
  const date = game0?.match_time
    ? new Date(game0.match_time).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })
    : ""

  const SELECTION_MAP: Record<string, string> = {
    home: "홈팀",
    away: "원정팀",
    draw: "무",
    over: "오버",
    under: "언더",
  }

  const allSettled = predictions.every((p) => p.game?.result)
  const allCorrect = predictions.every((p) => p.game?.result && p.game.result === p.prediction)
  const status = !allSettled ? "pending" : allCorrect ? "win" : "lose"

  const matches: PredictionMatch[] = predictions.map((p) => {
    const dbResult = p.game?.result
    const matchResult = dbResult ? (dbResult === p.prediction ? "win" : "lose") : "pending"
    const correctAnswer = dbResult ? SELECTION_MAP[dbResult] || dbResult : undefined
    return {
      league: "",
      home: p.game?.home_team_name || "",
      away: p.game?.away_team_name || "",
      selection: SELECTION_MAP[p.prediction] || p.prediction,
      odds: 0,
      result: matchResult,
      correctAnswer,
      gameType: p.game?.game_type || "일반",
    }
  })

  return [
    {
      slipId: "purchased",
      sport,
      date,
      status,
      matchCount: predictions.length,
      analysisTitle: null,
      totalOddsRange: "—",
      stake: 0,
      totalOdds: 0,
      profit: 0,
      matches,
      analysisText: null,
    },
  ]
}
