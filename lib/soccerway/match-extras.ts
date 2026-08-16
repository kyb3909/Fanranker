import "server-only"

import { unstable_cache } from "next/cache"
import { chatParams } from "@/lib/llm/openai-params"
import { resolveMatchEvent } from "@/lib/soccerway/lineup-lookup"

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

/** 영문 리포트 → 드라이 톤 한글 재작성. 실패는 null (fail-open) */
async function rewriteReportKo(
  title: string,
  paragraphs: string[],
  homeTeam: string,
  awayTeam: string
): Promise<MatchReport | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  const MODEL = "gpt-4o-mini"
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        ...chatParams(MODEL, { temperature: 0.2, max_tokens: 1400 }),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `축구 경기 리포트를 한국어로 재작성하는 에디터다. 규칙:
- 드라이 톤: 사실만, 감탄·수사·과장 금지. 존댓말 아님 (기사체 평서문).
- 원문에 없는 사실을 지어내지 마라. 숫자·득점자·시간은 원문 그대로.
- 팀 이름: 홈팀은 "${homeTeam}", 원정팀은 "${awayTeam}" 로 부른다. 선수 이름은 한국 축구 미디어의 정착된 한글 표기로, 확신 없으면 영문 그대로.
- 분량: 3~4문단, 문단당 2~3문장.
- 제목: 간결하되 사실이 왜곡되면 안 된다 — 퇴장·수적 열세는 어느 팀 것인지 분명히 (예: "10명의 헤타페를 상대로"이지 "10명으로 승리"가 아니다).
- 출력: {"title": "한글 제목(간결)", "paragraphs": ["문단1", "문단2", ...]} JSON.`,
          },
          {
            role: "user",
            content: JSON.stringify({ title, paragraphs: paragraphs.slice(0, 10) }),
          },
        ],
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
      title?: string
      paragraphs?: string[]
    }
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
function cachedReport(eventId: string, homeTeam: string, awayTeam: string) {
  return unstable_cache(
    async (): Promise<MatchReport> => {
      const articleId = await findArticleId(eventId)
      if (!articleId) throw new Error("report-not-yet")
      const body = await fetchArticleBody(articleId)
      if (!body) throw new Error("report-not-yet")
      const ko = await rewriteReportKo(body.title, body.paragraphs, homeTeam, awayTeam)
      if (!ko) throw new Error("report-not-yet")
      return ko
    },
    ["match-report", eventId],
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
    cachedReport(resolved.eventId, resolved.homeTeam, resolved.awayTeam)().catch(() => null),
  ])
  return { stats, report }
}
