import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError } from "@/lib/api-error"
import {
  buildCandidates,
  fetchOpenSeasonEvent,
  hashCandidates,
  kstWeekStart,
  WEEKLY_WINNER_COUNT,
} from "@/lib/event/weekly-draw"

export const dynamic = "force-dynamic"

/**
 * GET/POST /api/cron/season-weekly-draw-snapshot — 매주 월요일 00:05 KST (일 15:05 UTC).
 *
 * 주간 추첨의 **1단계**: 그 주 자격 충족자 명단을 스냅샷으로 고정한다.
 * 추첨(2단계)은 운영자가 어드민에서 직접 돌린다 — 뽑는 장면을 보여주기 위함.
 *
 * 명단을 미리 못 박는 이유: 운영자가 추첨을 직접 하면 "명단을 그때 만든 것 아니냐"는
 * 의심이 생긴다. snapshot_at 과 candidates_hash 가 남아 있으면 그 의심이 성립하지 않는다.
 *
 * (event_id, week_start) unique — 재실행해도 명단을 덮어쓰지 않는다(이미 있으면 no-op).
 */

export async function GET(request: NextRequest) {
  return run(request)
}
export async function POST(request: NextRequest) {
  return run(request)
}

async function run(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  try {
    const supabase = createServiceRoleClient()
    const event = await fetchOpenSeasonEvent(supabase)

    const now = new Date()
    if (!event || event.status !== "open") {
      return NextResponse.json({ ok: true, skipped: "이벤트 미오픈" })
    }
    if (new Date(event.start_at) > now || new Date(event.end_at) < now) {
      return NextResponse.json({ ok: true, skipped: "이벤트 기간 아님" })
    }

    const weekStart = kstWeekStart(now)

    // 이미 확정했으면 덮어쓰지 않는다 — 명단이 바뀌면 공정성 근거가 사라진다
    const { data: existing } = await supabase
      .from("season_weekly_draws")
      .select("id, candidate_count, drawn_at")
      .eq("event_id", event.id)
      .eq("week_start", weekStart)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({
        ok: true,
        skipped: "이미 확정됨",
        weekStart,
        candidateCount: existing.candidate_count,
        drawn: Boolean(existing.drawn_at),
      })
    }

    const candidates = await buildCandidates(supabase)

    const { error } = await supabase.from("season_weekly_draws").insert({
      event_id: event.id,
      week_start: weekStart,
      candidates,
      candidate_count: candidates.length,
      candidates_hash: hashCandidates(candidates.map((c) => c.user_id)),
      snapshot_at: now.toISOString(),
      winner_count: WEEKLY_WINNER_COUNT,
    })
    if (error) {
      return apiError("후보 확정 저장 실패", 500, error)
    }

    return NextResponse.json({ ok: true, weekStart, candidateCount: candidates.length })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
