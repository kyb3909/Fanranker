import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * /season/join — 시즌 개막 이벤트 스마트 라우터 (2026-08-14 운영자 지시).
 *
 * 홈 매치데이 밴드의 "오늘 개막 이벤트 참가하기"가 여기로 온다:
 *   · 비로그인 / 참가 신청 전  → /season (참가 신청 페이지 — 가입·팀 선택·등록)
 *   · 참가 신청 완료           → /prediction (바로 승부 예측)
 * UI 없는 순수 분기 — 신청 여부를 매번 홈에서 판정하면 밴드가 무거워져서
 * 클릭 시점에 서버에서 한 번만 본다.
 */
export default async function SeasonJoinPage() {
  const { userId } = await auth()
  if (!userId) redirect("/season?ref=join")

  const supabase = createServiceRoleClient()
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("slug", "season-open-2026")
    .maybeSingle()
  if (!event) redirect("/season?ref=join")

  const { data: reg } = await supabase
    .from("event_registrations")
    .select("id")
    .eq("event_id", event.id)
    .eq("user_id", userId)
    .maybeSingle()

  redirect(reg ? "/prediction?ref=event" : "/season?ref=join")
}
