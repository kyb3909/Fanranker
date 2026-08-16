import "server-only"

import { unstable_cache } from "next/cache"
import { chatParams } from "@/lib/llm/openai-params"
import { findUniqueRomanizedMatch } from "@/lib/news/notation"
import {
  getLineupForGame,
  resolveMatchEvent,
  type LineupResponse,
} from "@/lib/soccerway/lineup-lookup"

/**
 * 매치 부가정보 — 기초 스탯 + 경기 리포트 (2026-08-16, 운영자 요청).
 *
 * ## 데이터 경로 (실측: 알라베스 v 헤타페 E75kfwuq)
 * - 스탯: `pq_graphql?_hash=dsos2&eventId=` — xG·점유율·슈팅·빅찬스 양팀, plain fetch
 * - 리포트: `_hash=fsned&entityId={eventId}` → articleId → `_hash=nah` → 제목·슬러그
 *   → `/news/{slug}/{id}/` SSR HTML 에 본문 문단이 통째로 들어있다 (헤드리스 불필요)
 * - eventId 는 라인업 경로의 해석(24h 캐시)을 재사용 — resolveMatchEvent
 *
 * ## 리포트 한글화
 * 원문은 영문이다. 전문 전재는 하지 않는다 — 콘텐츠 한글 원칙 + 저작권. gpt-4o-mini 로
 * **드라이 톤 요약 리포트**를 재작성한다 (사실만, 수사 금지, 3~4문단). 크롤링 출처는
 * 화면에 노출하지 않는다 (rewrite 은닉 원칙과 동일선).
 *
 * ## 캐시·실패 규율
 * 전부 fail-open (null → 섹션 미노출). 리포트는 FT 후 뒤늦게 올라오므로 "아직 없음"을
 * 24h 캐시에 박으면 안 된다 — eventId 해석과 같은 throw-회피 패턴을 쓴다.
 */

const GRAPHQL_BASE = "https://2020.ds.lsapp.eu/pq_graphql"
const FETCH_HEADERS = {
  Accept: "application/json",
  "Accept-Language": "en-GB,en;q=0.9",
  Referer: "https://www.soccerway.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
}

/* ── 기초 스탯 ── */

export interface MatchStatRow {
  label: string // 한글 지표명
  home: string
  away: string
  /** 바 시각화용 수치 (파싱 불가 시 null) */
  homeNum: number | null
  awayNum: number | null
}

/** dsos2 의 type → 한글 지표명. 목록 밖 지표는 버린다 (한글 원칙 — 영문 지표명 노출 금지) */
const STAT_LABELS: Record<string, string> = {
  expected_goals: "기대득점 (xG)",
  ball_possession: "점유율",
  goal_attempts: "슈팅",
  big_chances: "빅찬스",
  touches_in_opposition_box: "상대 박스 터치",
}

interface StatsEntry {
  type?: string
  label?: string
  value?: string
}

async function fetchStats(eventId: string): Promise<MatchStatRow[] | null> {
  try {
    const res = await fetch(`${GRAPHQL_BASE}?_hash=dsos2&eventId=${eventId}&projectId=2020`, {
      headers: FETCH_HEADERS,
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      data?: {
        findEventById?: {
          eventParticipants?: {
            type?: { side?: string }
            stats?: { values?: StatsEntry[] }[]
          }[]
        }
      }
    }
    const parts = json.data?.findEventById?.eventParticipants ?? []
    const bySide = (side: string) =>
      parts.find((p) => p.type?.side === side)?.stats?.flatMap((s) => s.values ?? []) ?? []
    const home = bySide("HOME")
    const away = bySide("AWAY")
    if (home.length === 0 || away.length === 0) return null

    const rows: MatchStatRow[] = []
    for (const [type, label] of Object.entries(STAT_LABELS)) {
      const h = home.find((v) => v.type === type)
      const a = away.find((v) => v.type === type)
      if (!h?.label || !a?.label) continue
      rows.push({
        label,
        home: h.label,
        away: a.label,
        homeNum: h.value != null && h.value !== "" ? Number(h.value) : null,
        awayNum: a.value != null && a.value !== "" ? Number(a.value) : null,
      })
    }
    return rows.length > 0 ? rows : null
  } catch {
    return null
  }
}

/** 스탯 5분 캐시 — LIVE 중에도 크게 뒤처지지 않는 선 */
function cachedStats(eventId: string) {
  return unstable_cache(() => fetchStats(eventId), ["match-stats", eventId], { revalidate: 300 })
}

/* ── 경기 리포트 ── */

export interface MatchReport {
  title: string
  paragraphs: string[]
}

/** fsned → 이 경기의 기사 id (없으면 null — 리포트는 FT 후 뒤늦게 붙는다) */
async function findArticleId(eventId: string): Promise<string | null> {
  const res = await fetch(
    `${GRAPHQL_BASE}?_hash=fsned&projectId=2020&entityId=${eventId}&layoutTypeId=2`,
    { headers: FETCH_HEADERS }
  )
  if (!res.ok) return null
  const json = (await res.json()) as {
    data?: {
      findNewsLayoutForEventDetail?: {
        sections?: { articles?: { id?: string }[] }[]
      }
    }
  }
  for (const s of json.data?.findNewsLayoutForEventDetail?.sections ?? []) {
    for (const a of s.articles ?? []) if (a.id) return a.id
  }
  return null
}

/** nah → 슬러그 → 뉴스 페이지 SSR HTML → 본문 문단 (영문) */
async function fetchArticleBody(
  articleId: string
): Promise<{ title: string; paragraphs: string[] } | null> {
  const meta = await fetch(`${GRAPHQL_BASE}?_hash=nah&articleId=${articleId}`, {
    headers: FETCH_HEADERS,
  })
  if (!meta.ok) return null
  const json = (await meta.json()) as {
    data?: { findCatArticleById?: { title?: string; slug?: string } }
  }
  const art = json.data?.findCatArticleById
  if (!art?.title || !art.slug) return null

  const page = await fetch(`https://www.soccerway.com/news/${art.slug}/${articleId}/`, {
    headers: { ...FETCH_HEADERS, Accept: "text/html" },
  })
  if (!page.ok) return null
  const html = await page.text()
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map((m) =>
      m[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#39;|&apos;/g, "'")
        .replace(/\s+/g, " ")
        .trim()
    )
    // 스크립트 잔재·내비 텍스트 컷 — 본문 문단은 길고 코드 문자가 없다
    .filter((t) => t.length > 80 && !/[{}<>]|function|window\./.test(t))
  if (paragraphs.length < 2) return null
  return { title: art.title, paragraphs }
}

/* ── 리포트 파이프라인: ① 사건 추출 → ② 이름 확정(라인업 대조) → ③ 한국어 작성 ──
 *
 * 한 번의 번역 LLM 은 배경 서사를 끌고 오고 선수 표기를 지어냈다 (운영자: "정밀한
 * 구조가 필요 — 주요 사건만 정리, 라인업과 대조해 이름 확인"). 그래서 뉴스 검사관과
 * 같은 단계식으로 쪼갠다. 이름의 근거는 LLM 의 감이 아니라 **그 경기의 실제 라인업**
 * (스쿼드 사전 한글)이다. */

const MODEL = "gpt-4o-mini"

async function callLLM(system: string, user: unknown, maxTokens: number): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      ...chatParams(MODEL, { temperature: 0, max_tokens: maxTokens }),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) },
      ],
    }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? null
}

interface MatchEvent {
  minute: string | null
  type: string
  team: "home" | "away" | null
  players: string[]
  detail: string
}

/** ① 원문 → 경기 중 사건만 구조화 (영문 그대로 — 번역은 ③의 몫) */
async function extractEvents(
  title: string,
  paragraphs: string[]
): Promise<{ score: string | null; events: MatchEvent[] } | null> {
  const content = await callLLM(
    `축구 경기 리포트에서 **경기 중에 일어난 사건만** 추출하는 파서다.
- 대상: 득점(goal/own_goal/penalty), 도움, 카드(yellow_card/red_card), VAR 판정(var), 교체(sub), 부상(injury), 결정적 기회(chance).
- 제외: 시즌 배경, 팀 근황, 전망, 평가, 감독 코멘트가 아닌 서사.
- players 는 원문 표기 그대로(영문). detail 은 **원문의 장면 묘사를 최대한 보존한 영문 1~3문장** —
  득점이면 빌드업·도움·슛 종류(헤더/발리/중거리/침투)·위치·골키퍼 상황까지, 퇴장이면 어떤 파울이었고
  판정이 어떻게 진행됐는지. 원문에 있는 만큼만, 뭉개서 요약하지 마라.
- minute 은 원문에 있으면 "43'" 형식, 없으면 null. 사건이 없으면 events 는 빈 배열.
- 출력: {"score": "3-0" 또는 null, "events": [{"minute", "type", "team": "home|away|null", "players": [], "detail"}]} JSON. 사건은 시간 순.`,
    { title, paragraphs: paragraphs.slice(0, 12) },
    1800
  )
  if (!content) return null
  try {
    const parsed = JSON.parse(content) as { score?: string | null; events?: MatchEvent[] }
    if (!Array.isArray(parsed.events) || parsed.events.length === 0) return null
    return { score: parsed.score ?? null, events: parsed.events }
  } catch {
    return null
  }
}

/** ② 사건 속 영문 선수명 → 그 경기 라인업의 확정 표기 (결정론 — LLM 없음) */
function groundPlayerNames(
  events: MatchEvent[],
  lineup: LineupResponse
): { events: MatchEvent[]; grounded: number; total: number } {
  if (lineup.status !== "ready") return { events, grounded: 0, total: 0 }
  const roster = [
    ...lineup.home.starters,
    ...lineup.home.bench,
    ...lineup.away.starters,
    ...lineup.away.bench,
  ]
    .filter((p) => p.roman)
    .map((p) => ({ romanized: p.roman, label: p.label }))

  let grounded = 0
  let total = 0
  const out = events.map((e) => ({
    ...e,
    players: e.players.map((name) => {
      total++
      // 동명이인이면 null — 틀린 확정보다 원문 유지가 낫다 (표기 사전과 같은 규율)
      const hit = findUniqueRomanizedMatch(roster, name)
      if (hit) grounded++
      return hit?.label ?? name
    }),
  }))
  return { events: out, grounded, total }
}

/** ③ 확정된 사건 목록 → 담백한 한국어 리포트 */
async function composeReportKo(
  homeTeam: string,
  awayTeam: string,
  score: string | null,
  events: MatchEvent[]
): Promise<MatchReport | null> {
  const content = await callLLM(
    `구조화된 경기 사건 목록으로 한국어 경기 리포트를 쓰는 에디터다. 규칙:
- **사건 목록에 있는 것만** 쓴다. 배경·전망·평가·의미 부여 금지 (운영자 지시: "경기 중에 일어난 일만").
- 단, **득점·퇴장 장면은 detail 을 근거로 구체적으로 묘사한다** — 공격이 어떻게 만들어졌고,
  누가 도왔고, 어떤 슛(헤더·발리·중거리 등)이 어디로 들어갔는지. 퇴장은 어떤 파울에 어떤
  판정 과정이었는지. detail 에 없는 묘사를 지어내는 것은 금지 (운영자: "정확히 골 장면이나
  퇴장 장면을 묘사").
- 톤: 사실 기반. 감탄사·과장·클리셰("환상적인", "믿을 수 없는")는 금지지만, 장면이 눈에
  그려지게는 쓴다. 기사체 평서문.
- 선수 이름은 목록의 표기를 **한 글자도 바꾸지 말고 그대로** 쓴다 (한글이면 한글 그대로, 영문이면 영문 그대로 — 음차하지 마라).
- 팀 이름: 홈팀 "${homeTeam}", 원정팀 "${awayTeam}".
- 시간 순서대로 3~5문단, 문단당 2~3문장.
- 제목: 간결하되 사실 왜곡 금지 — 퇴장·수적 열세는 어느 팀 것인지 분명히.
- 출력: {"title": "...", "paragraphs": ["...", ...]} JSON.`,
    { home: homeTeam, away: awayTeam, score, events },
    1800
  )
  if (!content) return null
  try {
    const parsed = JSON.parse(content) as { title?: string; paragraphs?: string[] }
    if (!parsed.title || !Array.isArray(parsed.paragraphs) || parsed.paragraphs.length === 0) {
      return null
    }
    return { title: parsed.title, paragraphs: parsed.paragraphs.filter((p) => p.trim()) }
  } catch {
    return null
  }
}

/**
 * 리포트 24h 캐시. "아직 기사 없음"은 캐시하지 않는다 — throw 로 회피
 * (unstable_cache 는 예외를 캐시하지 않는다. lineup-lookup 의 eventId 패턴과 동일).
 */
function cachedReport(eventId: string, gameId: string, homeTeam: string, awayTeam: string) {
  return unstable_cache(
    async (): Promise<MatchReport> => {
      const articleId = await findArticleId(eventId)
      if (!articleId) throw new Error("report-not-yet")
      const body = await fetchArticleBody(articleId)
      if (!body) throw new Error("report-not-yet")

      // ① 사건 추출 → ② 라인업 대조로 이름 확정 → ③ 작성
      const extracted = await extractEvents(body.title, body.paragraphs)
      if (!extracted) throw new Error("report-not-yet")
      const lineup = await getLineupForGame(gameId).catch(
        () => ({ status: "none" }) as LineupResponse
      )
      const { events } = groundPlayerNames(extracted.events, lineup)
      const ko = await composeReportKo(homeTeam, awayTeam, extracted.score, events)
      if (!ko) throw new Error("report-not-yet")
      return ko
    },
    ["match-report-v3", eventId],
    { revalidate: 24 * 3600 }
  )
}

/* ── 본체 ── */

export interface MatchExtras {
  stats: MatchStatRow[] | null
  report: MatchReport | null
}

export async function getMatchExtras(gameId: string): Promise<MatchExtras> {
  const resolved = await resolveMatchEvent(gameId)
  if (!resolved) return { stats: null, report: null }
  const [stats, report] = await Promise.all([
    cachedStats(resolved.eventId)().catch(() => null),
    cachedReport(resolved.eventId, gameId, resolved.homeTeam, resolved.awayTeam)().catch(
      () => null
    ),
  ])
  return { stats, report }
}
