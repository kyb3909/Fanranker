import { NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

function toKSTDate(iso: string): string {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth

    const { supabase } = auth

    // 1. 전체/종목별: betman_user_sport_stats
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
    }

    const bySport = rows
      .filter((r) => r.sport !== "전체")
      .map((r) => {
        const wagered = Number(r.total_wagered) || 0
        const returns = Number(r.total_returns) || 0
        const correct = Number(r.correct_predictions) || 0
        const wrong = Number(r.wrong_predictions) || 0
        const active = correct + wrong
        return {
          sport: r.sport,
          avgProfitRate:
            wagered > 0 ? Math.round(((returns - wagered) / wagered) * 10000) / 100 : null,
          avgAccuracy: active > 0 ? Math.round((correct / active) * 10000) / 100 : null,
          housePnl: Math.round((wagered - returns) * 100) / 100,
          totalWagered: wagered,
          totalReturns: returns,
          correctPredictions: correct,
          wrongPredictions: wrong,
        }
      })
      .sort((a, b) => (b.totalWagered || 0) - (a.totalWagered || 0))

    // 2. 최근 7일 일자별 추이 (정산일 = 슬립 내 예측의 max(settled_at) 날짜, KST)
    const now = new Date()
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    type PredRow = { slip_id: string | null; settled_at: string | null }
    const { data: preds, error: predsError } = (await supabase
      .from("betman_predictions")
      .select("slip_id, settled_at")
      .in("status", ["settled", "cancelled"])
      .not("settled_at", "is", null)
      .gte("settled_at", sevenDaysAgo.toISOString())) as { data: PredRow[] | null; error: unknown }

    if (predsError) {
      return apiError("일별 통계 조회 실패", 500, predsError)
    }

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
      .select("settled_at, is_correct, status")
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
        wagered: Math.round(wagered * 100) / 100,
        payout: Math.round(payout * 100) / 100,
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
