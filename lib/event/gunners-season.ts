import type { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * 구너스 레이스 — 아스날 팬 시즌 이벤트 (2026-08-22 ~ 09-30, 1차 구간).
 *
 * ## 설계 (workspace/event-gunners-season-plan-20260814.md)
 * - **별도 예측 풀이 없다.** 기간 내 축구(sport='축구') 슬립을 그대로 집계한다 —
 *   월드컵의 event_id 분리 방식보다 단순하고, 유저는 평소처럼 /prediction 에서 픽하면
 *   자동으로 레이스에 올라탄다 (참가 마찰 0).
 * - 점수 = 슬립 단위 net 손익 (월드컵 검증 모델: won = stake×(total_odds−1), lost = −stake).
 *   points_earned(배당 합계) 함정을 피한 그 산식 그대로.
 * - 아스날 보너스 없음 (운영자 확정 2026-08-14) — 아스날 경기는 UI 강조만.
 * - 랭킹 TOP 5 + 내 순위 공개 (월드컵의 비공개 정책 해제 — 운영자 확정).
 */

type ServiceClient = ReturnType<typeof createServiceRoleClient>

export const GUNNERS_SEASON = {
  slug: "gunners-season",
  /** events 테이블의 실제 이벤트 행 — 등록(event_registrations)이 여기 매달린다 */
  dbSlug: "season-open-2026",
  // "건너스"는 팬이 안 쓰는 오표기 (구너 검수 P0, 2026-08-14) — 표기만 교체, slug 는 유지
  title: "구너스 레이스",
  // KST 8/21 00:00 ~ 10/1 00:00 — 개막 라운드(8/21 밤 경기)부터 예측이 열리도록
  // 시작을 하루 당겼다 (운영자 2026-08-14). 8/22 로 적힌 문구가 남아 있으면 그건 옛 값.
  startAt: "2026-08-20T15:00:00.000Z",
  endAt: "2026-09-30T15:00:00.000Z",
} as const

export function isEventLive(now = new Date()): boolean {
  return now >= new Date(GUNNERS_SEASON.startAt) && now < new Date(GUNNERS_SEASON.endAt)
}

/**
 * 승부예측 개시 여부 — 이벤트 시작 전에는 예측 화면을 열지 않는다 (운영자 2026-08-14).
 * 예측이 이벤트 전용이 된 이상, 개막 전 예측은 어느 판에도 속하지 않기 때문이다.
 */
export function hasEventStarted(now = new Date()): boolean {
  return now >= new Date(GUNNERS_SEASON.startAt)
}

export interface RaceRow {
  userId: string
  nickname: string
  points: number
  slips: number
  won: number
  /** 정산이 끝난 슬립 수 (won + lost). 적중률 분모 — pending/cancelled 를 실패로 세지 않는다 */
  settled: number
}

export interface RaceStanding {
  top: RaceRow[]
  me: (RaceRow & { rank: number }) | null
  participants: number
  /** 요청자가 참가 신청을 마쳤는가 — 미신청자에게 "레이스 반영" UI 를 띄우지 않기 위한 값 */
  registered: boolean
}

/**
 * 기간 내 축구 슬립 → 유저별 net 손익 랭킹. **참가 신청자만** 집계한다
 * (2026-08-14 명시적 참가제 전환 — 신청이 곧 랭킹 자격).
 * pending/refunded 는 점수 제외 (정산 완료분만) — 슬립 수에는 pending 포함해
 * "참여 중" 감각은 살린다.
 */
export async function computeRaceStanding(
  supabase: ServiceClient,
  meUserId: string | null,
  topN = 5
): Promise<RaceStanding> {
  // 참가 신청자 집합 — season-open-2026 등록 기준.
  // registered_at 을 같이 읽는다: **신청 이후의 예측만** 레이스에 반영한다
  // (운영자 확정 2026-08-14). 신청 전에 쌓아둔 슬립이 순위를 만들면 "신청하고 참가"라는
  // 규칙 문구와 화면이 어긋난다.
  const { data: ev } = await supabase
    .from("events")
    .select("id")
    .eq("slug", GUNNERS_SEASON.dbSlug)
    .maybeSingle()
  const { data: regs } = ev
    ? await supabase
        .from("event_registrations")
        .select("user_id, registered_at")
        .eq("event_id", ev.id)
    : { data: [] as { user_id: string; registered_at: string }[] }
  const joinedAt = new Map(
    (regs ?? []).map((r) => [r.user_id, new Date(r.registered_at).getTime()])
  )
  if (joinedAt.size === 0) {
    return { top: [], me: null, participants: 0, registered: false }
  }

  // 이번 이벤트의 판만 센다 — 지난 대회(월드컵 등) 슬립은 event_id 로 남아 있으므로
  // 명시적으로 배제한다 (기간 필터만 믿지 않는다: 이벤트가 겹치면 바로 샌다).
  // 메인 풀 슬립은 event_id 가 null 이고, 그게 이번 레이스의 경기장이다.
  const { data: slips } = await supabase
    .from("prediction_slips")
    .select("user_id, stake, total_odds, status, created_at")
    .eq("sport", "축구")
    .gte("created_at", GUNNERS_SEASON.startAt)
    .lt("created_at", GUNNERS_SEASON.endAt)
    .or(`event_id.is.null,event_id.eq.${ev!.id}`)
    .limit(20000)

  // 신청자는 예측 0건이어도 순위표에 오른다 — 신청이 곧 참가이므로 "N명 중 내 자리"가
  // 신청 직후부터 보여야 한다 (빈손이면 공동 꼴찌에서 출발).
  const byUser = new Map<string, { points: number; slips: number; won: number; settled: number }>()
  for (const userId of joinedAt.keys())
    byUser.set(userId, { points: 0, slips: 0, won: 0, settled: 0 })
  for (const s of slips ?? []) {
    const joined = joinedAt.get(s.user_id)
    if (joined === undefined) continue
    if (new Date(s.created_at).getTime() < joined) continue // 신청 전 슬립 제외
    const row = byUser.get(s.user_id)!
    row.slips += 1
    const stake = Number(s.stake) || 0
    if (s.status === "won") {
      row.points += stake * ((Number(s.total_odds) || 1) - 1)
      row.won += 1
      row.settled += 1
    } else if (s.status === "lost") {
      row.points -= stake
      row.settled += 1
    }
  }

  // 동점 처리: 포인트 → 적중 수 → 슬립 수 적은 쪽(같은 점수를 더 적은 시도로) →
  // user_id 사전순. 마지막 단계는 "무작위 아님"을 보장하는 결정론 장치다 —
  // 정렬 키가 없으면 요청마다 1위가 바뀌어 상품 분쟁이 된다.
  const ranked = [...byUser.entries()]
    .map(([userId, r]) => ({ userId, ...r }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.won - a.won ||
        a.slips - b.slips ||
        a.userId.localeCompare(b.userId)
    )

  const topIds = ranked.slice(0, topN).map((r) => r.userId)
  const meIdx = meUserId ? ranked.findIndex((r) => r.userId === meUserId) : -1
  const needIds = [...new Set([...topIds, ...(meIdx >= 0 ? [meUserId as string] : [])])]

  const { data: profiles } = needIds.length
    ? await supabase.from("profiles").select("user_id, nickname").in("user_id", needIds)
    : { data: [] }
  const nick = new Map((profiles ?? []).map((p) => [p.user_id, p.nickname as string]))

  const toRow = (r: (typeof ranked)[number]): RaceRow => ({
    userId: r.userId,
    nickname: nick.get(r.userId) ?? "익명",
    points: Math.round(r.points),
    slips: r.slips,
    won: r.won,
    settled: r.settled,
  })

  return {
    top: ranked.slice(0, topN).map(toRow),
    me: meIdx >= 0 ? { ...toRow(ranked[meIdx]), rank: meIdx + 1 } : null,
    participants: ranked.length,
    registered: meUserId !== null && joinedAt.has(meUserId),
  }
}

/* ── 내 예측 결과 (/season/results) ────────────────────────────── */

export interface RaceResultPick {
  home: string
  away: string
  league: string | null
  matchTime: string | null
  /** 내가 고른 쪽 — 화면 라벨 */
  pick: string
  /** null = 정산 전 */
  isCorrect: boolean | null
  homeScore: number | null
  awayScore: number | null
}

export interface RaceResultSlip {
  id: string
  createdAt: string
  stake: number
  totalOdds: number
  /** won | lost | pending | cancelled */
  status: string
  /** 이 예측이 순위에 더한 점수 — won: stake×(배당−1), lost: −stake, 그 외 0 */
  net: number
  picks: RaceResultPick[]
}

export interface MyRaceResults {
  registered: boolean
  registeredAt: string | null
  slips: RaceResultSlip[]
  won: number
  lost: number
  pending: number
  cancelled: number
  /** 정산 완료분 합계 (표시용 반올림 전 원값) */
  netPoints: number
}

const PICK_LABEL: Record<string, (home: string, away: string) => string> = {
  home: (h) => `${h} 승`,
  away: (_h, a) => `${a} 승`,
  draw: () => "무승부",
  over: () => "오버",
  under: () => "언더",
}

/**
 * 내 레이스 예측 결과 — **순위 계산과 같은 필터를 쓴다.**
 *
 * 화면 두 곳이 각자 조건을 쓰면 "결과 페이지엔 5건인데 순위는 3건 기준"이 되고,
 * 상품이 걸린 이벤트에서 그건 곧바로 분쟁이다. 그래서 computeRaceStanding 과
 * 같은 파일에 두고 조건(축구 · 기간 · 이번 이벤트 판 · 신청 이후)을 그대로 복제한다.
 */
export async function fetchMyRaceSlips(
  supabase: ServiceClient,
  userId: string
): Promise<MyRaceResults> {
  const empty: MyRaceResults = {
    registered: false,
    registeredAt: null,
    slips: [],
    won: 0,
    lost: 0,
    pending: 0,
    cancelled: 0,
    netPoints: 0,
  }

  const { data: ev } = await supabase
    .from("events")
    .select("id")
    .eq("slug", GUNNERS_SEASON.dbSlug)
    .maybeSingle()
  if (!ev) return empty

  const { data: reg } = await supabase
    .from("event_registrations")
    .select("registered_at")
    .eq("event_id", ev.id)
    .eq("user_id", userId)
    .maybeSingle()
  if (!reg) return empty

  const joinedAt = new Date(reg.registered_at).getTime()

  const { data: rows } = await supabase
    .from("prediction_slips")
    .select("id, stake, total_odds, status, created_at")
    .eq("user_id", userId)
    .eq("sport", "축구")
    .gte("created_at", GUNNERS_SEASON.startAt)
    .lt("created_at", GUNNERS_SEASON.endAt)
    .or(`event_id.is.null,event_id.eq.${ev.id}`)
    .order("created_at", { ascending: false })
    .limit(500)

  const mine = (rows ?? []).filter((s) => new Date(s.created_at).getTime() >= joinedAt)
  if (mine.length === 0) {
    return { ...empty, registered: true, registeredAt: reg.registered_at }
  }

  const { data: preds } = await supabase
    .from("betman_predictions")
    .select(
      "slip_id, prediction, is_correct, game:betman_games(home_team_name, away_team_name, match_time, league_code, home_score, away_score)"
    )
    .in(
      "slip_id",
      mine.map((s) => s.id)
    )

  type PredRow = {
    slip_id: string | null
    prediction: string
    is_correct: boolean | null
    game: {
      home_team_name: string | null
      away_team_name: string | null
      match_time: string | null
      league_code: string | null
      home_score: number | null
      away_score: number | null
    } | null
  }
  const bySlip = new Map<string, RaceResultPick[]>()
  for (const p of (preds ?? []) as unknown as PredRow[]) {
    if (!p.slip_id) continue
    const home = p.game?.home_team_name ?? "홈팀"
    const away = p.game?.away_team_name ?? "원정팀"
    const list = bySlip.get(p.slip_id) ?? []
    list.push({
      home,
      away,
      league: p.game?.league_code ?? null,
      matchTime: p.game?.match_time ?? null,
      pick: (PICK_LABEL[p.prediction] ?? (() => p.prediction))(home, away),
      isCorrect: p.is_correct,
      homeScore: p.game?.home_score ?? null,
      awayScore: p.game?.away_score ?? null,
    })
    bySlip.set(p.slip_id, list)
  }

  let won = 0
  let lost = 0
  let pending = 0
  let cancelled = 0
  let netPoints = 0

  const slips: RaceResultSlip[] = mine.map((s) => {
    const stake = Number(s.stake) || 0
    const odds = Number(s.total_odds) || 1
    let net = 0
    if (s.status === "won") {
      net = stake * (odds - 1)
      won += 1
    } else if (s.status === "lost") {
      net = -stake
      lost += 1
    } else if (s.status === "cancelled") {
      cancelled += 1
    } else {
      pending += 1
    }
    netPoints += net
    return {
      id: s.id,
      createdAt: s.created_at,
      stake,
      totalOdds: odds,
      status: s.status ?? "pending",
      net,
      picks: (bySlip.get(s.id) ?? []).sort((a, b) =>
        (a.matchTime ?? "").localeCompare(b.matchTime ?? "")
      ),
    }
  })

  return {
    registered: true,
    registeredAt: reg.registered_at,
    slips,
    won,
    lost,
    pending,
    cancelled,
    netPoints,
  }
}

/** 아스날 표기 흔들림 (betman 실측: 아스널) — 메인 매치 탐색용 */
const ARSENAL_RE = /아스널|아스날/

/** 다가오는 아스날 경기 1건 (전 대회 — league_code 무관). 없으면 null */
export async function findArsenalNextMatch(supabase: ServiceClient): Promise<{
  home: string
  away: string
  matchTime: string
  league: string | null
} | null> {
  const { data } = await supabase
    .from("betman_games")
    .select("home_team_name, away_team_name, match_time, league_code")
    .eq("sport", "축구")
    .eq("status", "scheduled")
    .gt("match_time", new Date().toISOString())
    .order("match_time", { ascending: true })
    .limit(400)
  const g = (data ?? []).find(
    (row) => ARSENAL_RE.test(row.home_team_name ?? "") || ARSENAL_RE.test(row.away_team_name ?? "")
  )
  return g
    ? {
        home: g.home_team_name,
        away: g.away_team_name,
        matchTime: g.match_time,
        league: g.league_code,
      }
    : null
}
