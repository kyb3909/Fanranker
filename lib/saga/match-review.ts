import "server-only"

import { chatParams } from "@/lib/llm/openai-params"
import { leagueLabel } from "@/lib/match/leagues"
import { getLfaMatchInfo, type LfaStatRow } from "@/lib/lfa/match"

/**
 * 경기 리뷰 카드 — 시즌 실록의 엔트리 (D17, 2026-08-17).
 *
 * ## 왜 팀마다 따로 쓰는가
 * 시즌 사가의 identity 는 팀+시즌이다 (D4). 같은 경기라도 **아스널 문서는 아스널을 주어로,
 * 맨시티 문서는 맨시티를 주어로** 서술해야 각 팀의 연대기가 된다 (2026-08-17 오너).
 * 그래서 한 경기가 최대 2장의 카드를 만든다 — 스코어·사건은 같고 서술 중심이 다르다.
 *
 * ⚠️ **관점 ≠ 응원조.** 드라이 톤은 그대로다 (운영자 상시 규칙). 관점이 바꾸는 것은
 * 문장의 주어와 승패 표현이지, 감정·과장·팬심이 아니다. "우리"라는 1인칭도 쓰지 않는다.
 *
 * ## 환각 방어
 * 입력이 이미 구조화 데이터(스코어·득점자·분·스탯)라 뉴스 리포트처럼 원문에서 사건을
 * 추출할 필요가 없다 — 환각 표면이 근본적으로 작다. 그 위에 **숫자 게이트**(출력의 모든
 * 숫자가 입력에 있어야 함)를 결정론으로 얹는다. 통과 못 하면 카드를 만들지 않는다
 * (fail-closed — 틀린 실록은 없는 실록보다 나쁘다).
 *
 * D5(기사 본문 저장·표시 금지)를 지킨다: 외부 기사 텍스트는 입력에 넣지 않는다.
 */

const MODEL = "gpt-5.1"

export interface ReviewPerspective {
  /** 서술의 주어가 될 팀 (betman 한글 표기) */
  teamKr: string
}

export interface MatchReviewSource {
  gameId: string
  homeTeam: string
  awayTeam: string
  leagueCode: string
  matchTime: string
}

export interface MatchReviewCard {
  headline: string
  summary: string
  /** (saga_id, cluster_key) 유니크 — 같은 경기 재실행 시 덮어쓴다 */
  clusterKey: string
  occurredAt: string
  /** 우리 팀 기준 승/무/패 */
  result: "W" | "D" | "L"
}

/** 팀명 → cluster_key 용 슬러그 (한글이라 로마자화가 안 되므로 공백만 정리) */
function teamSlug(name: string): string {
  return name.trim().replace(/\s+/g, "-")
}

/** "2026-08-16T14:00:00Z" → "2026-08-16" (KST 기준 경기일) */
function kstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

/** 출력에 입력에 없는 숫자가 있으면 실패 — 결정론 게이트 (LLM 아님) */
function numbersGate(text: string, allowed: Set<string>): string[] {
  const rogue: string[] = []
  for (const n of text.match(/\d+(?:\.\d+)?/g) ?? []) {
    if (!allowed.has(n)) rogue.push(n)
  }
  return [...new Set(rogue)]
}

function collectAllowedNumbers(parts: (string | number | null | undefined)[]): Set<string> {
  const allowed = new Set<string>()
  for (const p of parts) {
    for (const n of String(p ?? "").match(/\d+(?:\.\d+)?/g) ?? []) {
      allowed.add(n)
      if (n.includes(".")) allowed.add(n.split(".")[0]) // 2.19 → 2 (반올림 서술 허용)
    }
  }
  // 경기 서술의 상수 — 전후반·정규시간
  for (const n of ["0", "1", "2", "45", "90"]) allowed.add(n)
  return allowed
}

async function callLLM(system: string, user: unknown): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        ...chatParams(MODEL, { temperature: 0, max_tokens: 1400 }),
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
  } catch {
    return null
  }
}

function buildSystemPrompt(teamKr: string, oppKr: string): string {
  return `${teamKr} 팬 커뮤니티의 **시즌 실록**에 실릴 경기 기록을 쓰는 에디터다.
같은 경기라도 이 문서는 ${teamKr}의 연대기이므로 **${teamKr}를 서술의 중심(주어)** 으로 쓴다.

규칙:
- **관점은 주어를 정할 뿐, 응원조가 아니다.** 드라이한 기사체 평서문으로 쓴다.
  "우리"·"아쉽게도"·"완벽한"·"환상적인" 같은 1인칭·감정·과장 표현 전면 금지.
  ${teamKr}가 졌으면 진 대로 담담히 쓴다. 변명·위안·정신승리 금지.
- **제공된 데이터에 있는 사실만** 쓴다. 득점자·시간·스탯은 입력 그대로.
  입력에 없는 숫자(관중 수·순위·기록)를 지어내는 것은 절대 금지.
- 선수 이름은 입력 표기를 **한 글자도 바꾸지 말고** 그대로 쓴다.
- 구성: 2~3문단, 총 5~8문장. ①경기 흐름과 승부처(득점 장면 중심) ②마지막 문단 끝
  1~2문장으로 스탯이 말하는 바(제공된 지표 중 말이 되는 것 2~3개만, 나열 금지).
- **퇴장이 있으면 몇 분에 누가 나갔는지 반드시 명시**한다. 수적 우위·열세가 경기 흐름을
  어떻게 갈랐는지도 득점 시간과 엮어 쓴다.
- 팀명은 조사를 정확히 붙인다 — 받침이 있으면 "은/이/을", 없으면 "는/가/를"
  (예: "아스널은"·"맨체스터 시티는"). 팀명+"는" 처럼 틀린 조사는 금지.
- 상대는 "${oppKr}"로 표기한다.
- 출력: {"summary": "문단1\\n\\n문단2"} JSON. 문단 구분은 빈 줄 두 개.`
}

/** 스탯을 LLM 입력용으로 — 우리/상대 관점으로 뒤집어 넘긴다 */
function statsForPerspective(
  stats: LfaStatRow[],
  weAreHome: boolean
): { 지표: string; 우리: string; 상대: string }[] {
  return stats.map((s) => ({
    지표: s.label,
    우리: weAreHome ? s.home : s.away,
    상대: weAreHome ? s.away : s.home,
  }))
}

/**
 * 한 경기 + 한 팀 관점 → 리뷰 카드. 재료가 모자라거나 게이트를 못 넘으면 null.
 *
 * ⚠️ 호출 전 그 팀의 시즌 사가가 있는지 확인할 것 — 카드만 만들고 넣을 곳이 없으면 낭비다.
 */
export async function buildMatchReview(
  source: MatchReviewSource,
  perspective: ReviewPerspective
): Promise<MatchReviewCard | null> {
  const weAreHome = source.homeTeam === perspective.teamKr
  if (!weAreHome && source.awayTeam !== perspective.teamKr) return null // 우리 경기가 아니다
  const oppKr = weAreHome ? source.awayTeam : source.homeTeam

  const lfa = await getLfaMatchInfo({
    gameId: source.gameId,
    homeTeam: source.homeTeam,
    awayTeam: source.awayTeam,
    matchTime: source.matchTime,
    leagueCode: source.leagueCode,
  })
  // 종료·스코어 확정 전에는 실록에 올리지 않는다
  if (!lfa?.finished || lfa.homeScore == null || lfa.awayScore == null) return null

  const us = weAreHome ? lfa.homeScore : lfa.awayScore
  const them = weAreHome ? lfa.awayScore : lfa.homeScore
  const result: MatchReviewCard["result"] = us > them ? "W" : us < them ? "L" : "D"

  const sideName = (side: "home" | "away") =>
    (side === "home") === weAreHome ? perspective.teamKr : oppKr
  // 타임라인 통합(2026-08-19) 후에도 리뷰 재료는 골·퇴장만 — 카드·교체까지 넣으면
  // 요약이 사건 나열이 된다. 자책골은 (자책)을 붙여 실축 선수를 득점자로 오독하지 않게 한다.
  const goals = lfa.timeline
    .filter((e) => e.kind === "goal" || e.kind === "pen" || e.kind === "og")
    .map((g) => ({
      분: g.minute,
      팀: sideName(g.side),
      선수: g.kind === "og" ? `${g.player} (자책)` : g.player,
    }))
  // 퇴장은 몇 분에 나왔는지가 경기 해석을 좌우한다 — 반드시 재료에 넣는다 (2026-08-17 운영자)
  const reds = lfa.timeline
    .filter((e) => e.kind === "red")
    .map((r) => ({ 분: r.minute, 팀: sideName(r.side), 선수: r.player }))
  const stats = statsForPerspective(lfa.stats, weAreHome)

  const headline =
    `[${leagueLabel(source.leagueCode)}] ${perspective.teamKr} ${us}-${them} ${oppKr} ` +
    `(${weAreHome ? "홈" : "원정"})`

  const content = await callLLM(buildSystemPrompt(perspective.teamKr, oppKr), {
    경기: `${perspective.teamKr} ${us}-${them} ${oppKr}`,
    홈원정: weAreHome ? "홈" : "원정",
    대회: leagueLabel(source.leagueCode),
    득점: goals,
    퇴장: reds,
    스탯: stats,
  })
  if (!content) return null

  let summary: string
  try {
    const parsed = JSON.parse(content) as { summary?: string }
    if (!parsed.summary?.trim()) return null
    summary = parsed.summary.trim()
  } catch {
    return null
  }

  // 결정론 게이트 — 입력에 없는 숫자가 하나라도 있으면 카드를 버린다
  const allowed = collectAllowedNumbers([
    us,
    them,
    ...goals.flatMap((g) => [g.분, g.선수]),
    ...reds.flatMap((r) => [r.분, r.선수]),
    ...stats.flatMap((s) => [s.지표, s.우리, s.상대]),
  ])
  const rogue = numbersGate(summary, allowed)
  if (rogue.length > 0) {
    console.warn(
      `[saga/match-review] 근거 없는 숫자로 폐기 (${perspective.teamKr}): ${rogue.join(", ")}`
    )
    return null
  }

  return {
    headline,
    summary,
    clusterKey: `match:${kstDate(source.matchTime)}:${teamSlug(oppKr)}`,
    occurredAt: source.matchTime,
    result,
  }
}
