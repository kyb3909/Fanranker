import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError } from "@/lib/api-error"
import { computeSeasonStandings, SEASON_EVENT_SLUG } from "@/lib/event/season-stats"

export const dynamic = "force-dynamic"

/**
 * GET/POST /api/cron/season-weekly-snapshot — 매주 월요일 00:00 KST (일 15:00 UTC).
 *
 * 팬덤 대항전 공개 정책(설계 §3): 팀 순위·평균 성적은 주 1회만 공개.
 * 이 cron 이 그 "발표 시점"이다 — 예측력 순위를 계산해 event_leaderboard_snapshots
 * 에 유저 단위로 저장하고, /season 발표 섹션은 최신 captured_at 묶음만 읽는다
 * (실시간 재계산 노출 금지 — 월드컵 스냅샷 컷오프 패턴의 주간 반복형).
 *
 * 이벤트가 open/closed 가 아니거나 아직 개막 전이면 no-op.
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

    const { data: event } = await supabase
      .from("events")
      .select("id, status, start_at, end_at")
      .eq("slug", SEASON_EVENT_SLUG)
      .maybeSingle()

    if (!event || event.status === "draft") {
      return NextResponse.json({ ok: true, skipped: "이벤트 미오픈" })
    }
    if (new Date(event.start_at) > new Date()) {
      return NextResponse.json({ ok: true, skipped: "개막 전" })
    }

    const { data: groups } = await supabase
      .from("event_groups")
      .select("id, slug")
      .eq("event_id", event.id)
    const groupIdBySlug = new Map((groups ?? []).map((g) => [g.slug, g.id]))

    const { users, userGroup } = await computeSeasonStandings(supabase)

    // 그룹 내 순위: 유효 참여자(qualified)만 순위 부여, 미달은 rank null
    const capturedAt = new Date().toISOString()
    const byGroup = new Map<string, typeof users>()
    for (const u of users) {
      const slug = userGroup.get(u.userId)
      if (!slug) continue
      const list = byGroup.get(slug) ?? []
      list.push(u)
      byGroup.set(slug, list)
    }

    const rows: Record<string, unknown>[] = []
    for (const [slug, list] of byGroup) {
      const groupId = groupIdBySlug.get(slug)
      if (!groupId) continue
      const qualified = list.filter((u) => u.qualified)
      qualified.forEach((u, i) => {
        rows.push({
          event_id: event.id,
          user_id: u.userId,
          group_id: groupId,
          captured_at: capturedAt,
          accuracy: u.hitRate,
          profit_rate: null,
          skill_score: u.skillScore,
          settled_slips: u.settledSlips,
          rank_in_group: i + 1,
          total_in_group: qualified.length,
        })
      })
    }

    if (rows.length > 0) {
      const { error: insertErr } = await supabase.from("event_leaderboard_snapshots").insert(rows)
      if (insertErr) {
        return apiError("스냅샷 저장 실패", 500, insertErr)
      }
    }

    return NextResponse.json({
      ok: true,
      capturedAt,
      snapshotRows: rows.length,
      qualifiedUsers: users.filter((u) => u.qualified).length,
      totalScoredUsers: users.length,
    })
  } catch (e) {
    return apiError("주간 스냅샷 중 오류가 발생했습니다.", 500, e)
  }
}
