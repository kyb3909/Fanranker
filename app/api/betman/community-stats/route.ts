import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

function toKSTDate(iso: string): string {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 이벤트(월드컵) 슬립 전역 집합 — 커뮤니티 통계에서 이벤트 베팅 제외
    const { data: eventSlipRows } = await supabase
      .from("prediction_slips")
      .select("id")
      .not("event_id", "is", null)
    const eventSlipIdSet = new Set((eventSlipRows ?? []).map((s) => s.id))

    // 1. 전체/종목별 통계
    const { data: allStats, error: statsError } = await supabase
      .from("betman_user_sport_stats")
      .select("sport, total_wagered, total_returns, correct_predictions, wrong_predictions")
      .not("total_wagered", "is", null)

    if (statsError) {
      return apiError("통계 조회 실패", 500, statsError)
    }

    const rows = allStats ?? []

    const overallRows = rows.filter((r) => r.sport === "전체")
    const totalWageredAll = overallRows.reduce((s, r) => s + (Number(r.total_wagered) || 0), 0)
    const totalReturnsAll = overallRows.reduce((s, r) => s + (Number(r.total_returns) || 0), 0)
    const correctAll = overallRows.reduce((s, r) => s + (Number(r.correct_predictions) || 0), 0)
    const wrongAll = overallRows.reduce((s, r) => s + (Number(r.wrong_predictions) || 0), 0)
    const activeAll = correctAll + wrongAll

    // 참여 유저 수
    const uniqueUsers = new Set(overallRows.map(() => 1)).size
    const { count: participantCount } = await supabase
      .from("betman_user_sport_stats")
      .select("user_id", { count: "exact", head: true })
      .eq("sport", "전체")
      .gt("total_wagered", 0)

    const overall = {
      avgProfitRate:
        totalWageredAll > 0
          ? Math.round(((totalReturnsAll - totalWageredAll) / totalWageredAll) * 10000) / 100
          : null,
      avgAccuracy: activeAll > 0 ? Math.round((correctAll / activeAll) * 10000) / 100 : null,
      housePnl: Math.round((totalWageredAll - totalReturnsAll) * 100) / 100,
      totalWagered: totalWageredAll,
      totalReturns: totalReturnsAll,
      correctPredictions: correctAll,
      wrongPredictions: wrongAll,
      totalParticipants: participantCount ?? 0,
    }

    // 종목별
    const sportMap = new Map<
      string,
      { wagered: number; returns: number; correct: number; wrong: number; users: number }
    >()

    for (const r of rows) {
      if (r.sport === "전체") continue
      const cur = sportMap.get(r.sport) ?? {
        wagered: 0,
        returns: 0,
        correct: 0,
        wrong: 0,
        users: 0,
      }
      cur.wagered += Number(r.total_wagered) || 0
      cur.returns += Number(r.total_returns) || 0
      cur.correct += Number(r.correct_predictions) || 0
      cur.wrong += Number(r.wrong_predictions) || 0
      cur.users += 1
      sportMap.set(r.sport, cur)
    }

    const bySport = [...sportMap.entries()]
      .map(([sport, s]) => {
        const active = s.correct + s.wrong
        return {
          sport,
          avgProfitRate:
            s.wagered > 0 ? Math.round(((s.returns - s.wagered) / s.wagered) * 10000) / 100 : null,
          avgAccuracy: active > 0 ? Math.round((s.correct / active) * 10000) / 100 : null,
          housePnl: Math.round((s.wagered - s.returns) * 100) / 100,
          totalWagered: s.wagered,
          totalPredictions: active,
          participants: s.users,
        }
      })
      .sort((a, b) => b.totalWagered - a.totalWagered)

    // 2. 최근 7일 추이
    const now = new Date()
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    type PredRow = { slip_id: string | null; settled_at: string | null }
    const { data: preds } = (await supabase
      .from("betman_predictions")
      .select("slip_id, settled_at")
      .in("status", ["settled", "cancelled"])
      .not("settled_at", "is", null)
      .gte("settled_at", sevenDaysAgo.toISOString())) as { data: PredRow[] | null; error: unknown }

    const slipToMaxDate = new Map<string, string>()
    for (const p of preds ?? []) {
      if (!p.slip_id || !p.settled_at) continue
      const d = toKSTDate(p.settled_at)
      const cur = slipToMaxDate.get(p.slip_id)
      if (!cur || d > cur) slipToMaxDate.set(p.slip_id, d)
    }

    const slipIds = [...slipToMaxDate.keys()]
    let slipsData: Array<{
      id: string
      stake: number | null
      total_odds: number | null
      status: string
    }> = []

    if (slipIds.length > 0) {
      const chunk = 200
      for (let i = 0; i < slipIds.length; i += chunk) {
        const ids = slipIds.slice(i, i + chunk)
        const { data: slips, error: slipsErr } = await supabase
          .from("prediction_slips")
          .select("id, stake, total_odds, status")
          .in("id", ids)
          .in("status", ["won", "lost"])
          .is("event_id", null) // 이벤트 슬립 제외
        if (slipsErr) continue
        slipsData = slipsData.concat(slips ?? [])
      }
    }

    const slipMap = new Map(slipsData.map((s) => [s.id, s]))
    const dayToSlips = new Map<string, string[]>()
    for (const [sid, d] of slipToMaxDate) {
      if (!dayToSlips.has(d)) dayToSlips.set(d, [])
      dayToSlips.get(d)!.push(sid)
    }

    const dailyDates: string[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      dailyDates.push(toKSTDate(d.toISOString()))
    }

    const dayStart = dailyDates[0]
    const dayEnd = dailyDates[dailyDates.length - 1]
    const { data: settledPreds } = await supabase
      .from("betman_predictions")
      .select("settled_at, is_correct, status, slip_id")
      .in("status", ["settled", "cancelled"])
      .not("settled_at", "is", null)
      .gte("settled_at", new Date(dayStart + "T00:00:00.000+09:00").toISOString())
      .lte("settled_at", new Date(dayEnd + "T23:59:59.999+09:00").toISOString())

    const correctWrongByDate = new Map<string, { correct: number; wrong: number }>()
    for (const d of dailyDates) {
      correctWrongByDate.set(d, { correct: 0, wrong: 0 })
    }
    for (const p of settledPreds ?? []) {
      if (p.status === "cancelled") continue
      if (p.slip_id && eventSlipIdSet.has(p.slip_id)) continue
      const d = toKSTDate((p as { settled_at: string }).settled_at)
      const cur = correctWrongByDate.get(d)
      if (!cur) continue
      if (p.is_correct === true) cur.correct++
      else cur.wrong++
    }

    const dailyTrend = dailyDates.map((date) => {
      const sids = dayToSlips.get(date) ?? []
      let wagered = 0
      let payout = 0
      for (const sid of sids) {
        const slip = slipMap.get(sid)
        if (!slip) continue
        const stake = Number(slip.stake) || 0
        wagered += stake
        if (slip.status === "won") {
          payout += Math.round(stake * (Number(slip.total_odds) || 1) * 100) / 100
        }
      }
      const { correct, wrong } = correctWrongByDate.get(date) ?? { correct: 0, wrong: 0 }
      const active = correct + wrong
      const dayAccuracy = active > 0 ? Math.round((correct / active) * 10000) / 100 : null
      const dayProfitRate =
        wagered > 0 ? Math.round(((payout - wagered) / wagered) * 10000) / 100 : null
      const housePnl = Math.round((wagered - payout) * 100) / 100

      return {
        date,
        wagered,
        payout,
        housePnl,
        avgProfitRate: dayProfitRate,
        avgAccuracy: dayAccuracy,
      }
    })

    return NextResponse.json({
      overall,
      bySport,
      dailyTrend,
      fetchedAt: new Date().toISOString(),
    })
  } catch (error) {
    return apiError("통계 조회 실패", 500, error)
  }
}
