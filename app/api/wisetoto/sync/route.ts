import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"

const WISETOTO_BASE = "https://www.wisetoto.com"
const SPORT_CODES = ["sc", "bs", "bk", "vl"] as const
const SYNC_COOLDOWN_MS = 25_000 // 25초 rate limit

interface WiseTotoGame {
  gm_no: string
  h_score: string | null
  a_score: string | null
}

/**
 * GET /api/wisetoto/sync
 *
 * Vercel에서 직접 wisetoto.com 점수 조회 + DB 업데이트 + 라이브룸 상태 동기화.
 * 25초 rate limit으로 중복 요청 방지.
 * 프론트엔드에서 30초마다 폴링, Vercel cron 1분 백업.
 */
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  // Vercel cron 또는 브라우저 폴링 허용
  // Origin 체크: 프로덕션 도메인 또는 Vercel cron (origin 없음)
  const origin = request.headers.get("origin")
  const isVercelCron = !origin && request.headers.get("user-agent")?.includes("vercel-cron")
  const isAllowedOrigin =
    !origin ||
    origin.includes("localhost") ||
    origin.includes("community-app-brown.vercel.app") ||
    origin.includes("fanranker")

  if (!isAllowedOrigin && !isVercelCron) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const supabase = createServiceRoleClient()

    // ── Rate limit 체크 ──
    const { data: syncState } = await supabase
      .from("betman_sync_state")
      .select("id, last_score_sync_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single()

    const lastSync = syncState?.last_score_sync_at
      ? new Date(syncState.last_score_sync_at).getTime()
      : 0
    const now = Date.now()

    if (now - lastSync < SYNC_COOLDOWN_MS) {
      // 최근에 이미 동기화됨 → 스킵하되 라이브룸 상태만 갱신
      await Promise.resolve(supabase.rpc("sync_live_room_status")).catch(() => {})
      return NextResponse.json({ synced: false, reason: "cooldown" })
    }

    // ── Timestamp 선점 (optimistic lock) ──
    if (syncState?.id) {
      await supabase
        .from("betman_sync_state")
        .update({ last_score_sync_at: new Date().toISOString() })
        .eq("id", syncState.id)
    }

    // ── 활성 라운드 조회 ──
    const { data: activeRounds } = await supabase
      .from("betman_rounds")
      .select("id, gm_ts")
      .in("status", ["open", "closed"])
      .order("gm_ts", { ascending: false })
      .limit(5)

    if (!activeRounds || activeRounds.length === 0) {
      // 활성 라운드 없어도 시간 기반 상태 전환은 실행
      await updateScheduledGames(supabase)
      await Promise.resolve(supabase.rpc("sync_live_room_status")).catch(() => {})
      return NextResponse.json({ synced: true, updated: 0, reason: "no_active_rounds" })
    }

    // ── WiseToto 점수 수집 ──
    const gameYear = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
    ).getFullYear()

    let totalUpdated = 0

    for (const round of activeRounds) {
      const roundMap = new Map([[round.gm_ts, round.id]])

      for (const sportCode of SPORT_CODES) {
        try {
          const scores = await fetchWiseTotoScores(gameYear, round.gm_ts, sportCode)
          if (scores.length === 0) continue

          for (const s of scores) {
            const roundId = roundMap.get(round.gm_ts)
            if (!roundId) continue

            const { data: rows } = await supabase
              .from("betman_games")
              .update({
                home_score: s.homeScore,
                away_score: s.awayScore,
                status: "in_progress",
                updated_at: new Date().toISOString(),
              })
              .eq("round_id", roundId)
              .eq("game_no", s.gameNo)
              .in("status", ["scheduled", "in_progress"])
              .select("id")

            if (rows && rows.length > 0) totalUpdated++
          }
        } catch {
          // 개별 종목 실패는 무시하고 계속
        }
      }
    }

    // ── 시간 기반 상태 전환 ──
    await updateScheduledGames(supabase)

    // ── 라이브룸 상태 동기화 ──
    await Promise.resolve(supabase.rpc("sync_live_room_status")).catch(() => {})

    return NextResponse.json({
      synced: true,
      updated: totalUpdated,
      rounds: activeRounds.length,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    return apiError("wisetoto 동기화 오류", 500, e)
  }
}

/** 시작 시간이 지난 scheduled 경기를 in_progress로 전환 */
async function updateScheduledGames(supabase: ReturnType<typeof createServiceRoleClient>) {
  const now = new Date().toISOString()
  await supabase
    .from("betman_games")
    .update({ status: "in_progress", updated_at: now })
    .eq("status", "scheduled")
    .lt("match_time", now)
}

/** WiseToto API에서 특정 라운드/종목의 점수 조회 */
async function fetchWiseTotoScores(
  gameYear: number,
  gameRound: string,
  sportCode: string
): Promise<{ gameNo: number; homeScore: number; awayScore: number }[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(`${WISETOTO_BASE}/util/gameinfo/get_proto_list.htm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: WISETOTO_BASE,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: `game_year=${gameYear}&game_round=${gameRound}&game_code=${sportCode}`,
      signal: controller.signal,
    })

    if (!res.ok) return []

    const data: WiseTotoGame[] = await res.json()
    if (!Array.isArray(data)) return []

    return data
      .filter((g) => g.h_score != null && g.h_score !== "" && g.a_score != null && g.a_score !== "")
      .map((g) => ({
        gameNo: Number(g.gm_no),
        homeScore: Number(g.h_score),
        awayScore: Number(g.a_score),
      }))
      .filter((g) => !isNaN(g.gameNo) && !isNaN(g.homeScore) && !isNaN(g.awayScore))
  } finally {
    clearTimeout(timeout)
  }
}
