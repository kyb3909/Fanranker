"use client"

import { BettingRankings } from "./betting-rankings"
import type { RankingUser, MyRank } from "@/types/betting"

interface RankingTabProps {
  rankingFilter: "profit" | "winRate" | "roi"
  rankings: RankingUser[]
  myRank: MyRank | null
  isLoading: boolean
  followedUsers: Set<string>
  followLoading: Set<string>
  onFollow: (userId: string) => void
}

export function RankingTab({
  rankingFilter,
  rankings,
  myRank,
  isLoading,
  followedUsers,
  followLoading,
  onFollow,
}: RankingTabProps) {
  return (
    <BettingRankings
      rankingFilter={rankingFilter}
      rankings={rankings}
      myRank={myRank}
      isLoading={isLoading}
      followedUsers={followedUsers}
      followLoading={followLoading}
      onFollow={onFollow}
    />
  )
}
