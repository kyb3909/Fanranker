import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError } from "@/lib/api-error"
import { NEWS_BOT_USER_ID } from "@/lib/news/publish"
import {
  buildCandidates,
  drawWinners,
  resolveWeeklyDuel,
  fetchOpenSeasonEvent,
  hashCandidates,
  kstWeekStart,
  WEEKLY_WINNER_COUNT,
} from "@/lib/event/weekly-draw"

export const dynamic = "force-dynamic"

const FREE_BOARD_CATEGORY_ID = "f151f1fe-8d73-4e84-bfb2-b3e5680f226c"
const FREE_BOARD_SLUG = "free-board"

/**
 * GET/POST /api/cron/season-weekly-draw-snapshot — 매주 월요일 00:05 KST (일 15:05 UTC).
 *
 * 주간 경품 추첨을 **백단에서 끝낸다.** 자격 충족자(포인트 임계 + 커뮤니티 활동) 중
 * 1인 1표 균등으로 뽑아 저장하고 발표 글을 올린다.
 *
 * 뽑는 행위 자체를 보여주지는 않는다 — 어차피 조작이라 볼 사람은 무슨 장치를 붙여도
 * 그렇게 본다(운영자 판단 2026-08-03). 대신 **결과를 /season 랭킹 보드에서 애니메이션으로
 * 공개**해 발표를 이벤트답게 만든다 (components/season/weekly-draw-reveal).
 *
 * (event_id, week_start) unique + drawn_at 확인 — 재실행해도 이중 추첨 없음.
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

    const { data: existing } = await supabase
      .from("season_weekly_draws")
      .select("id, drawn_at, candidate_count")
      .eq("event_id", event.id)
      .eq("week_start", weekStart)
      .maybeSingle()
    if (existing?.drawn_at) {
      return NextResponse.json({
        ok: true,
        skipped: "이미 추첨됨",
        weekStart,
        candidateCount: existing.candidate_count,
      })
    }

    const candidates = await buildCandidates(supabase)
    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, skipped: "자격 충족자 없음", weekStart })
    }

    const winners = drawWinners(candidates, WEEKLY_WINNER_COUNT)
    const names = winners.map((w) => w.nickname).join(", ")

    // ── 크리에이터 주간 맞대결 ──
    // 그 주(직전 월요일 00:00 ~ 이번 월요일 00:00 KST) 범위 성적으로 승부를 가리고,
    // 이긴 팬덤의 응모 자격 충족자 중 1명에게 유니폼을 준다.
    // 스팀 추첨 당첨자와 중복되지 않게 제외한다 — 같은 날 두 개를 받으면 말이 나온다.
    // weekStart 는 이번 주 월요일(KST). 심판 구간은 그 직전 7일이다.
    const weekEnd = new Date(`${weekStart}T00:00:00+09:00`)
    const weekFrom = new Date(weekEnd.getTime() - 7 * 24 * 3600 * 1000)
    const duel = await resolveWeeklyDuel(supabase, { from: weekFrom, to: weekEnd })

    let uniformWinner: { user_id: string; nickname: string } | null = null
    if (duel.winner) {
      const steamIds = new Set(winners.map((w) => w.user_id))
      const pool = candidates.filter(
        (c) => !steamIds.has(c.user_id) && c.group_slug === duel.winner!.group_slug
      )
      uniformWinner = drawWinners(pool, 1)[0] ?? null
    }

    const { data: post } = await supabase
      .from("posts")
      .insert({
        user_id: NEWS_BOT_USER_ID,
        category_id: FREE_BOARD_CATEGORY_ID,
        community_slug: FREE_BOARD_SLUG,
        title: uniformWinner
          ? `🎁 이번 주 결과 — ${duel.winner?.nickname}님 승리, 유니폼은 ${uniformWinner.nickname}님!`
          : `🎁 이번 주 추첨 결과 — ${winners.length}명 당첨!`,
        content: {
          type: "doc",
          content: [
            ...(duel.winner
              ? [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: uniformWinner
                          ? `이번 주 맞대결은 ${duel.winner.nickname}님이 가져갔습니다. 승리 팬덤에서 추첨한 유니폼 주인공은 ${uniformWinner.nickname}님입니다. 축하드립니다!`
                          : `이번 주 맞대결은 ${duel.winner.nickname}님이 가져갔습니다. 다만 승리 팬덤에 응모 자격을 갖춘 분이 없어 이번 주 유니폼은 나가지 않았습니다.`,
                      },
                    ],
                  },
                ]
              : []),
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

    const payload = {
      event_id: event.id,
      week_start: weekStart,
      candidates,
      candidate_count: candidates.length,
      candidates_hash: hashCandidates(candidates.map((c) => c.user_id)),
      snapshot_at: now.toISOString(),
      winners,
      winner_count: WEEKLY_WINNER_COUNT,
      drawn_at: now.toISOString(),
      announced_post_id: post?.id ?? null,
      duel_winner_group_id: duel.winner?.group_id ?? null,
      duel_scores: duel.scores,
      uniform_winner: uniformWinner,
    }

    const { error } = existing
      ? await supabase.from("season_weekly_draws").update(payload).eq("id", existing.id)
      : await supabase.from("season_weekly_draws").insert(payload)
    if (error) return apiError("추첨 저장 실패", 500, error)

    return NextResponse.json({
      ok: true,
      weekStart,
      candidateCount: candidates.length,
      winners: winners.map((w) => w.nickname),
      duel: {
        winner: duel.winner?.group_slug ?? null,
        reason: duel.reason ?? null,
        scores: duel.scores.map((s) => `${s.group_slug}:${s.skill_score.toFixed(3)}`),
      },
      uniformWinner: uniformWinner?.nickname ?? null,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
