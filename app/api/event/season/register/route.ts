import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, checkRateLimit } from "@/lib/api-error"

/**
 * POST /api/event/season/register — 시즌 오픈 팬덤 대항전 참가 등록.
 *
 * 월드컵 register 와 동일 골격이되 3팀(kop/blues/gooner) 허용.
 * - Clerk 로그인 필수, UNIQUE (event_id, user_id) — 팀 변경 불가 (설계 §3)
 * - traffic_source: 클라이언트가 최초 터치 UTM(channel)을 실어 보냄 — 유튜버별 귀속
 */

const EVENT_SLUG = "season-open-2026"

const RegisterSchema = z.object({
  group_slug: z.enum(["kop", "blues", "gooner"]),
  traffic_source: z.string().min(1).max(64).nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = RegisterSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.issues[0]?.message || "잘못된 입력입니다.")
    }
    const { group_slug, traffic_source } = parsed.data

    const supabase = createServiceRoleClient()

    const { data: event, error: eventErr } = await supabase
      .from("events")
      .select("id, status, registration_closes_at")
      .eq("slug", EVENT_SLUG)
      .maybeSingle()

    if (eventErr) {
      return apiError("이벤트 조회 중 오류가 발생했습니다.", 500, eventErr)
    }
    if (!event) {
      return NextResponse.json({ error: "이벤트를 찾을 수 없습니다." }, { status: 404 })
    }
    if (event.status === "draft") {
      return NextResponse.json({ error: "아직 등록 기간이 아닙니다." }, { status: 400 })
    }
    if (event.status === "closed") {
      return NextResponse.json({ error: "이벤트가 종료되었습니다." }, { status: 400 })
    }
    if (new Date(event.registration_closes_at) < new Date()) {
      return NextResponse.json({ error: "등록이 마감되었습니다." }, { status: 400 })
    }

    const { data: group, error: groupErr } = await supabase
      .from("event_groups")
      .select("id")
      .eq("event_id", event.id)
      .eq("slug", group_slug)
      .maybeSingle()

    if (groupErr) {
      return apiError("그룹 조회 중 오류가 발생했습니다.", 500, groupErr)
    }
    if (!group) {
      return apiBadRequest("올바르지 않은 팀입니다.")
    }

    const { data: existing } = await supabase
      .from("event_registrations")
      .select("group_id")
      .eq("event_id", event.id)
      .eq("user_id", user.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        {
          error: "이미 참가한 팀이 있습니다. 이벤트 중 팀 변경은 불가합니다.",
          already_registered: true,
        },
        { status: 409 }
      )
    }

    const { error: insertErr } = await supabase.from("event_registrations").insert({
      event_id: event.id,
      user_id: user.id,
      group_id: group.id,
      traffic_source: traffic_source ?? null,
    })

    if (insertErr) {
      if (insertErr.code === "23505") {
        return NextResponse.json(
          { error: "이미 참가한 팀이 있습니다.", already_registered: true },
          { status: 409 }
        )
      }
      return apiError("등록 중 오류가 발생했습니다.", 500, insertErr)
    }

    return NextResponse.json({ ok: true, group_slug, event_slug: EVENT_SLUG }, { status: 201 })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
