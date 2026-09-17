import "server-only"
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { openDeskArticle } from "./catalog"
import { loadEditorialRules } from "@/lib/news/training/settings"
import { canonicalSourceUrl } from "@/lib/news/canonical-url"
import { kstDayStart } from "./time"

const ACTOR = "system:news-desk-auto-queue"
type ExistingItem = {
  id: string
  status: string
  created_at: string
  source_reservoir_id: string
  origin: { id: string; auto_queue?: boolean } | null
  sources: { source_url: string }[]
}

/** Fill the desk from actual newly written articles; never regenerate an old practice copy. */
export async function refillLiveDesk(db: SupabaseClient, now = Date.now()) {
  const settings = await db
    .from("news_desk_settings")
    .select("enabled,pending_target,daily_limit")
    .eq("id", true)
    .single()
  if (settings.error || !settings.data) throw Error("자동 대기함 설정을 불러오지 못했습니다.")
  if (!settings.data.enabled) return { skipped: "paused", added: 0 }
  const token = randomUUID()
  const lease = await db
    .from("news_desk_settings")
    .update({
      lease_token: token,
      lease_until: new Date(now + 5 * 60000).toISOString(),
    })
    .eq("id", true)
    .eq("enabled", true)
    .or(`lease_until.is.null,lease_until.lt.${new Date(now).toISOString()}`)
    .select("id")
    .maybeSingle()
  if (lease.error) throw Error("자동 대기함 작업을 시작하지 못했습니다.")
  if (!lease.data) return { skipped: "busy", added: 0 }
  let lastError: string | null = null
  try {
    const [existing, rules, pendingResult, todayResult] = await Promise.all([
      db
        .from("news_desk_items")
        .select("id,status,created_at,source_reservoir_id,origin,sources")
        .not("origin", "is", null)
        .order("created_at", { ascending: false })
        .limit(1500),
      loadEditorialRules(db),
      db
        .from("news_desk_items")
        .select("id", { count: "exact", head: true })
        .eq("origin->>auto_queue", "true")
        .in("status", ["drafted", "generating"]),
      db
        .from("news_desk_items")
        .select("id", { count: "exact", head: true })
        .eq("origin->>auto_queue", "true")
        .gte("created_at", kstDayStart(now)),
    ])
    if (existing.error || pendingResult.error || todayResult.error)
      throw Error("데스킹 작업 목록을 불러오지 못했습니다.")
    const items = (existing.data ?? []) as ExistingItem[]
    const pending = pendingResult.count ?? 0
    const today = todayResult.count ?? 0
    const available = Math.min(
      settings.data.pending_target - pending,
      settings.data.daily_limit - today
    )
    if (available <= 0)
      return {
        skipped: pending >= settings.data.pending_target ? "queue_full" : "daily_limit",
        added: 0,
      }
    const candidates = await db
      .from("news_reservoir")
      .select("id,status,created_at,raw,draft,publish,urls")
      .in("status", ["drafted", "published"])
      .gte("created_at", new Date(now - 24 * 3600000).toISOString())
      .order("created_at", { ascending: false })
      .limit(120)
    if (candidates.error) throw Error("새로 작성된 기사를 불러오지 못했습니다.")
    const seen = new Set(
      items.flatMap((item) => [
        item.origin!.id,
        item.source_reservoir_id.replace(/^live-draft:/, ""),
      ])
    )
    const seenUrls = new Set(
      items
        .flatMap((item) => item.sources ?? [])
        .map((source) => canonicalSourceUrl(source.source_url))
    )
    const added: string[] = []
    for (const row of candidates.data ?? []) {
      if (added.length >= available) break
      const postId = row.publish?.post_id ?? row.publish?.postId
      const url = row.urls?.source
      const guidance = row.raw?.editorial_guidance
      if (
        !url ||
        row.raw?.sport === "basketball" ||
        !row.draft?.content ||
        seen.has(row.id) ||
        (postId && seen.has(postId))
      )
        continue
      if (seenUrls.has(canonicalSourceUrl(url))) continue
      // Old articles remain searchable; this automatic queue is for the current owner policy.
      if (
        !guidance ||
        !rules.every(
          (rule) =>
            guidance.applied_rule_ids?.includes(rule.id) &&
            Date.parse(guidance.loaded_at) >= Date.parse(rule.updated_at)
        )
      )
        continue
      if (String(row.raw?.source_text ?? "").length < 100) continue
      const opened = await openDeskArticle(
        db,
        { kind: postId ? "post" : "draft", id: postId ?? row.id },
        ACTOR
      )
      if (opened.existing) continue
      const loaded = await db.from("news_desk_items").select("origin").eq("id", opened.id).single()
      if (loaded.error || !loaded.data?.origin)
        throw Error("자동 대기함 기사 연결을 확인하지 못했습니다.")
      const marked = await db
        .from("news_desk_items")
        .update({
          origin: { ...loaded.data.origin, auto_queue: true },
          applied_rule_ids: guidance.applied_rule_ids ?? [],
          applied_lesson_ids: guidance.applied_lesson_ids ?? [],
        })
        .eq("id", opened.id)
      if (marked.error) throw Error("작성에 적용한 편집 원칙을 기록하지 못했습니다.")
      seen.add(row.id)
      seenUrls.add(canonicalSourceUrl(url))
      added.push(opened.id)
    }
    return {
      added: added.length,
      ids: added,
      pending: pending + added.length,
      target: settings.data.pending_target,
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message.slice(0, 500) : "자동 보충에 실패했습니다."
    throw error
  } finally {
    const saved = await db
      .from("news_desk_settings")
      .update({
        last_run_at: new Date(now).toISOString(),
        lease_until: null,
        lease_token: null,
        last_error: lastError,
      })
      .eq("id", true)
      .eq("lease_token", token)
    if (saved.error) throw Error("자동 대기함 처리 기록을 저장하지 못했습니다.")
  }
}
