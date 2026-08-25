import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { chatParams } from "@/lib/llm/openai-params"
import { findUniqueRomanizedMatch } from "@/lib/news/notation"
import { matchByNickname } from "@/lib/soccerway/nickname-match"
import { wrongScore } from "@/lib/soccerway/score-gate"
import {
  getLineupForGame,
  resolveMatchEvent,
  type LineupResponse,
  cachedPersons,
  cachedSquadPairs,
} from "@/lib/soccerway/lineup-lookup"
import { logUsage } from "@/lib/llm/usage-log"

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
 * 전부 fail-open (null → 섹션 미노출).
 * 성공한 리포트는 `match_reports` 에 **영구 저장**하고, 저장분을 해석보다 먼저 읽는다 —
 * soccerway 해석에 킥오프 +24시간 창이 걸려 있어 그 뒤로는 재생성이 불가능하기 때문이다.
 * 실패도 30분간 캐시한다. 종전엔 throw 로 캐시를 회피했는데, 리포트가 안 나오는 경기는
 * **페이지를 열 때마다** LLM 체인을 처음부터 다시 돌아 매치 페이지가 몇 초씩 걸렸다
 * (2026-08-18 운영자 제보).
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

interface MatchStatRow {
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

interface MatchReport {
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

/** 추출·작성 — 4o-mini 는 장면 디테일을 뭉개고 표기가 흔들렸다 (운영자: 더 높은 걸로).
 *  비용은 경기당 ~$0.05, 24h 캐시라 하루 수십 회가 상한. 요율표: assignment-desk.ts */
const MODEL = "gpt-5.1"
/** 검증자는 뉴스 검사관과 같은 모델 — 4o-mini 는 검증 역할에서 오탐이 많았다 (실측:
 *  "맞지만 잘못된 것으로 보일 수 있다"류 자기모순 지적으로 정상 리포트를 죽였다) */
const VERIFIER_MODEL = "gpt-5.6-terra"

async function callLLM(
  system: string,
  user: unknown,
  maxTokens: number,
  model: string = MODEL
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      ...chatParams(model, { temperature: 0, max_tokens: maxTokens }),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) },
      ],
    }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  logUsage("match-report", model, data)
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
- 대상: 득점(goal/own_goal/penalty), 도움, 카드(yellow_card/red_card), VAR 판정(var), 교체(sub), 부상(injury), 결정적 기회(chance),
  그리고 **주목 포인트(note)** — 원문이 짚은 경기 속 인상적 사실: 골키퍼 선방, 크로스바·포스트, 파울 누적,
  한 팀의 압도, 선수의 기록(예: "리그 두 번째로 많은 골") 같은 것. 기회(chance)는 불발이어도 결정적이었으면 넣는다.
- 제외: 다음 경기 전망, 순위 계산, 필자의 평가·감상.
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

/**
 * ② 사건 속 영문 선수명 → 한글 확정 표기 (결정론 — LLM 없음)
 *
 * ⚠️⚠️ **3단 폴백**이다 (2026-08-25). 종전엔 그 경기 라인업 로스터 **한 곳만** 봤고,
 *    라인업이 안 잡히면(`status !== "ready"`) 전원을 영문 그대로 통과시켰다. 그래서
 *    사전에 "리바이 콜윌"·"베른트 레노"가 멀쩡히 있는데도 리포트만 영문으로 나갔다
 *    (운영자 제보). 같은 경기의 **라인업 화면은 한글로 잘 나오고 있었다** — 그쪽은
 *    이미 사전 2단 폴백을 쓰고 있었기 때문이다. 리포트만 혼자 1단이었던 셈이다.
 *
 *    ① 그 경기 라인업 로스터 — 가장 강한 근거 (그 경기에 실제로 뛴 사람)
 *    ② 표기 사전(notation persons) — 운영자 확정 표기가 정본
 *    ③ 팀 스쿼드 사전(team_squads) — 슬러그 정확 매칭, 수확분
 *
 *    셋 다 못 찾으면 영문을 남긴다 — 틀린 한글보다 원문이 낫다는 규율은 그대로다.
 */
async function groundPlayerNames(
  events: MatchEvent[],
  lineup: LineupResponse
): Promise<{ events: MatchEvent[]; grounded: number; total: number }> {
  const roster =
    lineup.status === "ready"
      ? [
          ...lineup.home.starters,
          ...lineup.home.bench,
          ...lineup.away.starters,
          ...lineup.away.bench,
        ]
          .filter((p) => p.roman)
          .map((p) => ({ romanized: p.roman, label: p.label }))
      : []

  // ②③ 사전 — 라인업이 못 잡은 이름을 받는다. 실패해도 리포트는 계속 간다(fail-open).
  const persons = await cachedPersons().catch(
    () => [] as { romanized: string | null; preferred_ko: string }[]
  )
  const squadPairs = await cachedSquadPairs().catch(() => [] as [string, string][])
  // 같은 슬러그가 서로 다른 한글명으로 두 번 나오면(전 소속팀 잔재) 둘 다 버린다
  const squadKo = new Map<string, string>()
  const clash = new Set<string>()
  for (const [slug, ko] of squadPairs) {
    const prev = squadKo.get(slug)
    if (prev !== undefined && prev !== ko) clash.add(slug)
    else squadKo.set(slug, ko)
  }
  for (const sl of clash) squadKo.delete(sl)
  // 스쿼드 사전도 로마자 토큰 매칭에 태운다 — 기사 표기("Levi Colwill")와 슬러그
  // 표기("colwill levi")는 어순이 다르므로 정확 문자열 비교로는 못 잡는다.
  const squadEntries = [...squadKo.entries()].map(([slug, ko]) => ({
    romanized: slug,
    preferred_ko: ko,
  }))

  const resolve = (name: string): string | null => {
    const inLineup = findUniqueRomanizedMatch(roster, name)
    if (inLineup) return inLineup.label
    const inNotation = findUniqueRomanizedMatch(persons, name)
    if (inNotation) return inNotation.preferred_ko
    const inSquad = findUniqueRomanizedMatch(squadEntries, name)
    if (inSquad) return inSquad.preferred_ko
    // ④ 애칭 보정 — 마지막 수단
    const nick =
      matchByNickname(roster, name)?.label ??
      matchByNickname(persons, name)?.preferred_ko ??
      matchByNickname(squadEntries, name)?.preferred_ko
    return nick ?? null
  }

  let grounded = 0
  let total = 0
  const out = events.map((e) => ({
    ...e,
    players: e.players.map((name) => {
      total++
      // 동명이인이면 null — 틀린 확정보다 원문 유지가 낫다 (표기 사전과 같은 규율)
      const hit = resolve(name)
      if (hit) grounded++
      return hit ?? name
    }),
  }))
  return { events: out, grounded, total }
}

/** ③ 확정된 사건 목록 → 담백한 한국어 리포트 */
async function composeReportKo(
  homeTeam: string,
  awayTeam: string,
  score: string | null,
  events: MatchEvent[],
  stats: MatchStatRow[] | null,
  feedback?: string[]
): Promise<MatchReport | null> {
  const content = await callLLM(
    `구조화된 경기 사건 목록과 실측 스탯으로 한국어 경기 리포트를 쓰는 에디터다. 규칙:
- **사건 목록과 스탯에 있는 것만** 쓴다. 다음 경기 전망·순위 계산·필자 감상은 금지.
- **득점·퇴장 장면은 detail 을 근거로 구체적으로 묘사한다** — 공격이 어떻게 만들어졌고,
  누가 도왔고, 어떤 슛(헤더·발리·중거리 등)이 어디로 들어갔는지. 퇴장은 어떤 파울에 어떤
  판정 과정이었는지. detail 에 없는 묘사를 지어내는 것은 금지.
- **detail 이 특정하지 않는 것은 특정하지 마라** — 슛 종류(헤더/발리/슈팅)가 명시돼 있지
  않으면 "마무리했다"·"골로 연결했다"처럼 종류 중립으로 쓴다. 시간(분)도 minute·detail 에
  없으면 쓰지 않는다.
- **분량이 우선 규칙이다 (운영자: "너무 길다")** — 전체 2~3문단, 총 6~9문장. 모든 사건을
  다 쓰려 하지 마라: 득점·퇴장·승부처만 본문으로, note·불발 기회·선방은 **가장 인상적인
  한두 개만** 골라 끼워 넣는다. 나머지는 버린다.
- **승부에 영향 준 교체는 쓴다** — 득점·도움에 관여한 교체 투입 선수는 "몇 분에 교체
  투입된 ○○" 식으로 시간과 함께 명시한다 (운영자: 교체가 언제 어떻게 들어갔는지 빠져 아쉽다).
  영향 없는 교체는 생략.
- **마지막 문단 끝 1~2문장으로 경기 흐름** — 제공된 스탯 중 가장 말이 되는 수치 2~3개만
  골라(xG·슈팅 등) 어느 쪽이 주도했는지 짚는다. 스탯 나열 금지, 제공되지 않은 수치 금지.
- **숫자(시간·개수·기록·수치)는 사건 목록·스탯·score 에 있는 것만** 쓴다. 새 숫자를 만들지 마라.
- 톤: 사실 기반. 감탄사·과장·클리셰("환상적인", "믿을 수 없는")는 금지지만, 장면이 눈에
  그려지게는 쓴다. 기사체 평서문.
- 선수 이름은 목록의 표기를 **한 글자도 바꾸지 말고 그대로** 쓴다 (한글이면 한글 그대로, 영문이면 영문 그대로 — 음차하지 마라).
- 팀 이름: 홈팀 "${homeTeam}", 원정팀 "${awayTeam}".
- ⚠️ **최종 스코어는 ${score ?? "(미확정)"} 이다 — 홈 ${homeTeam} 기준이다.** 이 스코어와
  다른 조합을 제목이나 본문에 절대 쓰지 마라. 사건 목록의 골 수를 세어 다른 값이
  나오더라도 **이 스코어가 정본**이다 (목록에 누락된 골이 있을 수 있다). 승패도 여기서 나온다.
- 시간 순서대로 2~3문단, 문단당 2~3문장.
- 제목: 간결하되 사실 왜곡 금지 — 퇴장·수적 열세는 어느 팀 것인지 분명히.
- 출력: {"title": "...", "paragraphs": ["...", ...]} JSON.`,
    {
      home: homeTeam,
      away: awayTeam,
      score,
      events,
      stats: (stats ?? []).map((s) => ({ 지표: s.label, [homeTeam]: s.home, [awayTeam]: s.away })),
      ...(feedback && feedback.length > 0
        ? { 검증_지적사항: feedback, 지시: "지적된 내용을 제거하거나 근거 안으로 고쳐 다시 써라" }
        : {}),
    },
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

/* ── 환각 가드 (운영자: "환각 가드가 진짜 중요") ──
 * 자유 에이전트가 아니라 고정 단계 + 독립 검증자 + 결정론 게이트 구조다
 * (뉴스 Terra 검사관과 같은 패턴 — 런타임 멀티에이전트는 이 코드베이스 금기). */

/** ④ 결정론 게이트 — 출력의 모든 숫자가 입력 재료 어딘가에 있어야 한다 (코드, LLM 아님) */
function numbersGate(
  report: MatchReport,
  sources: {
    paragraphs: string[]
    events: MatchEvent[]
    stats: MatchStatRow[] | null
    score: string | null
  }
): { ok: boolean; rogue: string[] } {
  const nums = (s: string) => s.match(/\d+(?:\.\d+)?/g) ?? []
  const allowed = new Set<string>()
  const feed = (s: string | null | undefined) => {
    for (const n of nums(s ?? "")) {
      allowed.add(n)
      if (n.includes(".")) allowed.add(n.split(".")[0]) // 1.93 → 1 도 허용 (반올림 서술)
    }
  }
  for (const p of sources.paragraphs) feed(p)
  for (const e of sources.events) {
    feed(e.minute)
    feed(e.detail)
    for (const p of e.players) feed(p)
  }
  for (const s of sources.stats ?? []) {
    feed(s.home)
    feed(s.away)
    feed(s.label)
  }
  feed(sources.score)
  // 스코어 개별 숫자 ("3-0" → 3, 0) 와 흔한 서수(전/후반 45·90)는 기본 허용
  for (const n of ["0", "1", "2", "45", "90"]) allowed.add(n)

  const rogue: string[] = []
  for (const text of [report.title, ...report.paragraphs]) {
    for (const n of nums(text)) if (!allowed.has(n)) rogue.push(n)
  }
  return { ok: rogue.length === 0, rogue: [...new Set(rogue)] }
}

/** ⑤ 독립 검증자 — 문장별 근거 대조 (작성자와 별도 호출, temp 0) */
async function verifyReport(
  report: MatchReport,
  sources: { paragraphs: string[]; events: MatchEvent[]; stats: MatchStatRow[] | null }
): Promise<{ pass: boolean; problems: string[] }> {
  const content = await callLLM(
    `경기 리포트 검증자다. 한국어 리포트의 문장들을 근거 재료와 대조해 **사실 오류만** 찾는다.
- 근거 우선순위: **누가 득점/도움/카드를 받았고 어떤 순서였는지는 "사건 목록"(events)이 정본**이다 —
  리포트가 events 와 일치하면 원문 문단을 다시 해석해 뒤집지 마라.
  장면 묘사(슛 종류·방향·전개)는 해당 사건의 detail 및 원문 문단과 대조한다.
- 문제 삼는 것: 근거에 없는 행위 주체(득점자·도움자 바꿔치기), 없는 사건, 없는 수치·기록,
  detail 에 없는 구체 묘사(예: 원문은 슛인데 헤더라고 쓴 것).
- 문제 삼지 않는 것: 번역·요약·문체·수식어("멋진" 등), 문단 구성, 표현 강도.
- **확신할 수 있는 사실 오류만 넣어라.** "~로 보일 수 있다", "~여야 하며" 수준의 해석 차이는
  문제가 아니다. 애매하면 통과시켜라 — 상류에 결정론 게이트(숫자·이름)가 따로 있다.
- 출력: {"pass": true|false, "problems": ["문제 문장과 이유", ...]} JSON. 사실 오류가 없으면 pass true.`,
    { 리포트: { 제목: report.title, 문단: report.paragraphs }, 근거: sources },
    900,
    VERIFIER_MODEL
  )
  if (!content) return { pass: false, problems: ["verifier-unavailable"] }
  try {
    const parsed = JSON.parse(content) as { pass?: boolean; problems?: string[] }
    return {
      pass: parsed.pass === true && (parsed.problems ?? []).length === 0,
      problems: parsed.problems ?? [],
    }
  } catch {
    return { pass: false, problems: ["verifier-parse-failed"] }
  }
}

/**
 * 리포트 생성 + **실패도 캐시**.
 *
 * ⚠️ 종전엔 실패를 throw 로 흘려 캐시를 회피했다. 의도는 "기사가 늦게 붙으니 다음 요청이
 *    다시 시도한다" 였지만, 대가가 컸다 — 리포트가 안 나오는 경기는 **페이지를 열 때마다**
 *    LLM 체인(추출→작성→검증, 최대 3회)을 처음부터 다시 돌았다. 매치 페이지가 몇 초씩
 *    걸리던 정체가 이것이다 (2026-08-18 운영자: "넘어가는데 시간이 너무 오래 걸려").
 *    성공분은 `match_reports` 에 영구 저장되므로, 여기 TTL 은 **재시도 간격**일 뿐이다.
 */
function cachedReport(
  eventId: string,
  gameId: string,
  homeTeam: string,
  awayTeam: string,
  /** betman 확정 스코어 — 없으면 종전대로 기사 추출값을 쓴다 */
  finalScore: string | null
) {
  return unstable_cache(
    async (): Promise<MatchReport | null> => {
      // 기사가 아직 없는 경기가 대다수다 — LLM 을 부르기 전에 여기서 끝난다 (호출 2회)
      const articleId = await findArticleId(eventId)
      if (!articleId) return null
      const body = await fetchArticleBody(articleId)
      if (!body) return null

      // ① 사건 추출 → ② 라인업 대조로 이름 확정 → ③ 작성
      const extracted = await extractEvents(body.title, body.paragraphs)
      if (!extracted) return null
      const lineup = await getLineupForGame(gameId).catch(
        () => ({ status: "none" }) as LineupResponse
      )
      const { events, grounded, total } = await groundPlayerNames(extracted.events, lineup)
      // ⚠️ 종전엔 grounded/total 을 계산해 놓고 **버렸다**. 이름이 통째로 영문으로
      //    나가도 아무 신호가 없었다 — 운영자 제보로만 알 수 있었다는 뜻이다.
      if (total > 0 && grounded < total) {
        console.warn(
          `[match-report] 이름 확정 ${grounded}/${total} (event ${eventId}, 라인업 ${lineup.status})`
        )
      }
      const stats = await cachedStats(eventId)().catch(() => null)
      // ⚠️⚠️ 스코어는 **우리 DB 가 정본**이다 (2026-08-25).
      //    종전엔 LLM 이 기사에서 뽑은 `extracted.score` 를 그대로 썼는데, 같은 경기를
      //    3회 생성했더니 제목이 "3-2 첼시 승" / "3-2 첼시 승" / "3-3 무승부" 로 갈렸다.
      //    실제는 풀럼 2-3 첼시 — **승패 자체가 틀린 리포트**가 검증을 통과했다.
      //    숫자 게이트가 "3" 과 "3" 이 근거에 있는지만 보고 스코어 조합은 안 봤기 때문이다.
      const score = finalScore ?? extracted.score
      const sources = { paragraphs: body.paragraphs, events, stats, score }

      // ③ 작성 → ④ 숫자 게이트 → ⑤ 독립 검증 → ⑥ 불합격이면 지적사항 넣어 1회 재작성.
      // 재검증까지 실패하면 미노출(fail-closed) — 틀린 리포트는 없는 리포트보다 나쁘다.
      let feedback: string[] = []
      for (let attempt = 0; attempt < 3; attempt++) {
        const ko = await composeReportKo(homeTeam, awayTeam, score, events, stats, feedback)
        if (!ko) break
        const gate = numbersGate(ko, sources)
        // ⚠️ 스코어 게이트 — LLM 판단 이전의 **결정론** 검사. 확정 스코어가 있는데
        //    리포트가 다른 조합을 적으면 그 자리에서 떨어뜨린다. 숫자 게이트는 개별
        //    숫자만 보므로 "3-3" 같은 **조합 오류**를 못 잡는다 (실사고).
        const scoreProblem = finalScore ? wrongScore(ko, finalScore) : null
        const verdict = scoreProblem
          ? { pass: false, problems: [scoreProblem] }
          : gate.ok
            ? await verifyReport(ko, { paragraphs: body.paragraphs, events, stats })
            : { pass: false, problems: [`근거에 없는 숫자: ${gate.rogue.join(", ")}`] }
        if (verdict.pass) return ko
        // 서버 로그만 — 화면은 fail-open 계약대로 침묵. 반복되면 프롬프트 튜닝 신호다.
        console.warn(
          `[match-report] 검증 불합격 (${attempt + 1}차, event ${eventId}):`,
          verdict.problems.slice(0, 5).join(" | ")
        )
        feedback = verdict.problems
      }
      return null // 검증 미통과 — TTL 뒤에 다시 시도한다 (매 요청마다가 아니라)
    },
    // v10: 이름 확정 3단 폴백 (라인업 → 표기 사전 → 스쿼드 사전)
    ["match-report-v13", eventId],
    // 실패를 물고 있는 시간 = 재시도 간격. 기사는 FT 후 30분~수시간 뒤 붙는다.
    { revalidate: 1800 }
  )
}

/* ── 본체 ── */

interface MatchExtras {
  stats: MatchStatRow[] | null
  report: MatchReport | null
}

/**
 * 저장 리포트 유무 — 매치 페이지가 "리포트" 탭을 만들지 말지 **렌더 전에** 판정하는 용도.
 * 종전엔 탭을 무조건 만들고 내용이 Suspense 안에서 null 로 풀렸는데, 래퍼가 truthy 라
 * 탭이 남아 **빈 패널 데드엔드**가 됐다 (2026-08-19 패널 2중 실측 — fail-open 계약 파공).
 */
export async function hasStoredReport(gameId: string): Promise<boolean> {
  try {
    const { count } = await createServiceRoleClient()
      .from("match_reports")
      .select("game_id", { count: "exact", head: true })
      .eq("game_id", gameId)
    return (count ?? 0) > 0
  } catch {
    return false
  }
}

/** 저장해 둔 리포트 — 창 밖이어도, 원본 기사가 내려가도 그대로 보여준다 */
async function loadStoredReport(gameId: string): Promise<MatchReport | null> {
  const { data } = await createServiceRoleClient()
    .from("match_reports")
    .select("title, paragraphs")
    .eq("game_id", gameId)
    .maybeSingle()
  if (!data?.title) return null
  return { title: String(data.title), paragraphs: (data.paragraphs as string[]) ?? [] }
}

/** 검증을 통과한 리포트만 보관 — 재생성 비용(LLM)과 원본 소실 양쪽을 막는다 */
async function storeReport(gameId: string, eventId: string, report: MatchReport) {
  await createServiceRoleClient()
    .from("match_reports")
    .upsert(
      { game_id: gameId, event_id: eventId, title: report.title, paragraphs: report.paragraphs },
      { onConflict: "game_id" }
    )
}

export async function getMatchExtras(gameId: string): Promise<MatchExtras> {
  // ⚠️ 저장분을 **해석보다 먼저** 본다. soccerway 해석에는 킥오프 +24시간 창이 걸려 있어,
  //    창을 벗어나면 resolveMatchEvent 가 null 이 되고 리포트·스탯이 통째로 사라졌다.
  //    한 번 만든 리포트는 창과 무관하게 계속 보여야 한다 (2026-08-18 운영자 지적).
  const stored = await loadStoredReport(gameId).catch(() => null)

  const resolved = await resolveMatchEvent(gameId)
  if (!resolved) return { stats: null, report: stored }

  const [stats, fresh] = await Promise.all([
    cachedStats(resolved.eventId)().catch(() => null),
    stored
      ? Promise.resolve(null)
      : cachedReport(
          resolved.eventId,
          gameId,
          resolved.homeTeam,
          resolved.awayTeam,
          resolved.homeScore != null && resolved.awayScore != null
            ? `${resolved.homeScore}-${resolved.awayScore}`
            : null
        )().catch(() => null),
  ])
  if (fresh) await storeReport(gameId, resolved.eventId, fresh).catch(() => {})
  return { stats, report: stored ?? fresh }
}
