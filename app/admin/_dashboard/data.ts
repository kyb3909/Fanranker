import "server-only"

import { createServiceRoleClient } from "@/lib/supabase/server"
import { isBreakingNewsItem } from "@/lib/news/breaking"
import { summarizeReportGaps } from "@/lib/soccerway/report-gaps"

/**
 * 관제실(관리자 홈) 데이터 로더 — 읽기 전용.
 *
 * 시안(app/design-demo/admin-home)에서 2026-08-30 이식. 숫자 정의를 바꿀 때는
 * 여기 주석의 "왜"부터 읽을 것 — 대부분 운영자 피드백으로 굳은 정의다.
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

export interface SquadPreviewRow {
  nameEn: string
  nameKrDraft: string
  teamKr: string
  /** inline_save API 키 — (soccerway_team_id, player_slug) 쌍이 행 식별자다 */
  teamId: string
  playerSlug: string
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
    /** 결과 대기 — **경기 수** (행 수 아님. 한 경기 = 마켓별 여러 행) */
    unsettled: number
    /** 결과 대기 경기 목록 ("홈 vs 원정") — 숫자만으론 뭔지 모른다 (운영자) */
    unsettledMatches: string[]
    /** 그 경기들에 걸려 있는 유저 예측 수 — 이게 진짜 심각도다 */
    waitingPredictions: number
    refundsPending: number
  }
  /** 문의 — ⚠️ inquiries 테이블은 존재하나 접수 경로가 미배선 (2026-08-30 실측: 코드 참조 0) */
  inquiriesOpen: number
  newsErrorReports: number
  metaverseReports: number
  squadBacklog: number
  /** 미리보기 — 숫자만으론 판단이 안 선다 (운영자: "미리보기 같은 것들이 필요해") */
  squadPreview: SquadPreviewRow[]
  reportsPreview: { reason: string; targetType: string; createdAt: string }[]
  /**
   * 표기 등재 대기 — 선수별 집계 + 원클릭 등재 재료 (2026-08-30 운영자 "진행해줘").
   * 행동 단위는 슬립이 아니라 **선수**다. 영문 이름으로 묶고, LLM 의 한글 표기는
   * **후보일 뿐** — 입력칸에 미리 채워 운영자가 고치거나 승인한다 (환각 대책 원칙:
   * LLM 이 만든 표기는 사람 확정 없이 사전에 못 들어간다).
   */
  blockedPlayers: {
    playerEn: string
    /** LLM 추출 한글 표기 후보 — 없으면 null (운영자가 직접 입력) */
    playerKrDraft: string | null
    count: number
    /** 근거 — 이 선수가 걸린 기사 제목 하나 */
    sample: string
  }[]
  /** 이름 추출 자체가 실패해 등재로는 안 풀리는 잔여물 (영문 이름조차 없는 행) */
  blockedUnparsed: number
  today: { signups: number; posts: number; predictions: number }
  /** 참여도 — 오늘 vs 어제 (운영자: "사람들 참여도, 메뉴들 어떻게 활용했는지") */
  participation: { label: string; today: number; yesterday: number }[]
  crawlerFailsToday: number
  ticker: { lastAt: string | null; count24h: number; recent: { id: string; title: string }[] }
  activeGames: number
  dailyRound: { roundNum: number | null; closeAt: string | null }
  /** 결과 교차검증(베트맨×LFA) 불일치 — 표시·알림 전용, 정산과 무관 (2026-09-02 역할 변경) */
  resultMismatches: number
  /**
   * 경기 리포트 미생성 (2026-09-02 신설). 최근 48h 킥오프 · 대상 경기인데 저장 리포트가 없고
   * 실패 원장(match_report_attempts)에 사유가 남은 경기 수 + 사유별 분포.
   * 운영자: 7일간 대상 23경기 중 10개만 리포트 — 나머지 13개는 이유가 어디에도 안 남았었다.
   */
  reportGaps: { games: number; reasons: { stage: string; n: number }[] }
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
      .eq("status", "queued")
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
     * 결과 대기 — ⚠️ "킥오프 지남 & result null" 그대로 쓰면 주말 저녁마다 거짓 경보
     * (2026-08-30 실측: 122건 전부 최근 2일 in_progress — 그냥 지금 뛰는 경기들).
     * 경기 ~2h + VPS 동기화 주기 2h + 여유 = **킥오프 5시간 경과**부터만 센다.
     * 늑대소리 내는 위젯은 3주 안에 무시를 학습시킨다.
     */
    /**
     * ⚠️ 행 수가 아니라 **경기 수**로 세야 한다 (운영자: "미정산이 뭔지 모르겠어" →
     * 까보니 행 25 = 실제 경기 5). betman 은 한 경기가 마켓별 여러 행이다.
     */
    supabase
      .from("betman_games")
      .select("id, home_team_name, away_team_name, match_time")
      .lt("match_time", new Date(Date.now() - 5 * 3600_000).toISOString())
      .is("result", null)
      .limit(500),
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
      .select("name_en, name_kr_draft, soccerway_team_id, player_slug")
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
    // 표기 등재 대기 — 선수별 집계 + 근거 제목 (JS 에서 접는다)
    supabase
      .from("saga_reservoir")
      .select("title, extracted")
      .eq("status", "queued")
      .eq("error", "auto_hold:unknown_player")
      .order("occurred_at", { ascending: false })
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
      // 티커 즉시 삭제 패널용 최근 6건
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

  // 결과 교차검증 불일치 — 표시·알림 전용 (2026-09-02). 정산은 이 verdict 를 보지 않는다.
  const { count: resultMismatches } = await supabase
    .from("betman_result_checks")
    .select("*", { count: "exact", head: true })
    .eq("verdict", "mismatch")

  // 경기 리포트 미생성 — 실패 원장(최근 48h)에서 경기별 **마지막** 사유만 센다.
  // 저장 리포트가 생긴 경기는 뺀다(나중에 성공한 건 실패가 아니다).
  const since48h = new Date(Date.now() - 48 * 3600_000).toISOString()
  const [attemptsRes, reportedRes] = await Promise.all([
    supabase
      .from("match_report_attempts")
      .select("game_id, stage, attempted_at")
      .gte("attempted_at", since48h)
      .order("attempted_at", { ascending: false })
      .limit(2000),
    supabase.from("match_reports").select("game_id").gte("created_at", since48h),
  ])
  const reportGaps = summarizeReportGaps(
    (attemptsRes.data ?? []) as { game_id: string; stage: string; attempted_at: string }[],
    ((reportedRes.data ?? []) as { game_id: string }[]).map((r) => r.game_id)
  )

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

  // 결과 대기 — 행을 경기 단위로 접고, 걸린 유저 예측 수를 센다 (진짜 심각도)
  const unsettledRows =
    (unsettledRes.data as {
      id: string
      home_team_name: string
      away_team_name: string
      match_time: string
    }[]) ?? []
  const matchKeys = new Map<string, string>()
  for (const g of unsettledRows) {
    const key = `${g.home_team_name}|${g.away_team_name}|${g.match_time}`
    if (!matchKeys.has(key)) matchKeys.set(key, `${g.home_team_name} vs ${g.away_team_name}`)
  }
  const { count: waitingPredictions } =
    unsettledRows.length > 0
      ? await supabase
          .from("betman_predictions")
          .select("*", { count: "exact", head: true })
          .in(
            "game_id",
            unsettledRows.map((g) => g.id)
          )
      : { count: 0 }

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
      unsettled: matchKeys.size,
      unsettledMatches: [...matchKeys.values()].slice(0, 6),
      waitingPredictions: waitingPredictions ?? 0,
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
        player_slug: string
      }[]) ?? []
    ).map((r) => ({
      nameEn: r.name_en,
      nameKrDraft: r.name_kr_draft,
      // 운영자: "어느 클럽의 누구인지도 정보가 필요" — team_dictionary 로 클럽명 해석
      teamKr: (r.soccerway_team_id && teamNameById.get(r.soccerway_team_id)) || "소속 미상",
      teamId: r.soccerway_team_id ?? "",
      playerSlug: r.player_slug,
    })),
    reportsPreview: (
      (reportsPrevRes.data as { reason: string; target_type: string; created_at: string }[]) ?? []
    ).map((r) => ({ reason: r.reason, targetType: r.target_type, createdAt: r.created_at })),
    ...(() => {
      // 선수별 집계 — **영문 이름**으로 묶는다 (한글 표기는 LLM 후보라 흔들린다).
      // 영문조차 없는 행만 "추출 실패" — 등재로 못 푸는 진짜 잔여물이다.
      const byPlayer = new Map<
        string,
        { playerEn: string; playerKrDraft: string | null; count: number; sample: string }
      >()
      let unparsed = 0
      for (const row of (dictPrevRes.data as { title: string | null; extracted: unknown }[]) ??
        []) {
        const ex = row.extracted as { player?: string | null; player_kr?: string | null } | null
        const en = ex?.player?.trim()
        if (!en || en === "null") {
          unparsed++
          continue
        }
        const krRaw = ex?.player_kr?.trim()
        const kr = krRaw && krRaw !== "null" && /[가-힣]/.test(krRaw) ? krRaw : null
        const key = en.toLowerCase()
        const cur = byPlayer.get(key)
        if (cur) {
          cur.count++
          if (!cur.playerKrDraft && kr) cur.playerKrDraft = kr
        } else {
          byPlayer.set(key, {
            playerEn: en,
            playerKrDraft: kr,
            count: 1,
            sample: row.title ?? "",
          })
        }
      }
      return {
        blockedPlayers: [...byPlayer.values()].sort((a, b) => b.count - a.count).slice(0, 7),
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
    resultMismatches: resultMismatches ?? 0,
    reportGaps,
    dailyRound: {
      roundNum: roundRes.data?.daily_id
        ? parseInt(String(roundRes.data.daily_id).replace(/\D/g, ""), 10) || null
        : null,
      closeAt: roundRes.data?.bet_close_at ?? null,
    },
  }
}
