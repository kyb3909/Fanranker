import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, checkRateLimit } from "@/lib/api-error"

/**
 * POST /api/event/cog/register — 코그 채널 시청자 팬덤 대결 참가 등록.
 *
 * app/api/event/season/register 와 동일 골격. 다른 점은 두 가지뿐이다:
 *  ① EVENT_SLUG 가 cog-duel-2026
 *  ② group_slug 가 2진영 (blues=첼시/첼루키, kop=리버풀/리빅)
 *
 * ⚠️ 이 이벤트는 채널 합의 전이라 events.status = 'draft' 다. draft 는 아래에서
 *    400 으로 막히므로 **화면은 열려 있어도 실제 등록은 되지 않는다** — 의도된 상태다.
 *    합의 후 status 를 'open' 으로 올리는 순간 이 라우트가 그대로 살아난다.
 *
 * - Clerk 로그인 필수, UNIQUE (event_id, user_id) — 진영 변경 불가
 *   (유리한 쪽으로 갈아타는 것을 막는 게 이 대결의 전제)
 * - traffic_source: 클라이언트가 최초 터치 UTM(channel)을 실어 보냄 — 채널별 귀속.
 *   누락하면 첼루키/리빅 어느 쪽이 데려왔는지가 소급 불가로 증발한다.
 */

const EVENT_SLUG = "cog-duel-2026"

const RegisterSchema = z.object({
  group_slug: z.enum(["blues", "kop"]),
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
    // 채널 합의 전 스탠바이 — 화면은 ?preview=1 로 볼 수 있지만 등록은 막는다.
    if (event.status === "draft") {
      return NextResponse.json({ error: "아직 참가 접수를 시작하지 않았습니다." }, { status: 400 })
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
      return apiError("진영 조회 중 오류가 발생했습니다.", 500, groupErr)
    }
    if (!group) {
      return apiBadRequest("올바르지 않은 진영입니다.")
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
          error: "이미 고른 진영이 있습니다. 이벤트 중 진영 변경은 되지 않습니다.",
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
          { error: "이미 고른 진영이 있습니다.", already_registered: true },
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
