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
  squadPreview: { nameEn: string; nameKrDraft: string; teamKr: string }[]
  reportsPreview: { reason: string; targetType: string; createdAt: string }[]
  /**
   * 표기 등재 대기 — 선수별 집계. "이 선수 표기를 등재하면 소식 N건이 풀린다".
   * 슬립 헤드라인을 그대로 보여줬더니 운영자: "뭘 어쩌라는 건지 모르겠어" — 당연했다.
   * 행동 단위는 슬립이 아니라 **선수**다.
   */
  blockedPlayers: { name: string; count: number }[]
  /** 이름 추출 자체가 실패해 표기 등재로는 안 풀리는 잔여물 (2026-08-30 실측 248/381 = 65%) */
  blockedUnparsed: number
  today: { signups: number; posts: number; predictions: number }
  /** 참여도 — 오늘 vs 어제 (운영자: "사람들 참여도, 메뉴들 어떻게 활용했는지") */
  participation: { label: string; today: number; yesterday: number }[]
  /** 원본 대시보드 대조(2026-08-30)에서 회수한 4종 — 위임 판단으로 채움 */
  crawlerFailsToday: number
  ticker: { lastAt: string | null; count24h: number; recent: { id: string; title: string }[] }
  activeGames: number
  dailyRound: { roundNum: number | null; closeAt: string | null }
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
      .select("name_en, name_kr_draft, soccerway_team_id")
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
    // 표기 등재 대기 — 선수 이름만 뽑아 JS 에서 집계 (extracted->player_kr)
    supabase
      .from("saga_reservoir")
      .select("extracted")
      .eq("error", "auto_hold:unknown_player")
      .limit(500),
  ])

  /**
   * 참여도 오늘/어제 — 지표 6종 × 2 구간. head-count 라 싸다.
   * "메뉴 활용"의 근사: 글=담벼락, 댓글·추천=상호작용, 예측=베트맨, 설문=사이드바 폴.
   */
  const yesterdayStart = new Date(new Date(todayStart).getTime() - 24 * 3600_000).toISOString()
  const countIn = (table: string, col: string, from: string, to?: string) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true }).gte(col, from)
    if (to) q = q.lt(col, to)
    return q
  }
  const PARTICIPATION_SOURCES = [
    { label: "가입", table: "profiles" },
    { label: "글", table: "posts" },
    { label: "댓글", table: "comments" },
    { label: "추천", table: "post_votes" },
    { label: "예측", table: "betman_predictions" },
    { label: "설문 투표", table: "poll_votes" },
  ] as const
  const participationCounts = await Promise.all(
    PARTICIPATION_SOURCES.flatMap((s) => [
      countIn(s.table, "created_at", todayStart),
      countIn(s.table, "created_at", yesterdayStart, todayStart),
    ])
  )
  const participation = PARTICIPATION_SOURCES.map((s, i) => ({
    label: s.label,
    today: participationCounts[i * 2].count ?? 0,
    yesterday: participationCounts[i * 2 + 1].count ?? 0,
  }))

  // 원본 대시보드에서 회수한 4종 — 정의는 기존 코드와 동일하게 유지
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString()
  const [crawlerFailRes, tickerLastRes, ticker24Res, tickerRecentRes, activeGamesRes, roundRes] =
    await Promise.all([
      // 크롤러 실패 — operations/dashboard 와 같은 정의 (오늘, status=error)
      supabase
        .from("crawler_run_log")
        .select("*", { count: "exact", head: true })
        .eq("status", "error")
        .gte("started_at", todayStart),
      supabase
        .from("news_ticker_items")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("news_ticker_items")
        .select("*", { count: "exact", head: true })
        .gte("created_at", dayAgo),
      // 티커 즉시 삭제 패널용 최근 6건 (원본 홈의 숨은 실용 기능 회수)
      supabase
        .from("news_ticker_items")
        .select("id, headline_kr, original_title")
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("betman_games")
        .select("*", { count: "exact", head: true })
        .in("status", ["scheduled", "in_progress"]),
      supabase
        .from("betman_daily_rounds")
        .select("daily_id, bet_close_at")
        .eq("status", "open")
        .order("bet_close_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  // 클럽명 매핑 — team_dictionary (name_kr ↔ soccerway_team_id)
  const { data: teamDictRows } = await supabase
    .from("team_dictionary")
    .select("name_kr, soccerway_team_id")
    .not("soccerway_team_id", "is", null)
  const teamNameById = new Map(
    ((teamDictRows as { name_kr: string; soccerway_team_id: string }[]) ?? []).map((t) => [
      t.soccerway_team_id,
      t.name_kr,
    ])
  )

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
    squadPreview: (
      (squadPrevRes.data as {
        name_en: string
        name_kr_draft: string
        soccerway_team_id: string | null
      }[]) ?? []
    ).map((r) => ({
      nameEn: r.name_en,
      nameKrDraft: r.name_kr_draft,
      // 운영자: "어느 클럽의 누구인지도 정보가 필요" — team_dictionary 로 클럽명 해석
      teamKr: (r.soccerway_team_id && teamNameById.get(r.soccerway_team_id)) || "소속 미상",
    })),
    reportsPreview: (
      (reportsPrevRes.data as { reason: string; target_type: string; created_at: string }[]) ?? []
    ).map((r) => ({ reason: r.reason, targetType: r.target_type, createdAt: r.created_at })),
    ...(() => {
      // 선수별 집계 — 이름이 뽑힌 것만. 추출 실패분은 따로 센다(표기 등재로는 안 풀림)
      const byName = new Map<string, number>()
      let unparsed = 0
      for (const row of (dictPrevRes.data as { extracted: unknown }[]) ?? []) {
        const kr = (row.extracted as { player_kr?: string | null } | null)?.player_kr?.trim()
        if (kr && kr !== "null" && /[가-힣]/.test(kr)) {
          byName.set(kr, (byName.get(kr) ?? 0) + 1)
        } else {
          unparsed++
        }
      }
      return {
        blockedPlayers: [...byName.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 7)
          .map(([name, count]) => ({ name, count })),
        blockedUnparsed: unparsed,
      }
    })(),
    today: {
      signups: suRes.count ?? 0,
      posts: poRes.count ?? 0,
      predictions: prRes.count ?? 0,
    },
    participation,
    crawlerFailsToday: crawlerFailRes.count ?? 0,
    ticker: {
      lastAt: tickerLastRes.data?.created_at ?? null,
      count24h: ticker24Res.count ?? 0,
      recent: (
        (tickerRecentRes.data as {
          id: string
          headline_kr: string | null
          original_title: string | null
        }[]) ?? []
      ).map((t) => ({ id: t.id, title: t.headline_kr ?? t.original_title ?? "(제목 없음)" })),
    },
    activeGames: activeGamesRes.count ?? 0,
    dailyRound: {
      roundNum: roundRes.data?.daily_id
        ? parseInt(String(roundRes.data.daily_id).replace(/\D/g, ""), 10) || null
        : null,
      closeAt: roundRes.data?.bet_close_at ?? null,
    },
  }
}
