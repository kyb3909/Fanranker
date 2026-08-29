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
  betman: {
    lastCheckedAt: string | null
    status: "ok" | "stale" | "error"
    /** 킥오프 지났는데 result 없는 경기 행 — operations/dashboard 와 같은 정의 */
    unsettled: number
    refundsPending: number
  }
  /** 문의 — ⚠️ inquiries 테이블은 존재하나 접수 경로가 미배선 (2026-08-30 실측: 코드 참조 0) */
  inquiriesOpen: number
  newsErrorReports: number
  metaverseReports: number
  squadBacklog: number
  /** 미리보기 — 숫자만으론 판단이 안 선다 (운영자: "미리보기 같은 것들이 필요해") */
  squadPreview: { nameEn: string; nameKrDraft: string }[]
  reportsPreview: { reason: string; targetType: string; createdAt: string }[]
  dictPreview: { headline: string; occurredAt: string }[]
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

  const [
    newsRes,
    reportsRes,
    sagaRes,
    dictRes,
    syncRes,
    squadRes,
    suRes,
    poRes,
    prRes,
    unsettledRes,
    refundsRes,
    inqRes,
    nerRes,
    mvRes,
    squadPrevRes,
    reportsPrevRes,
    dictPrevRes,
  ] = await Promise.all([
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
    /**
     * 미정산 — ⚠️ operations/dashboard 의 정의(킥오프 지남 & result null)를 그대로 쓰면
     * 주말 저녁마다 거짓 경보가 난다 (2026-08-30 실측: 122건 전부 최근 2일 in_progress —
     * 그냥 지금 뛰고 있는 경기들). 경기 ~2h + VPS 동기화 주기 2h + 여유를 더해
     * **킥오프 5시간 경과**부터만 "진짜 걸린 것"으로 센다. PM 경고 그대로: 늑대소리
     * 내는 위젯은 3주 안에 무시를 학습시킨다.
     */
    supabase
      .from("betman_games")
      .select("*", { count: "exact", head: true })
      .lt("match_time", new Date(Date.now() - 5 * 3600_000).toISOString())
      .is("result", null),
    supabase
      .from("pending_refunds")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase.from("inquiries").select("*", { count: "exact", head: true }),
    supabase.from("news_error_reports").select("*", { count: "exact", head: true }),
    supabase
      .from("metaverse_user_reports")
      .select("*", { count: "exact", head: true })
      .eq("status", "open"),
    // 미리보기 3종
    supabase
      .from("team_squads")
      .select("name_en, name_kr_draft")
      .not("name_kr_draft", "is", null)
      .neq("status", "confirmed")
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("content_reports")
      .select("reason, target_type, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("saga_reservoir")
      .select("headline_kr, title, occurred_at")
      .eq("error", "auto_hold:unknown_player")
      .order("occurred_at", { ascending: false })
      .limit(6),
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
    betman: {
      lastCheckedAt: lastChecked,
      status: betmanStatus,
      unsettled: unsettledRes.count ?? 0,
      refundsPending: refundsRes.count ?? 0,
    },
    inquiriesOpen: inqRes.count ?? 0,
    newsErrorReports: nerRes.count ?? 0,
    metaverseReports: mvRes.count ?? 0,
    squadBacklog: squadRes.count ?? 0,
    squadPreview: ((squadPrevRes.data as { name_en: string; name_kr_draft: string }[]) ?? []).map(
      (r) => ({ nameEn: r.name_en, nameKrDraft: r.name_kr_draft })
    ),
    reportsPreview: (
      (reportsPrevRes.data as { reason: string; target_type: string; created_at: string }[]) ?? []
    ).map((r) => ({ reason: r.reason, targetType: r.target_type, createdAt: r.created_at })),
    dictPreview: (
      (dictPrevRes.data as { headline_kr: string | null; title: string; occurred_at: string }[]) ??
      []
    ).map((r) => ({ headline: r.headline_kr ?? r.title, occurredAt: r.occurred_at })),
    today: {
      signups: suRes.count ?? 0,
      posts: poRes.count ?? 0,
      predictions: prRes.count ?? 0,
    },
  }
}
