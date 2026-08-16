import "server-only"

import type { createServiceRoleClient } from "@/lib/supabase/server"
import { kstDay } from "@/lib/saga/identity"
import fplPlayers from "@/public/data/fpl-players.json"

type ServiceClient = ReturnType<typeof createServiceRoleClient>

/**
 * 시즌 위키 데이터 조립 (D4: 팀+시즌 문서) — 전부 기존 데이터의 재조립이라 수집 0.
 *
 * - 스쿼드: fpl-players.json (EPL 전 선수 한글명·포지션)
 * - 순위: standings_cache(epl) — 시즌 전엔 직전 시즌 최종 순위가 남아 있으므로
 *   fetched_at 을 함께 반환해 화면이 "기준일"을 표시한다
 * - 일정·결과: betman_games 한글 팀명 매칭 (마켓별 중복행 → 경기 단위 dedup)
 * - 관련 이적 사가: 엔트리 헤드라인에 팀명이 등장하는 transfer 사가 (휴리스틱 —
 *   이적 사가 identity 에 클럽이 없어서(D2) 텍스트 매칭이 v1 의 접합면)
 */

export interface SeasonSubject {
  team_id: string
  team_kr: string
  team_fpl: string
  aliases: string[]
  season: string
}

interface SquadPlayer {
  name: string
  nameKo: string
  position: string
}

interface SeasonStanding {
  rank: number
  played: number
  win: number
  draw: number
  loss: number
  points: number
  goalDiff: number
  fetchedAt: string
}

interface SeasonMatch {
  matchTime: string
  home: string
  away: string
  homeScore: number | null
  awayScore: number | null
  status: string
  leagueCode: string | null
}

interface RelatedSaga {
  slug: string
  title: string
  stage: string
  status: string
  outcome: string | null
  entry_count: number
}

// fpl-players.json 의 실제 포지션 값: GK / DF / MF / FW
const POSITION_ORDER = ["GK", "DF", "MF", "FW"] as const
const POSITION_LABEL: Record<string, string> = {
  GK: "골키퍼",
  DF: "수비수",
  MF: "미드필더",
  FW: "공격수",
}

export function loadSquad(
  teamFpl: string
): { position: string; label: string; players: SquadPlayer[] }[] {
  const players = (
    fplPlayers as { name: string; nameKo: string; team: string; position: string }[]
  ).filter((p) => p.team === teamFpl)
  return POSITION_ORDER.map((pos) => ({
    position: pos,
    label: POSITION_LABEL[pos] ?? pos,
    players: players
      .filter((p) => p.position === pos)
      .map((p) => ({ name: p.name, nameKo: p.nameKo, position: p.position })),
  })).filter((g) => g.players.length > 0)
}

export async function fetchStanding(
  supabase: ServiceClient,
  teamKr: string
): Promise<SeasonStanding | null> {
  const { data } = await supabase
    .from("standings_cache")
    .select("data, fetched_at")
    .eq("league_id", "epl")
    .maybeSingle()
  if (!data) return null
  const rows = (data.data ?? []) as Record<string, unknown>[]
  const idx = rows.findIndex((r) => r["팀명"] === teamKr)
  if (idx < 0) return null
  const r = rows[idx]
  return {
    rank: idx + 1,
    played: Number(r["경기"] ?? 0),
    win: Number(r["승"] ?? 0),
    draw: Number(r["무"] ?? 0),
    loss: Number(r["패"] ?? 0),
    points: Number(r["승점"] ?? 0),
    goalDiff: Number(r["골득실"] ?? 0),
    fetchedAt: data.fetched_at as string,
  }
}

/** "2026-27" → 그 시즌의 시작 경계 (7/1) — 프리시즌 친선전부터 이 문서 소속 */
export function seasonStartIso(season: string): string {
  const year = Number(season.slice(0, 4)) || new Date().getFullYear()
  return `${year}-07-01T00:00:00Z`
}

/**
 * 시즌 종료 경계 (다음해 7/1, exclusive) — 지난 시즌 문서(예: 아스날 25-26 완전체
 * 레퍼런스, 2026-08-07 오너)에 다음 시즌 프리시즌이 섞여 들어오는 것을 막는다.
 */
export function seasonEndIso(season: string): string {
  const year = Number(season.slice(0, 4)) || new Date().getFullYear()
  return `${year + 1}-07-01T00:00:00Z`
}

export async function fetchMatches(
  supabase: ServiceClient,
  aliases: string[],
  season: string
): Promise<SeasonMatch[]> {
  const names = aliases.filter((a) => /[가-힣]/.test(a)) // betman 은 한글 표기
  if (names.length === 0) return []
  const orExpr = names.map((n) => `home_team_name.eq.${n},away_team_name.eq.${n}`).join(",")
  const { data } = await supabase
    .from("betman_games")
    .select(
      "match_time, home_team_name, away_team_name, home_score, away_score, status, league_code"
    )
    .or(orExpr)
    // 시즌 문서엔 그 시즌 경기만 — 지난 시즌 경기가 섞여 나오면 문서가 아니라 잡탕이다
    .gte("match_time", seasonStartIso(season))
    .lt("match_time", seasonEndIso(season))
    .order("match_time", { ascending: false })
    .limit(120)

  // 마켓/전반전 중복행 → 경기 단위 dedup (시간+홈+원정)
  const seen = new Set<string>()
  const matches: SeasonMatch[] = []
  for (const g of data ?? []) {
    const dedupKey = `${g.match_time}|${g.home_team_name}|${g.away_team_name}`
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)
    matches.push({
      matchTime: g.match_time as string,
      home: g.home_team_name as string,
      away: g.away_team_name as string,
      homeScore: g.home_score as number | null,
      awayScore: g.away_score as number | null,
      status: g.status as string,
      leagueCode: g.league_code as string | null,
    })
    if (matches.length >= 20) break
  }
  return matches
}

/**
 * 팀 연대기 — 실록처럼 시간순 한 줄기 (2026-08-04 운영자: "세종실록 써 내려가듯이").
 * 사료 = 완료된 경기 + 이 팀이 얽힌 이적 사가 엔트리. 시즌 경계(7/1) 이후만.
 */
export type ChronicleEvent =
  | { kind: "match"; occurredAt: string; match: SeasonMatch }
  | {
      kind: "transfer"
      occurredAt: string
      headline: string
      tier: string
      stageAfter: string | null
      sagaSlug: string
      sagaTitle: string
    }
  | { kind: "article"; occurredAt: string; postId: string; title: string }
  // 시즌 문서 자신의 엔트리 = 경기 카드 (D17 — 리뷰 카드가 연표에 쌓이는 최소 구현).
  // betman 에 없는 경기(지난 시즌 백필·크롤 수집분)도 이 경로로 연대기에 실린다.
  | {
      kind: "entry"
      occurredAt: string
      headline: string
      summary: string | null
      url: string | null
    }

export async function fetchTeamChronicle(
  supabase: ServiceClient,
  seasonSagaId: string,
  aliases: string[],
  season: string,
  completedMatches: SeasonMatch[]
): Promise<ChronicleEvent[]> {
  const orExpr = aliases.map((a) => `headline.ilike.%${a}%`).join(",")
  const [{ data: entries }, { data: ownEntries }] = await Promise.all([
    supabase
      .from("saga_entries")
      .select("headline, tier, stage_after, occurred_at, sagas!inner ( slug, title, saga_type )")
      .or(orExpr)
      .gte("occurred_at", seasonStartIso(season))
      .lt("occurred_at", seasonEndIso(season))
      .limit(300),
    // 이 시즌 문서 자신의 엔트리 (경기 카드 — D17)
    supabase
      .from("saga_entries")
      .select("headline, summary, origin, occurred_at")
      .eq("saga_id", seasonSagaId)
      .order("occurred_at", { ascending: true })
      .limit(150),
  ])

  const events: ChronicleEvent[] = []
  const entryDatesKst = new Set<string>()
  const kstDate = kstDay
  for (const e of ownEntries ?? []) {
    const origin = (e.origin ?? {}) as { url?: string }
    entryDatesKst.add(kstDate(e.occurred_at as string))
    events.push({
      kind: "entry",
      occurredAt: e.occurred_at as string,
      headline: e.headline as string,
      summary: (e.summary as string | null) ?? null,
      url: origin.url ?? null,
    })
  }
  for (const e of entries ?? []) {
    const saga = e.sagas as unknown as { slug: string; title: string; saga_type: string }
    if (saga.saga_type !== "transfer") continue
    events.push({
      kind: "transfer",
      occurredAt: e.occurred_at as string,
      headline: e.headline as string,
      tier: e.tier as string,
      stageAfter: e.stage_after as string | null,
      sagaSlug: saga.slug,
      sagaTitle: saga.title,
    })
  }
  for (const m of completedMatches) {
    if (m.status !== "completed" || m.homeScore === null) continue
    // 자기 엔트리(경기 카드)가 같은 날에 이미 있으면 betman 행은 중복 — 엔트리가 정본
    // (한 팀이 하루 두 경기를 치르지 않으므로 날짜 충돌 = 같은 경기)
    if (entryDatesKst.has(kstDate(m.matchTime))) continue
    events.push({ kind: "match", occurredAt: m.matchTime, match: m })
  }

  // 이 시즌 문서에 직접 연결된 기사 사료 (인터뷰·경기 반응 — 발행 훅이 연결)
  const { data: articleLinks } = await supabase
    .from("saga_article_links")
    .select("post_id, posts ( title, created_at )")
    .eq("saga_id", seasonSagaId)
    .limit(200)
  for (const l of articleLinks ?? []) {
    const post = l.posts as unknown as { title: string; created_at: string } | null
    if (!post) continue
    events.push({
      kind: "article",
      occurredAt: post.created_at,
      postId: l.post_id as string,
      title: post.title,
    })
  }

  // 실록은 시간순 — 오래된 사건이 위, 새 사료는 아래로 붙는다
  events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  return events
}

async function fetchRelatedTransferSagas(
  supabase: ServiceClient,
  aliases: string[]
): Promise<RelatedSaga[]> {
  const orExpr = aliases.map((a) => `headline.ilike.%${a}%`).join(",")
  const { data: entries } = await supabase
    .from("saga_entries")
    .select("saga_id")
    .or(orExpr)
    .limit(200)
  const ids = [...new Set((entries ?? []).map((e) => e.saga_id as string))]
  if (ids.length === 0) return []

  const { data: sagas } = await supabase
    .from("sagas")
    .select("slug, title, stage, status, outcome, entry_count")
    .in("id", ids)
    .eq("saga_type", "transfer")
    .order("last_event_at", { ascending: false })
    .limit(20)
  return (sagas ?? []) as RelatedSaga[]
}
