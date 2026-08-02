import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { NEWS_BOT_USER_ID } from "@/lib/news/publish"
import {
  buildCandidates,
  drawWinners,
  fetchOpenSeasonEvent,
  hashCandidates,
  kstWeekStart,
  WEEKLY_WINNER_COUNT,
  type DrawCandidate,
  type DrawWinner,
} from "@/lib/event/weekly-draw"

export const dynamic = "force-dynamic"

/**
 * 주간 추첨 어드민 API — 운영자가 **추첨하는 장면을 보여주기 위한** 2단계 중 2단계.
 *
 *  GET  : 이번 회차 상태 (후보 명단·확정 시각·해시, 추첨했으면 당첨자까지)
 *  POST : 추첨 실행. **당첨자는 여기(서버)서 정해진다** — 화면 애니메이션은 이미 정해진
 *         결과로 달려가는 연출일 뿐이다. 클라이언트 난수로 뽑으면 조작이 가능하고
 *         검증도 안 되기 때문이다. 결과가 고정이라 녹화 실패 시 몇 번이든 재생 가능.
 *
 * 이미 추첨했으면 재추첨하지 않고 기존 결과를 그대로 돌려준다(멱등).
 */

const FREE_BOARD_CATEGORY_ID = "f151f1fe-8d73-4e84-bfb2-b3e5680f226c"
const FREE_BOARD_SLUG = "free-board"

export async function GET() {
  const authed = await requireAdminApi()
  if (isErrorResponse(authed)) return authed
  const { supabase } = authed

  try {
    const event = await fetchOpenSeasonEvent(supabase)
    if (!event) return NextResponse.json({ ok: true, event: null })

    const weekStart = kstWeekStart()
    const { data: row } = await supabase
      .from("season_weekly_draws")
      .select("*")
      .eq("event_id", event.id)
      .eq("week_start", weekStart)
      .maybeSingle()

    return NextResponse.json({
      ok: true,
      event: { status: event.status },
      weekStart,
      draw: row ?? null,
    })
  } catch (error) {
    return apiError("조회 중 오류가 발생했습니다.", 500, error)
  }
}

export async function POST(request: NextRequest) {
  const authed = await requireAdminApi()
  if (isErrorResponse(authed)) return authed
  const { supabase, userId } = authed

  try {
    const body = await request.json().catch(() => ({}))
    /** 후보 스냅샷이 아직 없을 때만 허용 — 리허설·긴급 시 즉석 확정 */
    const allowSnapshotNow = body?.snapshot_if_missing === true
    const announce = body?.announce !== false

    const event = await fetchOpenSeasonEvent(supabase)
    if (!event) return apiBadRequest("이벤트를 찾을 수 없습니다.")

    const weekStart = kstWeekStart()
    const { data: row } = await supabase
      .from("season_weekly_draws")
      .select("*")
      .eq("event_id", event.id)
      .eq("week_start", weekStart)
      .maybeSingle()

    // 이미 추첨했으면 그대로 반환 (재추첨 금지 — 결과가 바뀌면 신뢰가 깨진다)
    if (row?.drawn_at) {
      return NextResponse.json({
        ok: true,
        alreadyDrawn: true,
        weekStart,
        candidates: row.candidates as DrawCandidate[],
        winners: row.winners as DrawWinner[],
        candidatesHash: row.candidates_hash,
      })
    }

    let drawRow = row
    if (!drawRow) {
      if (!allowSnapshotNow) {
        return apiBadRequest("이번 주 후보가 아직 확정되지 않았습니다. (월요일 cron 이 확정합니다)")
      }
      const candidates = await buildCandidates(supabase)
      const { data: inserted, error } = await supabase
        .from("season_weekly_draws")
        .insert({
          event_id: event.id,
          week_start: weekStart,
          candidates,
          candidate_count: candidates.length,
          candidates_hash: hashCandidates(candidates.map((c) => c.user_id)),
          snapshot_at: new Date().toISOString(),
          winner_count: WEEKLY_WINNER_COUNT,
        })
        .select("*")
        .single()
      if (error) return apiError("후보 확정에 실패했습니다.", 500, error)
      drawRow = inserted
    }

    const candidates = (drawRow.candidates ?? []) as DrawCandidate[]
    if (candidates.length === 0) {
      return apiBadRequest("자격을 충족한 후보가 없습니다.")
    }

    const winners = drawWinners(candidates, drawRow.winner_count ?? WEEKLY_WINNER_COUNT)

    let announcedPostId: string | null = null
    if (announce) {
      const names = winners.map((w) => w.nickname).join(", ")
      const { data: post } = await supabase
        .from("posts")
        .insert({
          user_id: NEWS_BOT_USER_ID,
          category_id: FREE_BOARD_CATEGORY_ID,
          community_slug: FREE_BOARD_SLUG,
          title: `🎁 ${weekStart} 주간 추첨 결과 — ${winners.length}명 당첨!`,
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: `응모 자격을 충족한 ${candidates.length}명 중 ${winners.length}명을 추첨했습니다. 축하드립니다 — ${names}`,
                  },
                ],
              },
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "기프티콘은 운영자가 개별 연락으로 전달합니다. 다음 추첨도 매주 월요일이며, 예측과 커뮤니티 활동으로 응모 자격을 채우면 자동 응모됩니다.",
                  },
                ],
              },
            ],
          },
        })
        .select("id")
        .maybeSingle()
      announcedPostId = post?.id ?? null
    }

    const { error: updateErr } = await supabase
      .from("season_weekly_draws")
      .update({
        winners,
        drawn_at: new Date().toISOString(),
        drawn_by: userId,
        announced_post_id: announcedPostId,
      })
      .eq("id", drawRow.id)
    if (updateErr) return apiError("추첨 결과 저장에 실패했습니다.", 500, updateErr)

    return NextResponse.json({
      ok: true,
      weekStart,
      candidates,
      winners,
      candidatesHash: drawRow.candidates_hash,
      announcedPostId,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
