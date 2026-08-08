import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

/**
 * POST /api/attribution — 가입 직후 최초 터치 채널을 원장에 올린다.
 *
 * 클라이언트가 첫 방문 때 localStorage 에 박아둔 값을 그대로 전달한다
 * (lib/analytics/attribution). 서버는 신뢰 대신 **최초 1회만 기록**하는 것으로
 * 방어한다 — 이미 귀속이 있는 유저는 어떤 값을 보내도 덮이지 않는다.
 *
 * 실패해도 가입은 성공이어야 하므로 호출부는 이 응답을 기다리되 무시한다.
 */
const AttributionSchema = z.object({
  source: z.string().max(120),
  medium: z.string().max(120).nullable().optional(),
  campaign: z.string().max(120).nullable().optional(),
  content: z.string().max(120).nullable().optional(),
  term: z.string().max(120).nullable().optional(),
  referrerHost: z.string().max(255).nullable().optional(),
  landingPath: z.string().max(512).optional(),
  firstSeenAt: z.string().datetime().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = AttributionSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.issues[0]?.message || "잘못된 입력입니다.")
    }
    const a = parsed.data

    const record = {
      utm_source: a.source,
      utm_medium: a.medium ?? null,
      utm_campaign: a.campaign ?? null,
      utm_content: a.content ?? null,
      utm_term: a.term ?? null,
      referrer_host: a.referrerHost ?? null,
      landing_path: a.landingPath ?? null,
      first_seen_at: a.firstSeenAt ?? null,
      signup_at: new Date().toISOString(),
    }

    const supabase = createServiceRoleClient()

    // 1) 행 확보 — 이미 있으면 건드리지 않는다(ON CONFLICT DO NOTHING).
    const { error: insertError } = await supabase
      .from("user_acquisition")
      .upsert({ user_id: user.id, ...record }, { onConflict: "user_id", ignoreDuplicates: true })
    if (insertError) {
      console.error("[attribution] insert 실패:", insertError.message)
      return apiError("귀속 기록에 실패했습니다.", 500, insertError)
    }

    // 2) 퍼널 단계가 먼저 기록돼 빈 행이 만들어진 경우에만 채운다.
    //    (utm_source 가 이미 있으면 최초 귀속이 존재하는 것이므로 덮지 않는다)
    const { error: fillError } = await supabase
      .from("user_acquisition")
      .update(record)
      .eq("user_id", user.id)
      .is("utm_source", null)
    if (fillError) {
      // 귀속은 소급 불가 지표 — 조용한 유실은 개막 유입 데이터 공백이 된다
      // (2026-08-08 감사 P1-7: console 로그만 있어 실패가 무증상이었음)
      console.error("[attribution] backfill 실패:", fillError.message)
      Sentry.captureException(fillError, { extra: { stage: "attribution_backfill" } })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[attribution] 예외:", e)
    return apiError("귀속 기록에 실패했습니다.", 500, e)
  }
}
