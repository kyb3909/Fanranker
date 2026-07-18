import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"
import { getDailyWindow, formatDailyIdLabel } from "@/lib/betman/daily-round"
import { sendDailyDigest, withDiscordUtm } from "@/lib/discord/news-notify"

/**
 * POST /api/cron/discord-daily-digest — 매일 23:05 KST (14:05 UTC)
 *
 * 디스코드 뉴스봇 서버 데일리 다이제스트: 볼 리셋(23:00) + 슬레이트 flip(23:00) 직후
 * "볼 충전 + 새로 열린 경기 + 인기 뉴스"를 1건 발송. 설계: docs/DISCORD_NEWSBOT_DESIGN.md
 *
 * DISCORD_DIGEST_WEBHOOK_URL 미설정 시 skip (서버 개설 전 no-op).
 * 경기 0 + 뉴스 0 이면 발송하지 않는다 (빈 다이제스트 = 노이즈).
 */

/** 발행 뉴스 작성자 봇 계정 (app/api/admin/news-review/route.ts 와 동일) */
const NEWS_BOT_USER_ID = "user_bot_soccer_kr"
const MAX_GAMES = 8
const MAX_NEWS = 3

const SPORT_EMOJI: Record<string, string> = {
  축구: "⚽",
  야구: "⚾",
  농구: "🏀",
  배구: "🏐",
}

function formatKickoffKST(matchTime: string): string {
  const kst = new Date(new Date(matchTime).getTime() + 9 * 60 * 60 * 1000)
  const hh = String(kst.getUTCHours()).padStart(2, "0")
  const mm = String(kst.getUTCMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    if (!process.env.DISCORD_DIGEST_WEBHOOK_URL) {
      return NextResponse.json({ success: true, skipped: "웹훅 미설정" })
    }

    const supabase = createServiceRoleClient()
    const { start: windowStart, end: windowEnd, dailyId } = getDailyWindow()

    // --- 이벤트 경기 풀 제외 (메인 /prediction 과 동일 규칙 — 링크 정합성) ---
    const { data: activeEvents } = await supabase
      .from("events")
      .select("league_codes")
      .neq("status", "closed")
    const excludeCodes = [
      ...new Set((activeEvents ?? []).flatMap((e) => (e.league_codes ?? []) as string[])),
    ].filter(Boolean)

    // --- 새 슬레이트 경기 (당일 08:00 초과 ~ 익일 08:00 이하, scheduled) ---
    let gamesQuery = supabase
      .from("betman_games")
      .select("match_time, sport, home_team_name, away_team_name")
      .eq("status", "scheduled")
      .neq("home_team_name", "미정")
      .neq("away_team_name", "미정")
      .not("home_team_name", "is", null)
      .not("away_team_name", "is", null)
      .gt("match_time", windowStart.toISOString())
      .lte("match_time", windowEnd.toISOString())
      .order("match_time", { ascending: true })
    if (excludeCodes.length > 0) {
      gamesQuery = gamesQuery.or(
        `league_code.is.null,league_code.not.in.(${excludeCodes.join(",")})`
      )
    }
    const { data: gameRows, error: gamesError } = await gamesQuery
    if (gamesError) {
      return apiError("경기 목록 조회 실패", 500, gamesError)
    }

    // 마켓 행(일반/핸디캡/언더오버/전반전 중복) → 매치 단위 dedupe
    const seen = new Set<string>()
    const gameLines: string[] = []
    for (const g of gameRows ?? []) {
      const key = `${g.match_time}|${g.home_team_name}|${g.away_team_name}`
      if (seen.has(key)) continue
      seen.add(key)
      if (gameLines.length >= MAX_GAMES) continue
      const emoji = SPORT_EMOJI[g.sport as string] ?? "🏟️"
      gameLines.push(
        `${emoji} ${g.home_team_name} vs ${g.away_team_name} — ${formatKickoffKST(g.match_time as string)}`
      )
    }
    const totalMatches = seen.size
    if (totalMatches > MAX_GAMES) {
      gameLines.push(`… 외 ${totalMatches - MAX_GAMES}경기 더`)
    }

    // --- 인기 뉴스 TOP 3 (최근 24h 공놀이봇 발행 글, 조회수순) ---
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: newsRows } = await supabase
      .from("posts")
      .select("id, title, view_count")
      .eq("user_id", NEWS_BOT_USER_ID)
      .is("deleted_at", null)
      .gte("created_at", since)
      .order("view_count", { ascending: false })
      .limit(MAX_NEWS)
    const newsLines = (newsRows ?? []).map(
      (p) => `[${String(p.title).slice(0, 80)}](${withDiscordUtm(`/post/${p.id}`, "digest")})`
    )

    if (gameLines.length === 0 && newsLines.length === 0) {
      return NextResponse.json({ success: true, skipped: "경기·뉴스 모두 없음" })
    }

    const sent = await sendDailyDigest({
      dateLabel: formatDailyIdLabel(dailyId),
      gameLines,
      newsLines,
    })

    return NextResponse.json({
      success: true,
      sent,
      dailyId,
      matches: totalMatches,
      news: newsLines.length,
    })
  } catch (error) {
    return apiError("Internal server error", 500, error)
  }
}

/** Vercel Cron 은 GET 으로 호출 — POST 로 위임 (daily-token-reset 과 동일 패턴) */
export const GET = withCronLog("discord-daily-digest", (request: NextRequest) => POST(request))
