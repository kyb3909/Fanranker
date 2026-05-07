"use server"

import { revalidatePath } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/supabase/admin"

const EVENT_SLUG = "worldcup-2026"

/**
 * Admin: events.league_codes 업데이트.
 * 입력 form 의 raw text (콤마/공백 구분) 를 trimmed array 로 변환.
 */
export async function updateLeagueCodes(formData: FormData) {
  await requireAdmin()

  const raw = (formData.get("league_codes") ?? "").toString()
  const codes = raw
    .split(/[\s,]+/)
    .map((c) => c.trim())
    .filter(Boolean)

  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from("events")
    .update({ league_codes: codes, updated_at: new Date().toISOString() })
    .eq("slug", EVENT_SLUG)

  if (error) {
    throw new Error("코드 업데이트 실패: " + error.message)
  }

  revalidatePath("/admin/event")
  revalidatePath("/worldcup/games")
}

/**
 * Admin: events.status 업데이트 (draft → open → live → closed).
 */
export async function updateEventStatus(formData: FormData) {
  await requireAdmin()

  const status = (formData.get("status") ?? "").toString()
  if (!["draft", "open", "live", "closed"].includes(status)) {
    throw new Error("잘못된 상태 값입니다.")
  }

  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from("events")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("slug", EVENT_SLUG)

  if (error) {
    throw new Error("상태 업데이트 실패: " + error.message)
  }

  revalidatePath("/admin/event")
  revalidatePath("/worldcup/games")
  revalidatePath("/worldcup")
}
