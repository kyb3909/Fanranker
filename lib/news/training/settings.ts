import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { effectivePublishing, type EditorialRule, type TrainingSettings } from "./types"

export async function loadEditorialRules(db: SupabaseClient): Promise<EditorialRule[]> {
  const { data, error } = await db
    .from("news_editorial_rules")
    .select("*")
    .eq("active", true)
    .order("priority", { ascending: false })
    .order("id")
    .limit(20)
  if (error) throw Error("편집 원칙을 불러오지 못했습니다.")
  return data ?? []
}
export async function loadPublishingSettings(db: SupabaseClient) {
  const { data, error } = await db
    .from("news_training_settings")
    .select("*")
    .eq("id", true)
    .single()
  if (error || !data) throw Error("자동발행 설정을 확인할 수 없어 발행을 보류합니다.")
  return {
    ...(data as TrainingSettings),
    effective_enabled: effectivePublishing(data, process.env.NEWS_AUTO_PUBLISH),
  }
}
