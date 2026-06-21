import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { ArrowLeft } from "lucide-react"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { SectionHeader } from "@/components/section-header"
import { WORLDCUP_SCORING_STARTS_AT } from "@/lib/worldcup/scoring"
import {
  LeaderboardClient,
  type LbGroup,
  type LbGroupAvg,
  type LbRanking,
  type LbMyInfo,
} from "@/components/worldcup/leaderboard-client"

const EVENT_SLUG = "worldcup-2026"

export const metadata: Metadata = {
  title: "월드컵 리더보드",
  description: "구너 전체 평균과 내 위치. 개별 순위는 종료 후 공개.",
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
        .eq("slug", "gooner") // 아스날 전용 — kop/blues DB 행이 남아있어도 리더보드엔 구너만
        .order("sort_order"),
      supabase.from("event_registrations").select("user_id, group_id").eq("event_id", event.id),
      supabase
        .from("prediction_slips")
        .select("user_id, stake, total_odds, status")
        .eq("event_id", event.id)
        // 32강부터 정식 집계 — 그 이전 슬립은 순위에 반영하지 않는다.
        .gte("created_at", WORLDCUP_SCORING_STARTS_AT),
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
    <div className="min-h-screen" style={{ background: "var(--wc-paper)" }}>
      <div className="mx-auto max-w-[1120px] px-6 pt-10 pb-16">
        <Link
          href="/worldcup"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
          style={{ color: "var(--wc-mute)" }}
        >
          <ArrowLeft className="h-4 w-4" /> 이벤트 안내로
        </Link>
        <SectionHeader
          label="LEADERBOARD"
          title="리더보드"
          description="구너 전체 평균과 내 위치. 개별 순위는 의욕 상실 방지를 위해 진행 중에는 비공개 — 종료 후 결과 발표에서 구너 1위를 공개합니다."
          style={{ marginTop: 16 }}
        />

        {userId && (
          <Link
            href="/worldcup/my-predictions"
            className="wc-hbtn wc-hbtn-ghost mb-8 inline-flex"
            style={{ height: 42 }}
          >
            내 예측 기록 보기
          </Link>
        )}

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
