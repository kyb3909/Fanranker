import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"
import { WORLDCUP_SCORING_STARTS_AT } from "@/lib/worldcup/scoring"

export const dynamic = "force-dynamic"

const EVENT_SLUG = "worldcup-2026"
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

interface SlipRow {
  user_id: string
  stake: number | null
  total_odds: number | null
  status: string
  created_at: string
}

/**
 * GET /api/event/worldcup/report
 *
 * 월드컵 이벤트 "주인장 vs 유저" 결과 후기 집계 (공개).
 *
 * 메인 통계(/api/betman/community-stats)는 betman_user_sport_stats 를 쓰는데 그 테이블은
 * 이벤트 슬립을 제외한다(lib/betman/stats.ts). 따라서 이벤트 후기는 prediction_slips 에서
 * event_id 로 직접 집계한다. 손익 공식은 리더보드/community-stats 와 동일:
 *   won  → 지급 = stake × total_odds
 *   lost → 지급 0 (스테이크 소각)
 *   housePnl = Σstake − Σ지급  (양수 = 주인장 이득)
 * cancelled/pending 은 집계 제외. 하한은 WORLDCUP_SCORING_STARTS_AT (32강부터).
 */
export async function GET() {
  try {
    const supabase = createServiceRoleClient()

    const { data: event } = await supabase
      .from("events")
      .select("id, start_at, end_at")
      .eq("slug", EVENT_SLUG)
      .maybeSingle<{ id: string; start_at: string | null; end_at: string | null }>()

    if (!event) {
      return NextResponse.json({ overall: null, period: null })
    }

    // 이벤트 슬립 전량 조회 — 1000행 초과 대비 페이지네이션.
    const slips: SlipRow[] = []
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("prediction_slips")
        .select("user_id, stake, total_odds, status, created_at")
        .eq("event_id", event.id)
        .gte("created_at", WORLDCUP_SCORING_STARTS_AT)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) return apiError("이벤트 통계 조회 실패", 500, error)
      if (!data || data.length === 0) break
      slips.push(...(data as SlipRow[]))
      if (data.length < PAGE) break
    }

    let totalWagered = 0
    let totalReturns = 0
    let wonSlips = 0
    let settledSlips = 0
    const participants = new Set<string>()

    for (const s of slips) {
      // 정산(won/lost)만 — cancelled(환불)/pending 제외.
      if (s.status !== "won" && s.status !== "lost") continue
      const stake = Number(s.stake) || 0
      settledSlips++
      totalWagered += stake
      participants.add(s.user_id)
      if (s.status === "won") {
        wonSlips++
        totalReturns += stake * (Number(s.total_odds) || 1)
      }
    }

    const round2 = (n: number) => Math.round(n * 100) / 100

    const overall = {
      housePnl: round2(totalWagered - totalReturns),
      avgProfitRate:
        totalWagered > 0
          ? Math.round(((totalReturns - totalWagered) / totalWagered) * 10000) / 100
          : null,
      avgAccuracy: settledSlips > 0 ? Math.round((wonSlips / settledSlips) * 10000) / 100 : null,
      totalWagered: round2(totalWagered),
      totalReturns: round2(totalReturns),
      wonSlips,
      settledSlips,
      totalParticipants: participants.size,
    }

    // 기간은 이벤트 공식 등록 기간(start_at~end_at, KST 날짜) — 월드컵 전체 토너먼트 기간.
    let period: { start: string; end: string } | null = null
    if (event.start_at && event.end_at) {
      const toKSTDay = (iso: string) =>
        new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
      period = { start: toKSTDay(event.start_at), end: toKSTDay(event.end_at) }
    }

    const res = NextResponse.json({ overall, period })
    res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120")
    return res
  } catch (error) {
    return apiError("이벤트 통계 조회 실패", 500, error)
  }
}
