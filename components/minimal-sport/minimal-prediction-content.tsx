"use client"

import { useMemo } from "react"
import dynamic from "next/dynamic"
import useSWR from "swr"
import { useAuth } from "@clerk/nextjs"
import { fetcher } from "@/lib/swr"
import type { MyStatsData } from "@/components/betting/betting-types"
import { MinimalShell } from "./minimal-shell"
import { MinimalTopbar } from "./minimal-topbar"
import { MinimalSidebar } from "./minimal-sidebar"
import { MinimalRightAside } from "./minimal-right-aside"
import { MinimalPrizeCard } from "./minimal-prize-card"
import { MinimalMyBetCard } from "./minimal-mybet-card"
import { MinimalTalkList, type TalkItem } from "./minimal-talk-list"

// BettingPage = 슬립/등록/랭킹/통계/마이페이지 4탭 풀 구현. 동적 로드 (heavy)
const BettingPage = dynamic(() => import("@/components/betting/betting-page"), {
  loading: () => (
    <div className="space-y-3">
      <div
        className="h-12 animate-pulse rounded-lg"
        style={{ backgroundColor: "var(--ms-bg-hover)" }}
      />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-56 animate-pulse rounded-2xl border"
          style={{ backgroundColor: "var(--ms-surface)", borderColor: "var(--ms-line)" }}
        />
      ))}
    </div>
  ),
})

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
 * 경기 예측(/prediction) — Minimal Sport 셸 + 기존 BettingPage 메인.
 *
 * 셸(Topbar / 사이드바 / 우측 aside)은 Minimal 톤 유지 + 메인 영역은 BettingPage
 * 풀 구현(슬립 → 베팅하기 submit, 랭킹/통계/마이페이지 4 tab) 그대로 사용.
 *
 * 사이드 위젯의 streak/적중률 통계만 Minimal 디자인으로 별도 표시
 * (BettingPage 헤더와 중복되지 않게 우측 aside에서 제공).
 */
export function MinimalPredictionContent({
  categories,
  recentComments,
}: MinimalPredictionContentProps) {
  const { isSignedIn } = useAuth()
  const { sports, life } = useMemo(() => groupCategories(categories), [categories])

  // 우측 aside MyBetCard 용 통계
  const { data: myStats } = useSWR<MyStatsData>(
    isSignedIn ? "/api/sports/my-stats" : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )
  const summary = myStats?.summary ?? null
  const wins = summary?.correct_predictions ?? 0
  const losses = summary?.wrong_predictions ?? 0
  const profit = summary?.net_profit ?? 0

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
      <BettingPage />
    </MinimalShell>
  )
}
