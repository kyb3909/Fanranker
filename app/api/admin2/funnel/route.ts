import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin2/funnel?days=30 — 유입 채널별 온보딩 퍼널.
 *
 * 유튜버에게 "당신 채널에서 N명이 왔고 M명이 정착했다"를 주기 위한 리포트다.
 * 채널 협업을 이어가려면 숫자를 돌려줘야 하고, 우리는 어느 채널을 더 밀지 결정해야 한다.
 *
 * 전환율은 **가입자 기준**이다 — 랜딩 도달은 GA4 에만 있고(비로그인은 user_id 가 없다)
 * 여기 원장은 가입한 사람부터 추적한다. 랜딩→가입은 GA4 landing_view 로 본다.
 *
 * 지표는 전권(admin) 전용이다 — editor 에게 열 이유가 없다.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminApi()
  if (isErrorResponse(auth)) return auth
  const { supabase } = auth

  const daysRaw = Number(new URL(request.url).searchParams.get("days") ?? 30)
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.trunc(daysRaw), 1), 365) : 30
  const since = new Date(Date.now() - days * 86400_000).toISOString()

  const { data, error } = await supabase
    .from("user_acquisition")
    .select("utm_source, utm_campaign, signup_at, first_slip_at, first_post_at, first_comment_at")
    .gte("signup_at", since)
    .limit(20000)

  if (error) {
    console.error("[admin2/funnel] 조회 실패:", error.message)
    return NextResponse.json({ error: "퍼널 조회에 실패했습니다." }, { status: 500 })
  }

  type Row = {
    channel: string
    signups: number
    firstSlip: number
    community: number
    both: number
  }
  const byChannel = new Map<string, Row>()

  for (const r of data ?? []) {
    const channel = r.utm_source || "귀속 불명"
    const row = byChannel.get(channel) ?? {
      channel,
      signups: 0,
      firstSlip: 0,
      community: 0,
      both: 0,
    }
    row.signups += 1
    const slipped = Boolean(r.first_slip_at)
    // "게시판 첫 활동" = 글이든 댓글이든 하나라도. 이벤트 응모 조건과 같은 정의.
    const engaged = Boolean(r.first_post_at || r.first_comment_at)
    if (slipped) row.firstSlip += 1
    if (engaged) row.community += 1
    if (slipped && engaged) row.both += 1
    byChannel.set(channel, row)
  }

  const channels = [...byChannel.values()].sort((a, b) => b.signups - a.signups)
  const totals = channels.reduce(
    (acc, c) => ({
      channel: "전체",
      signups: acc.signups + c.signups,
      firstSlip: acc.firstSlip + c.firstSlip,
      community: acc.community + c.community,
      both: acc.both + c.both,
    }),
    { channel: "전체", signups: 0, firstSlip: 0, community: 0, both: 0 }
  )

  return NextResponse.json({ days, channels, totals })
}
