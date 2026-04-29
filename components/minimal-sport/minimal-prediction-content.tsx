"use client"

import { useState, useMemo, useCallback } from "react"
import { RotateCcw } from "lucide-react"
import useSWR from "swr"
import { useAuth } from "@clerk/nextjs"
import { fetcher } from "@/lib/swr"
import { useBettingMatches } from "@/hooks/use-betting-matches"
import type { MyStatsData } from "@/components/betting/betting-types"
import { MinimalShell } from "./minimal-shell"
import { MinimalTopbar } from "./minimal-topbar"
import { MinimalSidebar } from "./minimal-sidebar"
import { MinimalRightAside } from "./minimal-right-aside"
import { MinimalMatchCard, type MinimalMatchCardPicks } from "./minimal-match-card"
import { MinimalPrizeCard } from "./minimal-prize-card"
import { MinimalMyBetCard } from "./minimal-mybet-card"
import { MinimalTalkList, type TalkItem } from "./minimal-talk-list"

interface RawCategory {
  id: number | string
  slug: string
  name: string
  icon?: string | null
  sort_order: number
  parent_slug?: string | null
}

interface MinimalPredictionContentProps {
  categories: RawCategory[]
  recentComments: TalkItem[]
}

type PredTab = "today" | "rank" | "stat" | "mine"
type SportFilter = "전체" | "축구" | "야구" | "농구" | "배구"

const PRED_TABS: { key: PredTab; label: string }[] = [
  { key: "today", label: "오늘의 경기" },
  { key: "rank", label: "랭킹" },
  { key: "stat", label: "통계" },
  { key: "mine", label: "마이페이지" },
]

const SPORT_PILLS: { value: SportFilter; emoji?: string }[] = [
  { value: "전체" },
  { value: "축구", emoji: "⚽" },
  { value: "야구", emoji: "⚾" },
  { value: "농구", emoji: "🏀" },
  { value: "배구", emoji: "🏐" },
]

function groupCategories(cats: RawCategory[]) {
  const parents = cats.filter((c) => !c.parent_slug)
  const sports = parents
    .filter((c) => c.sort_order <= 4)
    .map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }))
  const life = parents
    .filter((c) => c.sort_order > 4)
    .map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }))
  return { sports, life }
}

/**
 * 경기 예측(/prediction) 메인 — Minimal Sport 디자인.
 *
 * 데스크톱(lg+) 전용. 모바일/태블릿은 부모 PredictionClient에서 기존 BettingPage 유지.
 *
 * 데이터: useBettingMatches() — server SWR. picks state는 자체 useState
 * (1차는 디자인 검증 + 단일 선택 시각화만; 베팅 슬립 등록은 후속 Phase에서 wiring).
 */
export function MinimalPredictionContent({
  categories,
  recentComments,
}: MinimalPredictionContentProps) {
  const [tab, setTab] = useState<PredTab>("today")
  const [sportFilter, setSportFilter] = useState<SportFilter>("전체")
  const [picks, setPicks] = useState<Record<string, MinimalMatchCardPicks>>({})

  const { isSignedIn } = useAuth()
  const { groupedMatches, isLoading, lastUpdated, loadMatches } = useBettingMatches()
  const { sports, life } = useMemo(() => groupCategories(categories), [categories])

  // /api/sports/my-stats — 로그인 시 사용자 누적 통계 (Streak + 적중률 + 손익)
  const { data: myStats } = useSWR<MyStatsData>(
    isSignedIn ? "/api/sports/my-stats" : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )
  const summary = myStats?.summary ?? null
  const streakRaw = summary?.current_streak ?? 0
  const streakLabel = streakRaw >= 0 ? "연승" : "연패"
  const streakAbs = Math.abs(streakRaw)
  const wins = summary?.correct_predictions ?? 0
  const losses = summary?.wrong_predictions ?? 0
  const profit = summary?.net_profit ?? 0

  const filteredMatches = useMemo(() => {
    if (sportFilter === "전체") return groupedMatches
    return groupedMatches.filter((m) => m.sport === sportFilter)
  }, [groupedMatches, sportFilter])

  const handlePick = useCallback((matchKey: string, groupKey: string, optionKey: string) => {
    setPicks((prev) => ({
      ...prev,
      [matchKey]: { ...(prev[matchKey] ?? {}), [groupKey]: optionKey },
    }))
  }, [])

  const updatedLabel = useMemo(() => {
    if (!lastUpdated) return "—"
    return lastUpdated.toLocaleTimeString("ko-KR", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })
  }, [lastUpdated])

  return (
    <MinimalShell
      topbar={<MinimalTopbar active="경기 예측" />}
      sidebar={<MinimalSidebar sports={sports} life={life} />}
      aside={
        <MinimalRightAside>
          <MinimalPrizeCard showSubLabel />
          <MinimalMyBetCard
            wins={wins}
            losses={losses}
            weeklyCoin={Math.max(0, profit)}
            title={isSignedIn ? "내 예측 통계" : "이번 주 내 예측"}
            isLoggedOut={!isSignedIn}
          />
          <MinimalTalkList items={recentComments} />
        </MinimalRightAside>
      }
    >
      {/* PredTabs — 모바일은 가로 스크롤, sm+ 일반 row */}
      <div
        className="mb-4 flex gap-1 overflow-x-auto rounded-t-xl border-b bg-[var(--ms-surface)] p-2"
        style={{ borderColor: "var(--ms-line)" }}
      >
        {PRED_TABS.map((t) => {
          const isActive = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="relative h-10 shrink-0 rounded-md px-3 text-[13px] whitespace-nowrap transition-colors sm:px-4 sm:text-[14px]"
              style={{
                color: isActive ? "var(--ms-ink)" : "var(--ms-ink-3)",
                fontWeight: isActive ? 800 : 600,
              }}
            >
              {t.label}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute right-3 -bottom-2 left-3 h-0.5 rounded-full"
                  style={{ backgroundColor: "var(--ms-brand)" }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Page header — Crumb + Heading + Streak */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="text-[13px]" style={{ color: "var(--ms-ink-3)" }}>
            경기 예측 ·{" "}
            <b className="font-semibold" style={{ color: "var(--ms-ink-2)" }}>
              {PRED_TABS.find((t) => t.key === tab)?.label}
            </b>
          </div>
          <h1
            className="mt-1 text-[24px] leading-[1.15] font-extrabold sm:text-[28px]"
            style={{ color: "var(--ms-ink)", letterSpacing: "-0.04em" }}
          >
            맞히고 코인 받자
          </h1>
        </div>
        {/* Streak — /api/sports/my-stats current_streak 기반 */}
        <div
          className="flex shrink-0 flex-col items-end self-start rounded-r-xl border-l-[3px] px-3 py-1.5 sm:self-auto sm:px-4 sm:py-2"
          style={{
            borderColor: "var(--ms-brand)",
            backgroundColor: "var(--ms-brand-soft)",
          }}
        >
          <div className="flex items-baseline gap-1">
            <span
              className="font-archivo text-[26px] font-black tabular-nums sm:text-[32px]"
              style={{ color: "var(--ms-brand)" }}
            >
              {streakAbs}
            </span>
            <span
              className="text-[13px] font-extrabold sm:text-[14px]"
              style={{ color: "var(--ms-brand)" }}
            >
              {streakAbs > 0 ? streakLabel : "—"}
            </span>
          </div>
          <span className="text-[11px] font-semibold" style={{ color: "var(--ms-ink-2)" }}>
            {!isSignedIn
              ? "로그인하고 시작"
              : streakAbs === 0
                ? "예측을 시작해보세요"
                : streakRaw > 0
                  ? "현재 연속 적중"
                  : "현재 연속 미적중"}
          </span>
        </div>
      </div>

      {/* Sport pills + updated row — 모바일은 두 줄(스포츠 / 업데이트), sm+ 한 줄 */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {SPORT_PILLS.map((p) => {
            const isActive = sportFilter === p.value
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setSportFilter(p.value)}
                aria-pressed={isActive}
                className={`h-8 shrink-0 rounded-full border px-3.5 text-[12px] font-semibold whitespace-nowrap transition-colors ${
                  isActive ? "text-white" : "hover:border-[var(--ms-line-hover)]"
                }`}
                style={{
                  backgroundColor: isActive ? "var(--ms-ink)" : "var(--ms-surface)",
                  borderColor: isActive ? "var(--ms-ink)" : "var(--ms-line)",
                  color: isActive ? "#ffffff" : "var(--ms-ink-2)",
                }}
              >
                {p.emoji && <span className="mr-1">{p.emoji}</span>}
                {p.value}
              </button>
            )
          })}
        </div>
        <div
          className="flex items-center gap-2 text-[11px] font-medium sm:ml-auto"
          style={{ color: "var(--ms-ink-3)" }}
        >
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: "var(--ms-success)" }}
            aria-hidden
          />
          <span className="truncate">마지막 업데이트 {updatedLabel}</span>
          <button
            type="button"
            onClick={() => loadMatches()}
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold transition-colors hover:border-[var(--ms-ink)] sm:ml-0"
            style={{
              borderColor: "var(--ms-line)",
              color: "var(--ms-ink-2)",
              backgroundColor: "var(--ms-surface)",
            }}
            aria-label="새로고침"
          >
            <RotateCcw className="h-3 w-3" />
            새로고침
          </button>
        </div>
      </div>

      {/* Match list */}
      {tab !== "today" ? (
        <div
          className="rounded-2xl border bg-[var(--ms-surface)] py-12 text-center text-[13px]"
          style={{ borderColor: "var(--ms-line)", color: "var(--ms-ink-3)" }}
        >
          이 탭은 곧 추가됩니다.
        </div>
      ) : isLoading && filteredMatches.length === 0 ? (
        <div className="flex flex-col gap-3.5">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-2xl border"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-line)",
              }}
            />
          ))}
        </div>
      ) : filteredMatches.length === 0 ? (
        <div
          className="rounded-2xl border bg-[var(--ms-surface)] py-12 text-center text-[13px]"
          style={{ borderColor: "var(--ms-line)", color: "var(--ms-ink-3)" }}
        >
          오늘의 경기가 없어요.
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {filteredMatches.map((m) => (
            <MinimalMatchCard
              key={m.matchKey}
              match={m}
              picks={picks[m.matchKey] ?? {}}
              onPick={(groupKey, optionKey) => handlePick(m.matchKey, groupKey, optionKey)}
            />
          ))}
        </div>
      )}
    </MinimalShell>
  )
}
