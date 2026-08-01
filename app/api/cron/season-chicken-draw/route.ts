import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError } from "@/lib/api-error"
import { SEASON_EVENT_SLUG } from "@/lib/event/season-stats"
import { NEWS_BOT_USER_ID } from "@/lib/news/publish"

export const dynamic = "force-dynamic"

/**
 * GET/POST /api/cron/season-chicken-draw — 매일 23:10 KST (14:10 UTC).
 *
 * 데일리 치킨 추첨 (설계 §2b): 집계 창(전일 23:00 ~ 당일 23:00 KST)에 10자 이상
 * 댓글을 1개라도 쓴 이벤트 참가자 중 1명 균등 추첨 — 댓글 수와 무관하게 응모권
 * 1장 (도배 유인 제거). 당첨자는 봇 계정으로 담벼락(자유게시판) 발표 글 +
 * 디스코드(DISCORD_EVENT_WEBHOOK_URL, 미설정 시 스킵).
 *
 * (event_id, draw_date) unique — 재실행해도 이중 추첨 없음.
 */

const FREE_BOARD_CATEGORY_ID = "f151f1fe-8d73-4e84-bfb2-b3e5680f226c"
const FREE_BOARD_SLUG = "free-board"

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

    const now = new Date()
    if (!event || event.status !== "open") {
      return NextResponse.json({ ok: true, skipped: "이벤트 미오픈" })
    }
    if (new Date(event.start_at) > now || new Date(event.end_at) < now) {
      return NextResponse.json({ ok: true, skipped: "이벤트 기간 아님" })
    }

    // 집계 창: 전일 23:00 ~ 당일 23:00 KST. draw_date = 당일(KST).
    const kstNow = new Date(now.getTime() + 9 * 3600 * 1000)
    const kstMidnightUtc = Date.UTC(
      kstNow.getUTCFullYear(),
      kstNow.getUTCMonth(),
      kstNow.getUTCDate()
    )
    const windowEnd = new Date(kstMidnightUtc + 23 * 3600 * 1000 - 9 * 3600 * 1000)
    const windowStart = new Date(windowEnd.getTime() - 24 * 3600 * 1000)
    const drawDate = kstNow.toISOString().slice(0, 10)

    // 이미 추첨했으면 no-op (재실행 안전)
    const { data: existing } = await supabase
      .from("season_chicken_draws")
      .select("id")
      .eq("event_id", event.id)
      .eq("draw_date", drawDate)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ ok: true, skipped: "이미 추첨됨", drawDate })
    }

    // 응모자: 창 내 10자 이상 미삭제 댓글을 쓴 등록자 (댓글 수 무관 1표)
    const { data: regs } = await supabase
      .from("event_registrations")
      .select("user_id")
      .eq("event_id", event.id)
    const registrants = (regs ?? []).map((r) => r.user_id)
    if (registrants.length === 0) {
      return NextResponse.json({ ok: true, skipped: "등록자 없음", drawDate })
    }

    const entrants = new Map<string, number>()
    // 등록자 수가 커져도 URL 한계를 안 넘게 청크로 조회
    for (let i = 0; i < registrants.length; i += 100) {
      const chunk = registrants.slice(i, i + 100)
      const { data: comments } = await supabase
        .from("comments")
        .select("user_id, content")
        .in("user_id", chunk)
        .gte("created_at", windowStart.toISOString())
        .lt("created_at", windowEnd.toISOString())
        .is("deleted_at", null)
      for (const c of comments ?? []) {
        if ((c.content ?? "").trim().length < 10) continue
        entrants.set(c.user_id, (entrants.get(c.user_id) ?? 0) + 1)
      }
    }

    if (entrants.size === 0) {
      return NextResponse.json({ ok: true, skipped: "응모자 없음", drawDate })
    }

    // 균등 추첨 (댓글 수와 무관하게 1인 1표)
    const pool = [...entrants.keys()]
    const winnerId = pool[crypto.getRandomValues(new Uint32Array(1))[0] % pool.length]
    const winnerComments = entrants.get(winnerId) ?? 1

    const { data: profile } = await supabase
      .from("profiles")
      .select("nickname")
      .eq("user_id", winnerId)
      .maybeSingle()
    const nickname = profile?.nickname ?? "이름 없는 팬"

    // 발표 글 (봇 계정, 자유게시판)
    const title = `🍗 오늘의 치킨 — ${nickname}님 당첨!`
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: `${drawDate} 데일리 치킨 추첨 결과, 오늘 댓글을 남긴 ${entrants.size}명 중 ${nickname}님이 당첨됐습니다. 축하드립니다! 기프티콘은 운영자가 개별 연락으로 전달합니다.`,
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "내일도 밤 11시에 추첨합니다 — 그날 댓글 1개(10자 이상)면 자동 응모, 댓글 수와 무관하게 1인 1표입니다.",
            },
          ],
        },
      ],
    }
    const { data: post } = await supabase
      .from("posts")
      .insert({
        user_id: NEWS_BOT_USER_ID,
        category_id: FREE_BOARD_CATEGORY_ID,
        community_slug: FREE_BOARD_SLUG,
        title,
        content,
      })
      .select("id")
      .maybeSingle()

    const { error: drawErr } = await supabase.from("season_chicken_draws").insert({
      event_id: event.id,
      draw_date: drawDate,
      user_id: winnerId,
      entrant_count: entrants.size,
      winner_comment_count: winnerComments,
      announced_post_id: post?.id ?? null,
    })
    if (drawErr) {
      // unique 경합 = 동시 실행 — 발표 글이 중복됐을 수 있으니 에러로 노출
      return apiError("추첨 기록 저장 실패", 500, drawErr)
    }

    // 디스코드 발표 (웹훅 미설정이면 조용히 스킵)
    const webhook = process.env.DISCORD_EVENT_WEBHOOK_URL
    if (webhook) {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [
            {
              title: `🍗 오늘의 치킨 — ${nickname}님 당첨!`,
              description: `오늘 댓글 응모 ${entrants.size}명 중 추첨. 내일도 댓글 1개면 자동 응모!`,
              url: post?.id
                ? `https://gongnori.fan/post/${post.id}`
                : "https://gongnori.fan/season",
              color: 0x961e37,
            },
          ],
        }),
      }).catch(() => {})
    }

    return NextResponse.json({
      ok: true,
      drawDate,
      winner: winnerId,
      entrants: entrants.size,
      postId: post?.id ?? null,
    })
  } catch (e) {
    return apiError("치킨 추첨 중 오류가 발생했습니다.", 500, e)
  }
}
