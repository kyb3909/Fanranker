import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { getClient, getPropertyId } from "@/lib/ga4/client"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * GET /api/cron/ga4-events-audit?days=14 — GA4 에 **실제로 도착한** 커스텀 이벤트 집계.
 *
 * ## 왜 있는가 (2026-08-12 패널 결론)
 * "배선이 있다"와 "이벤트가 잡힌다"는 다르다 — 이 저장소가 반복해서 배운 함정이다
 * (귀속: 코드는 고쳐졌는데 실행 0회 / 어휘: 정비했는데 공개 페이지 2곳 잔존).
 * 계측도 마찬가지다: trackEvent 는 window.gtag 이 없으면 **조용히 no-op** 이고,
 * 주간 리포트(weekly_analytics_reports)는 이벤트별 분해가 없어 어느 이벤트가
 * 죽었는지 보여주지 못한다. 이 라우트가 그 사각을 메운다.
 *
 * 개막(8/22) 유입의 성패 판정이 전부 이 분모에 걸려 있고, **개막일 숫자는 소급
 * 생성이 불가능하다** — 배포 후 즉시, 그리고 D-3 리허설에서 이걸 호출해
 * 3종(board_view / prediction_modal_* / post_read)이 실제로 잡히는지 확인한다.
 *
 * ## 스케줄 없음 (의도)
 * vercel.json 에 등록하지 않는 온디맨드 진단이다. CRON_SECRET 으로 수동 호출:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://gongnori.fan/api/cron/ga4-events-audit
 * withCronLog 는 호출 이력 관측용으로만 두고, 심박 감시(invariant-audit)는
 * vercel.json 미등록 크론을 검사하지 않으므로 오탐이 없다.
 */

/** lib/analytics/events.ts 의 AnalyticsEvent 유니온과 동기 — 여기 없는 이름은 '정의 밖' */
const DEFINED_EVENTS = [
  "landing_view",
  "signup_complete",
  "first_post",
  "first_prediction",
  "first_community_action",
  "board_view",
  "post_read",
  "prediction_submit",
  "prediction_success_modal",
  "prediction_modal_post_click",
  "prediction_modal_board_click",
  "prediction_modal_saga_click",
  "search",
  "metaverse_enter",
  "metaverse_plot_enter",
  "metaverse_chat_send",
  "metaverse_room_create",
  "metaverse_room_close",
  "metaverse_highbury_enter",
  "flair_team_selected",
  "discord_invite_click",
  "snack_feed_open",
  "snack_feed_depth",
  "snack_card_open_post",
  "cardnews_feed_open",
  "cardnews_card_open_post",
  "saga_view",
  "saga_vote",
  "vs_impression",
  "vs_vote",
  "motm_sheet_open",
] as const

async function handler(request: NextRequest) {
  const denied = verifyCronSecret(request)
  if (denied) return denied

  const days = Math.min(90, Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 14))

  let rows: { name: string; count: number }[]
  try {
    const [res] = await getClient().runReport({
      property: `properties/${getPropertyId()}`,
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      limit: 200,
    })
    rows = (res.rows ?? []).map((r) => ({
      name: r.dimensionValues?.[0]?.value ?? "",
      count: Number(r.metricValues?.[0]?.value ?? 0),
    }))
  } catch (e) {
    // GA4 자격증명 부재(로컬)나 API 장애 — 진단 도구이므로 원인을 그대로 돌려준다
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    )
  }

  const arrived = new Map(rows.map((r) => [r.name, r.count]))
  // 핵심은 이 목록이다: 정의·배선까지 있는데 GA4 에 한 번도 도착하지 않은 이벤트
  const definedButSilent = DEFINED_EVENTS.filter((n) => !arrived.has(n))
  const custom = DEFINED_EVENTS.filter((n) => arrived.has(n)).map((n) => ({
    name: n,
    count: arrived.get(n)!,
  }))

  return NextResponse.json({
    ok: true,
    days,
    // 침묵 목록이 첫 번째 — 이걸 보려고 만든 라우트다
    defined_but_silent: definedButSilent,
    custom_events: custom.sort((a, b) => b.count - a.count),
    ga_builtin_events: rows
      .filter((r) => !DEFINED_EVENTS.includes(r.name as (typeof DEFINED_EVENTS)[number]))
      .sort((a, b) => b.count - a.count),
  })
}

export const GET = withCronLog("ga4-events-audit", handler)
