import type { SupabaseClient } from "@supabase/supabase-js"

interface ReportRow {
  id: string
  reporter_id: string
  target_type: string
  target_id: string
}

interface ReportEnrichment {
  post_id: string | null
  post_title: string | null
  author_id: string | null
  author_yellow_count: number
  reporter_total_reports: number
  reporter_dismissed_rate: number
}

export async function enrichReports<T extends ReportRow>(
  supabase: SupabaseClient,
  reports: T[]
): Promise<(T & ReportEnrichment)[]> {
  if (reports.length === 0) return []

  const commentTargetIds = reports
    .filter((r) => r.target_type === "comment")
    .map((r) => r.target_id)
  const postTargetIds = reports.filter((r) => r.target_type === "post").map((r) => r.target_id)

  let commentPostMap: Record<string, string> = {}
  let commentAuthorMap: Record<string, string> = {}
  if (commentTargetIds.length > 0) {
    const { data } = await supabase
      .from("comments")
      .select("id, post_id, user_id")
      .in("id", commentTargetIds)
    if (data) {
      commentPostMap = Object.fromEntries(data.map((c) => [c.id, c.post_id]))
      commentAuthorMap = Object.fromEntries(data.map((c) => [c.id, c.user_id]))
    }
  }

  let postTitleMap: Record<string, string> = {}
  let postAuthorMap: Record<string, string> = {}
  if (postTargetIds.length > 0) {
    const { data } = await supabase
      .from("posts")
      .select("id, title, user_id")
      .in("id", postTargetIds)
    if (data) {
      postTitleMap = Object.fromEntries(data.map((p) => [p.id, p.title]))
      postAuthorMap = Object.fromEntries(data.map((p) => [p.id, p.user_id]))
    }
  }

  const authorIds = Array.from(
    new Set(
      reports
        .map((r) =>
          r.target_type === "comment" ? commentAuthorMap[r.target_id] : postAuthorMap[r.target_id]
        )
        .filter((id): id is string => !!id)
    )
  )

  const yellowCountByAuthor: Record<string, number> = {}
  if (authorIds.length > 0) {
    const { data } = await supabase
      .from("user_cards")
      .select("user_id")
      .in("user_id", authorIds)
      .eq("card_type", "yellow")
      .gt("expires_at", new Date().toISOString())
    if (data) {
      for (const c of data) {
        yellowCountByAuthor[c.user_id] = (yellowCountByAuthor[c.user_id] ?? 0) + 1
      }
    }
  }

  // 신고자별 누적 신뢰도 통계 (전체 기간, content_reports 한정)
  const reporterIds = Array.from(new Set(reports.map((r) => r.reporter_id).filter(Boolean)))
  const reporterStats: Record<string, { total: number; dismissed: number }> = {}
  if (reporterIds.length > 0) {
    const { data } = await supabase
      .from("content_reports")
      .select("reporter_id, status")
      .in("reporter_id", reporterIds)
    for (const row of data ?? []) {
      if (!row.reporter_id) continue
      const s = (reporterStats[row.reporter_id] ??= { total: 0, dismissed: 0 })
      s.total++
      if (row.status === "dismissed") s.dismissed++
    }
  }

  return reports.map((r) => {
    const authorId =
      r.target_type === "comment"
        ? (commentAuthorMap[r.target_id] ?? null)
        : (postAuthorMap[r.target_id] ?? null)
    const rep = reporterStats[r.reporter_id]
    const total = rep?.total ?? 0
    const dismissedRate = total > 0 ? (rep?.dismissed ?? 0) / total : 0
    return {
      ...r,
      post_id: r.target_type === "comment" ? (commentPostMap[r.target_id] ?? null) : r.target_id,
      post_title: r.target_type === "post" ? (postTitleMap[r.target_id] ?? null) : null,
      author_id: authorId,
      author_yellow_count: authorId ? (yellowCountByAuthor[authorId] ?? 0) : 0,
      reporter_total_reports: total,
      reporter_dismissed_rate: dismissedRate,
    }
  })
}
