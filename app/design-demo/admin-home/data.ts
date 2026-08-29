import "server-only"

import { createServiceRoleClient } from "@/lib/supabase/server"
import { isBreakingNewsItem } from "@/lib/news/breaking"

/**
 * 대시보드 시안 공용 데이터 로더 — **실데이터만** 쓴다 (회색 목업 금지 규율).
 * 시안 A/B 가 같은 데이터를 다른 레이아웃으로 그린다. 아무것도 쓰지 않는다(읽기 전용).
 */

export interface MiniNewsItem {
  id: string
  title: string
  originalTitle: string | null
  body: string
  breaking: boolean
  credibility: number | null
  importance: number | null
  expiresAt: string
  sourceText: string | null
  image: string | null
}

export interface DashboardData {
  news: MiniNewsItem[]
  newsTotal: number
  reportsPending: number
  sagaPending: number
  dictCandidates: number
  betman: { lastCheckedAt: string | null; status: "ok" | "stale" | "error" }
  squadBacklog: number
  today: { signups: number; posts: number; predictions: number }
}

const EXPIRE_HOURS = 24
const BREAKING_EXPIRE_HOURS = 48

function paragraphsPreview(content: unknown): string {
  const out: string[] = []
  const walk = (n: unknown) => {
    const node = n as { type?: string; content?: unknown[] } | null
    if (!node) return
    if (node.type === "paragraph") {
      const t = (node.content ?? []).map((c) => (c as { text?: string }).text ?? "").join("")
      if (t.trim()) out.push(t.trim())
    }
    for (const c of node.content ?? []) walk(c)
  }
  walk(content)
  return out.join(" ")
}

function firstImage(content: unknown): string | null {
  let found: string | null = null
  const walk = (n: unknown) => {
    if (found) return
    const node = n as { type?: string; attrs?: { src?: string }; content?: unknown[] } | null
    if (!node) return
    if (node.type === "image" && node.attrs?.src) {
      found = node.attrs.src
      return
    }
    for (const c of node.content ?? []) walk(c)
  }
  walk(content)
  return found
}

export async function loadDashboardData(): Promise<DashboardData> {
  const supabase = createServiceRoleClient()

  const KST_OFFSET = 9 * 3600_000
  const nowKST = new Date(Date.now() + KST_OFFSET)
  const todayStart = new Date(
    Date.UTC(nowKST.getUTCFullYear(), nowKST.getUTCMonth(), nowKST.getUTCDate()) - KST_OFFSET
  ).toISOString()

  const [newsRes, reportsRes, sagaRes, dictRes, syncRes, squadRes, suRes, poRes, prRes] =
    await Promise.all([
      supabase
        .from("news_reservoir")
        .select("id, draft, raw, urls, scores, created_at")
        .eq("status", "drafted")
        .filter("source->>type", "eq", "hermes")
        .order("created_at", { ascending: true })
        .limit(100),
      supabase
        .from("content_reports")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("saga_reservoir")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("saga_reservoir")
        .select("*", { count: "exact", head: true })
        .eq("error", "auto_hold:unknown_player"),
      supabase
        .from("betman_sync_state")
        .select("last_checked_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("team_squads")
        .select("*", { count: "exact", head: true })
        .not("name_kr_draft", "is", null)
        .neq("status", "confirmed"),
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart),
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart),
      supabase
        .from("betman_predictions")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart),
    ])

  interface Row {
    id: string
    draft: {
      title?: string
      content?: unknown
      original?: { title?: string } | null
    } | null
    raw: { source_text?: string } | null
    urls: { source?: string | null } | null
    scores: Record<string, unknown> | null
    created_at: string
  }

  const news: MiniNewsItem[] = ((newsRes.data as Row[]) ?? []).map((r) => {
    const breaking = isBreakingNewsItem({
      draftTitle: r.draft?.title ?? null,
      originalTitle: r.draft?.original?.title ?? null,
      sourceUrl: r.urls?.source ?? null,
    })
    return {
      id: r.id,
      title: r.draft?.title ?? "(제목 없음)",
      originalTitle: r.draft?.original?.title ?? null,
      body: paragraphsPreview(r.draft?.content),
      breaking,
      credibility: Number(r.scores?.credibility ?? 0) || null,
      importance: Number(r.scores?.importance ?? 0) || null,
      expiresAt: new Date(
        new Date(r.created_at).getTime() +
          (breaking ? BREAKING_EXPIRE_HOURS : EXPIRE_HOURS) * 3600_000
      ).toISOString(),
      sourceText: r.raw?.source_text ?? null,
      image: firstImage(r.draft?.content),
    }
  })
  news.sort((a, b) =>
    a.breaking !== b.breaking ? (a.breaking ? -1 : 1) : a.expiresAt.localeCompare(b.expiresAt)
  )

  let betmanStatus: "ok" | "stale" | "error" = "error"
  const lastChecked = syncRes.data?.last_checked_at ?? null
  if (lastChecked) {
    const h = (Date.now() - new Date(lastChecked).getTime()) / 3600_000
    betmanStatus = h < 3 ? "ok" : h < 6 ? "stale" : "error"
  }

  return {
    news,
    newsTotal: news.length,
    reportsPending: reportsRes.count ?? 0,
    sagaPending: sagaRes.count ?? 0,
    dictCandidates: dictRes.count ?? 0,
    betman: { lastCheckedAt: lastChecked, status: betmanStatus },
    squadBacklog: squadRes.count ?? 0,
    today: {
      signups: suRes.count ?? 0,
      posts: poRes.count ?? 0,
      predictions: prRes.count ?? 0,
    },
  }
}
