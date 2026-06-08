import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "월드컵 이벤트 결과 발표",
  description: "구너 1위 발표.",
  alternates: { canonical: "/worldcup/result" },
}

// 결과 데이터 즉시 반영
export const dynamic = "force-dynamic"

const EVENT_SLUG = "worldcup-2026"

interface EventRow {
  id: string
  name: string
  status: string
  end_at: string
  prize_description: string | null
}
interface GroupRow {
  id: string
  slug: string
  name: string
  club_kor: string | null
  color: string
  sort_order: number
}
interface RegRow {
  user_id: string
  group_id: string
}
interface SlipRow {
  user_id: string
  stake: number
  total_odds: number
  status: string
}
interface ProfileRow {
  user_id: string
  nickname: string | null
}

export default async function WorldcupResultPage() {
  const supabase = createServiceRoleClient()

  const { data: event } = await supabase
    .from("events")
    .select("id, name, status, end_at, prize_description")
    .eq("slug", EVENT_SLUG)
    .maybeSingle<EventRow>()

  if (!event) {
    return (
      <div className="px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <div className="wc-reg-rules">
            <div className="wc-reg-rules-h">이벤트 미존재</div>
            <p className="text-[13px] leading-[1.6]">
              이벤트(slug=&quot;{EVENT_SLUG}&quot;)를 찾을 수 없습니다.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // 종료 전이면 안내만
  if (event.status !== "closed") {
    return (
      <div className="px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <Link href="/worldcup" className="wc-reg-head-back">
            ← 이벤트 안내로
          </Link>
          <div className="wc-res-eb mt-6">RESULT</div>
          <h1 className="wc-res-h1">결과 발표 대기 중</h1>
          <p className="wc-res-sub mt-3">
            이벤트가 아직 진행 중입니다. 종료 후 구너 1위를 발표해요.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/worldcup/leaderboard" className="wc-btn-primary-big">
              현재 리더보드 보기
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // 종료 후 — 데이터 fetch + aggregate
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
  const groups = (g ?? []) as GroupRow[]
  const registrations = (r ?? []) as RegRow[]
  const slips = (s ?? []) as SlipRow[]

  const userIds = [...new Set(registrations.map((x) => x.user_id))]
  const profiles: ProfileRow[] =
    userIds.length > 0
      ? (((await supabase.from("profiles").select("user_id, nickname").in("user_id", userIds))
          .data ?? []) as ProfileRow[])
      : []
  const profileMap = new Map(profiles.map((p) => [p.user_id, p]))

  // user → profit / accuracy
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

  // 그룹별 1위 + 그룹 평균
  type Winner = {
    group: GroupRow
    user_id: string
    nickname: string
    profit: number
    accuracy: number
    members: number
    avgProfit: number
  }
  const winners: Winner[] = []
  for (const grp of groups) {
    const grpRegs = registrations.filter((reg) => reg.group_id === grp.id)
    if (grpRegs.length === 0) continue

    let topUser: { user_id: string; profit: number; accuracy: number } | null = null
    let totalProfit = 0
    for (const reg of grpRegs) {
      const stat = userStats.get(reg.user_id) ?? { profit: 0, settled: 0, won: 0 }
      totalProfit += stat.profit
      const accuracy = stat.settled > 0 ? (stat.won / stat.settled) * 100 : 0
      if (!topUser || stat.profit > topUser.profit) {
        topUser = { user_id: reg.user_id, profit: stat.profit, accuracy }
      }
    }
    if (!topUser) continue

    const profile = profileMap.get(topUser.user_id)
    winners.push({
      group: grp,
      user_id: topUser.user_id,
      nickname: profile?.nickname ?? topUser.user_id.slice(0, 8),
      profit: Math.round(topUser.profit * 10) / 10,
      accuracy: Math.round(topUser.accuracy * 10) / 10,
      members: grpRegs.length,
      avgProfit: grpRegs.length > 0 ? Math.round((totalProfit / grpRegs.length) * 10) / 10 : 0,
    })
  }

  return (
    <div className="px-4 pt-6 pb-16 sm:pt-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/worldcup" className="wc-reg-head-back">
          ← 이벤트 안내로
        </Link>

        <header className="wc-res-hero">
          <div className="wc-res-eb">FINAL RESULT</div>
          <h1 className="wc-res-h1">{event.name} 결과</h1>
          <p className="wc-res-sub">구너 1위 발표.</p>
        </header>

        {/* Podium */}
        {winners.length === 0 ? (
          <div className="wc-reg-rules">
            <div className="wc-reg-rules-h">데이터 부족</div>
            <p className="text-[13px] leading-[1.6]">
              이벤트가 종료됐지만 등록자/슬립 데이터가 없어 결과를 산정할 수 없습니다.
            </p>
          </div>
        ) : (
          <div className="wc-res-podium">
            {winners.map((w) => (
              <article
                key={w.group.slug}
                className="wc-rp-card"
                style={{ ["--gp" as string]: w.group.color } as React.CSSProperties}
              >
                <span aria-hidden className="wc-rp-glow" />
                <div className="wc-rp-trophy">🏆</div>
                <div className="wc-rp-rank">구너 1위</div>
                <div className="wc-rp-grp">{w.group.name}</div>
                <div className="wc-rp-sub">{w.group.club_kor} 구너</div>
                <div className="wc-rp-winner">{w.nickname}</div>
                <div className="wc-rp-handle">{w.user_id.slice(0, 12)}…</div>
                <div className="wc-rp-stats">
                  <div>
                    <b>
                      {w.profit >= 0 ? "+" : ""}
                      {w.profit}
                    </b>
                    <span>수익 (볼)</span>
                  </div>
                  <div>
                    <b>{w.accuracy}%</b>
                    <span>적중률</span>
                  </div>
                </div>
                <div className="wc-rp-prize">{event.prize_description || "상품 증정"}</div>
              </article>
            ))}
          </div>
        )}

        {/* 다음 이벤트 예고 */}
        <div className="wc-res-next">
          <div className="wc-res-next-eb">NEXT EVENT</div>
          <div className="wc-res-next-h">다음 시즌 이벤트를 기다리세요</div>
          <p className="wc-res-next-b">
            다음 빅 이벤트가 시작되면 알림으로 알려드릴게요. 그동안 일반 승부예측에서 베팅 감각을
            유지하세요.
          </p>
          <Link href="/prediction" className="wc-res-next-cta">
            일반 승부예측 →
          </Link>
        </div>
      </div>
    </div>
  )
}
