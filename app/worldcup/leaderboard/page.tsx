import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import {
  LeaderboardClient,
  type LbGroup,
  type LbGroupAvg,
  type LbRanking,
  type LbMyInfo,
} from "@/components/worldcup/leaderboard-client"

const EVENT_SLUG = "worldcup-2026"

export const metadata: Metadata = {
  title: "월드컵 이벤트 리더보드",
  description: "그룹 내 수익금 순위와 그룹 평균으로 가리는 축잘알 팬덤.",
  alternates: { canonical: "/worldcup/leaderboard" },
}

// 등록자/슬립 변동을 즉시 반영 (정적 prerender 방지)
export const dynamic = "force-dynamic"

interface RegistrationRow {
  user_id: string
  group_id: string
}

interface SlipRow {
  user_id: string
  stake: number
  total_odds: number
  status: string
}

interface GroupRow {
  id: string
  slug: string
  name: string
  club_kor: string | null
  color: string
  sort_order: number
}

interface ProfileRow {
  user_id: string
  nickname: string | null
}

export default async function WorldcupLeaderboardPage() {
  const supabase = createServiceRoleClient()
  const user = await currentUser()
  const userId = user?.id ?? null

  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("slug", EVENT_SLUG)
    .maybeSingle<{ id: string }>()

  // 데이터 없을 때도 페이지는 렌더 (빈 상태)
  let groups: GroupRow[] = []
  let registrations: RegistrationRow[] = []
  let slips: SlipRow[] = []
  let profiles: ProfileRow[] = []

  if (event) {
    const [{ data: g }, { data: r }, { data: s }] = await Promise.all([
      supabase
        .from("event_groups")
        .select("id, slug, name, club_kor, color, sort_order")
        .eq("event_id", event.id)
        .order("sort_order"),
      supabase.from("event_registrations").select("user_id, group_id").eq("event_id", event.id),
      supabase
        .from("prediction_slips")
        .select("user_id, stake, total_odds, status")
        .eq("event_id", event.id),
    ])
    groups = (g ?? []) as GroupRow[]
    registrations = (r ?? []) as RegistrationRow[]
    slips = (s ?? []) as SlipRow[]

    const userIds = [...new Set(registrations.map((x) => x.user_id))]
    if (userIds.length > 0) {
      const { data: p } = await supabase
        .from("profiles")
        .select("user_id, nickname")
        .in("user_id", userIds)
      profiles = (p ?? []) as ProfileRow[]
    }
  }

  // ───── 집계 ─────
  const profileMap = new Map(profiles.map((p) => [p.user_id, p]))

  // user_id → 누적 profit / 정산 카운트
  const userStats = new Map<string, { profit: number; settled: number; won: number }>()
  for (const slip of slips) {
    const cur = userStats.get(slip.user_id) ?? { profit: 0, settled: 0, won: 0 }
    if (slip.status === "won") {
      cur.profit += slip.stake * (Number(slip.total_odds) - 1)
      cur.settled++
      cur.won++
    } else if (slip.status === "lost") {
      cur.profit -= slip.stake
      cur.settled++
    }
    userStats.set(slip.user_id, cur)
  }

  // 그룹별 ranking
  const rankingsBySlug: Record<string, LbRanking[]> = {}
  const groupSummary = new Map<
    string,
    { members: number; totalProfit: number; settled: number; won: number }
  >()
  for (const g of groups) {
    rankingsBySlug[g.slug] = []
    groupSummary.set(g.id, { members: 0, totalProfit: 0, settled: 0, won: 0 })
  }

  for (const reg of registrations) {
    const stat = userStats.get(reg.user_id) ?? { profit: 0, settled: 0, won: 0 }
    const profile = profileMap.get(reg.user_id)
    const group = groups.find((g) => g.id === reg.group_id)
    if (!group) continue

    rankingsBySlug[group.slug].push({
      user_id: reg.user_id,
      nickname: profile?.nickname ?? reg.user_id.slice(0, 8),
      profit: Math.round(stat.profit * 10) / 10,
      accuracy: stat.settled > 0 ? Math.round((stat.won / stat.settled) * 1000) / 10 : 0,
      settled: stat.settled,
      rank: 0,
    })

    const sum = groupSummary.get(reg.group_id)!
    sum.members++
    sum.totalProfit += stat.profit
    sum.settled += stat.settled
    sum.won += stat.won
  }

  // 그룹 내 sort + rank 부여
  for (const slug of Object.keys(rankingsBySlug)) {
    rankingsBySlug[slug].sort((a, b) => b.profit - a.profit)
    rankingsBySlug[slug].forEach((u, i) => {
      u.rank = i + 1
    })
  }

  // 그룹 평균 (avgProfit) → 정렬 후 rank 부여
  const groupAvgArr: LbGroupAvg[] = groups.map((g) => {
    const sum = groupSummary.get(g.id)!
    return {
      slug: g.slug,
      avgProfit: sum.members > 0 ? Math.round((sum.totalProfit / sum.members) * 10) / 10 : 0,
      avgAccuracy: sum.settled > 0 ? Math.round((sum.won / sum.settled) * 1000) / 10 : 0,
      members: sum.members,
      rank: 0,
    }
  })
  groupAvgArr.sort((a, b) => b.avgProfit - a.avgProfit)
  groupAvgArr.forEach((g, i) => {
    g.rank = i + 1
  })

  // 내 정보
  let myInfo: LbMyInfo | null = null
  if (userId) {
    const myReg = registrations.find((r) => r.user_id === userId)
    if (myReg) {
      const myGroup = groups.find((g) => g.id === myReg.group_id)
      if (myGroup) {
        const myEntry = rankingsBySlug[myGroup.slug].find((u) => u.user_id === userId)
        if (myEntry) {
          myInfo = {
            user_id: userId,
            groupSlug: myGroup.slug,
            rank: myEntry.rank,
            totalInGroup: rankingsBySlug[myGroup.slug].length,
            profit: myEntry.profit,
            accuracy: myEntry.accuracy,
            settled: myEntry.settled,
          }
        }
      }
    }
  }

  // TOP 10 per group
  const top10BySlug: Record<string, LbRanking[]> = {}
  for (const slug of Object.keys(rankingsBySlug)) {
    top10BySlug[slug] = rankingsBySlug[slug].slice(0, 10)
  }

  const groupsForClient: LbGroup[] = groups.map((g) => ({
    slug: g.slug,
    name: g.name,
    clubKor: g.club_kor,
    color: g.color,
  }))

  return (
    <div className="px-4 pt-6 pb-16 sm:pt-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <Link href="/worldcup" className="wc-reg-head-back">
            ← 이벤트 안내로
          </Link>
          <div className="wc-sec-eb">LIVE LEADERBOARD</div>
          <h1
            className="font-black tracking-tight"
            style={{
              fontSize: "clamp(28px, 4.5vw, 36px)",
              lineHeight: 1.15,
              color: "var(--wc-ink)",
              letterSpacing: "-0.02em",
            }}
          >
            월드컵 이벤트 리더보드
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--wc-mute)" }}>
            그룹 내 누적 수익금 순위와 그룹 평균으로 가리는 &ldquo;축잘알 팬덤&rdquo;. 이벤트 종료
            시점에 그룹 1위가 결정됩니다.
          </p>
        </header>

        <LeaderboardClient
          groups={groupsForClient}
          groupAvg={groupAvgArr}
          rankings={top10BySlug}
          myInfo={myInfo}
        />
      </div>
    </div>
  )
}
