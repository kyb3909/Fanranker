import "server-only"

import { createServiceRoleClient } from "@/lib/supabase/server"
import { isBreakingNewsItem } from "@/lib/news/breaking"

/**
 * 관리자 홈의 **인라인 작업 위젯** 데이터 로더 — 읽기 전용.
 *
 * ## 범위 (2026-09-08 관제 센터 통합에서 좁혔다)
 * 종전에는 이 로더가 전황판 13행의 집계까지 전부 만들었다. 그 집계는 이제
 * `/api/admin/control-center` 가 소유한다 — **조회 실패와 0건을 구별해야 하는데
 * 여기서는 전 항목이 `count ?? 0` 이라 둘이 같은 초록색이었기 때문이다.**
 * 여기 남은 것은 홈에서 바로 처리하는 작업 위젯의 재료뿐이다:
 * 뉴스 검수 덱, 이름 등재 대기, 스쿼드 검수, 티커 삭제, 참여도.
 *
 * 숫자 정의를 바꿀 때는 주석의 "왜"부터 읽을 것 — 대부분 운영자 피드백으로 굳은 정의다.
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
  /** 표기 등재 대기 슬립 수 */
  dictCandidates: number
  squadBacklog: number
  /** 미리보기 — 숫자만으론 판단이 안 선다 (운영자: "미리보기 같은 것들이 필요해") */
  squadPreview: SquadPreviewRow[]
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
  /** 참여도 — 오늘 vs 어제 (운영자: "사람들 참여도, 메뉴들 어떻게 활용했는지") */
  participation: { label: string; today: number; yesterday: number }[]
  ticker: { recent: { id: string; title: string }[] }
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
    dictRes,
    squadRes,
    squadPrevRes,
    dictPrevRes,
    tickerRecentRes,
    activeGamesRes,
    roundRes,
  ] = await Promise.all([
    supabase
      .from("news_reservoir")
      .select("id, draft, raw, urls, scores, created_at")
      .eq("status", "drafted")
      .filter("source->>type", "eq", "hermes")
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("saga_reservoir")
      .select("*", { count: "exact", head: true })
      .eq("status", "queued")
      .eq("error", "auto_hold:unknown_player"),
    supabase
      .from("team_squads")
      .select("*", { count: "exact", head: true })
      .not("name_kr_draft", "is", null)
      .neq("status", "confirmed"),
    supabase
      .from("team_squads")
      .select("name_en, name_kr_draft, soccerway_team_id, player_slug")
      .not("name_kr_draft", "is", null)
      .neq("status", "confirmed")
      .order("updated_at", { ascending: false })
      .limit(8),
    // 표기 등재 대기 — 선수별 집계 + 근거 제목 (JS 에서 접는다)
    supabase
      .from("saga_reservoir")
      .select("title, extracted")
      .eq("status", "queued")
      .eq("error", "auto_hold:unknown_player")
      .order("occurred_at", { ascending: false })
      .limit(500),
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

  return {
    news,
    newsTotal: news.length,
    dictCandidates: dictRes.count ?? 0,
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
    participation,
    ticker: {
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
