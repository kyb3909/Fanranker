import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { notifyDiscordOps } from "@/lib/discord-notify"

export const dynamic = "force-dynamic"

/**
 * GET/POST /api/cron/ops-monitor  (CRON_SECRET, vercel.json 30분 주기)
 *
 * DB 헬스 신호를 점검해 이상 시 디스코드 운영 채널로 알림.
 * - 크롤링 이슈: betman 동기화 지연 / 뉴스 크롤러(티커) 지연 (Vultr cron 이 죽으면 DB가
 *   안 갱신되므로 신선도로 감지 — 민감한 Vultr 스크립트를 건드리지 않음)
 * - 미정산 이슈: 경기 결과 나왔는데 pending 인 고아 예측 (settle-pending 안전망이 못 잡은 것)
 *
 * 이상 없으면 알림 없음. 지속 이상은 30분마다 재알림(아웃티지 리마인드).
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gongnori.fan"
const H = 3600000

export async function POST(req: NextRequest) {
  const authError = verifyCronSecret(req)
  if (authError) return authError

  const supabase = createServiceRoleClient()
  const issues: { name: string; value: string }[] = []

  // 1) betman 동기화 지연 (> 3시간)
  try {
    const { data: sync } = await supabase
      .from("betman_sync_state")
      .select("last_checked_at, last_error")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ last_checked_at: string | null; last_error: string | null }>()
    const ageH = sync?.last_checked_at
      ? (Date.now() - new Date(sync.last_checked_at).getTime()) / H
      : Infinity
    if (ageH > 3) {
      issues.push({
        name: "🕷️ betman 동기화 지연",
        value: Number.isFinite(ageH)
          ? `마지막 체크 ${Math.round(ageH)}시간 전${sync?.last_error ? ` · ${sync.last_error}` : ""}`
          : "동기화 상태 없음",
      })
    }
  } catch (e) {
    console.error("ops-monitor betman check 실패:", e)
  }

  // 2) 뉴스 크롤러(티커) 지연 (> 2시간; Vultr 크롤러 10분 주기)
  try {
    const { data: ticker } = await supabase
      .from("news_ticker_items")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ updated_at: string | null }>()
    const ageH = ticker?.updated_at
      ? (Date.now() - new Date(ticker.updated_at).getTime()) / H
      : Infinity
    if (ageH > 2) {
      issues.push({
        name: "🕷️ 뉴스 크롤러 지연",
        value: Number.isFinite(ageH)
          ? `마지막 갱신 ${Math.round(ageH)}시간 전`
          : "티커 데이터 없음",
      })
    }
  } catch (e) {
    console.error("ops-monitor ticker check 실패:", e)
  }

  // 3) 미정산 고아 — 경기 결과 확정 + 종료 1시간 경과인데 pending
  try {
    const cutoff = new Date(Date.now() - H).toISOString()
    const { count } = await supabase
      .from("betman_predictions")
      .select("id, betman_games!inner(result, match_time)", { count: "exact", head: true })
      .eq("status", "pending")
      .not("betman_games.result", "is", null)
      .lt("betman_games.match_time", cutoff)
    if ((count ?? 0) > 0) {
      issues.push({
        name: "💸 미정산(고아) 예측",
        value: `${count}건 — 경기 끝났는데 pending. settle-pending 점검 필요`,
      })
    }
  } catch (e) {
    console.error("ops-monitor orphan check 실패:", e)
  }

  if (issues.length > 0) {
    await notifyDiscordOps({
      level: "alert",
      title: "⚠️ 운영 점검 필요",
      description: "자동 점검에서 이상이 감지됐어요. (30분마다 재확인)",
      url: `${SITE}/admin/operations`,
      fields: issues,
    })
  }

  return NextResponse.json({ ok: true, issues: issues.length, detail: issues })
}

// Vercel cron 은 GET 호출 (CRON_SECRET 헤더 동일 검증)
export const GET = POST
