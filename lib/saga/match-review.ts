import "server-only"

import { chatParams } from "@/lib/llm/openai-params"
import { leagueLabel } from "@/lib/match/leagues"
import { getLfaMatchInfo, type LfaStatRow } from "@/lib/lfa/match"
import { wrongTeamAttribution } from "@/lib/soccerway/goal-facts"
import { getMatchExtras } from "@/lib/soccerway/match-extras"

/**
 * 기사(매치 리포트)를 몇 시간까지 기다렸다가 자체 작성으로 내려갈지.
 *
 * 기사는 FT 후 30분~수시간 뒤에 붙고, 소커웨이 해석 창이 킥오프+24시간이다.
 * 12시간이면 기사가 붙을 시간은 충분히 주면서 창이 닫히기 전에 폴백할 여유가 남는다.
 */
const REPORT_WAIT_HOURS = 12
import { logUsage } from "@/lib/llm/usage-log"

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
    logUsage("saga-match-review", MODEL, data)
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
- ⚠️ **자책골(\`자책골: true\`)은 두 팀이 다르다.** \`득점팀\` 은 점수가 올라간 팀이고,
  \`넣은선수_소속\` 은 공을 자기 골대에 넣은 선수의 소속 팀이다. **이 둘은 항상 반대다.**
  선수의 소속을 \`득점팀\` 으로 적지 마라 — 골키퍼가 자기 골대에 넣었으면 그 골키퍼는
  실점한 팀 소속이고, 점수는 상대에게 간다.
- ⚠️ **득점 목록의 골이 전부다.** \`득점\` 배열에 있는 만큼만 쓰고, 팀별 골 수는 스코어와
  반드시 맞아야 한다. 자책골도 \`득점팀\` 쪽 골로 센다.
- 구성: 2~3문단, 총 5~8문장. ①경기 흐름과 승부처(득점 장면 중심) ②마지막 문단 끝
  1~2문장으로 스탯이 말하는 바(제공된 지표 중 말이 되는 것 2~3개만, 나열 금지).
- **퇴장이 있으면 몇 분에 누가 나갔는지 반드시 명시**한다. 수적 우위·열세가 경기 흐름을
  어떻게 갈랐는지도 득점 시간과 엮어 쓴다.
- 팀명은 조사를 정확히 붙인다 — 받침이 있으면 "은/이/을", 없으면 "는/가/를"
  (예: "아스널은"·"맨체스터 시티는"). 팀명+"는" 처럼 틀린 조사는 금지.
- 상대는 "${oppKr}"로 표기한다.
- 출력: {"summary": "문단1\\n\\n문단2"} JSON. 문단 구분은 빈 줄 두 개.`
}

/* 소속 표기 게이트는 매치 리포트 쪽과 **같은 함수**를 쓴다 — 같은 사고를 두 경로가
   따로 막으면 반드시 한쪽이 뒤처진다 (등급 칩이 두 지면에서 갈렸던 것과 같은 실수). */

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
  const ogScorerSide = (side: "home" | "away") => (side === "home" ? "away" : "home")

  const headline =
    `[${leagueLabel(source.leagueCode)}] ${perspective.teamKr} ${us}-${them} ${oppKr} ` +
    `(${weAreHome ? "홈" : "원정"})`
  const clusterKey = `match:${kstDate(source.matchTime)}:${teamSlug(oppKr)}`
  const homeName = weAreHome ? perspective.teamKr : oppKr
  const awayName = weAreHome ? oppKr : perspective.teamKr

  /**
   * 소속 표기 게이트용 선수 맵 — 타임라인의 모든 선수.
   * 자책골 선수는 side 의 반대가 소속이다 (lib/lfa/match.ts:620).
   */
  const playerTeams = lfa.timeline
    .filter((e) => e.player)
    .map((e) => ({
      label: e.player,
      team: (e.kind === "og" ? ogScorerSide(e.side) : e.side) as "home" | "away",
    }))
  const teamGate = (summary: string) =>
    wrongTeamAttribution(
      { title: headline, paragraphs: [summary] },
      playerTeams,
      homeName,
      awayName
    )

  /**
   * ── 본문 정본 = 매치 리포트 (2026-08-29 운영자 확정) ──
   *
   * 운영자 의도: "매치 리포트는 소커웨이에서 기사를 가져와서 적고, 그게 사가의 경기
   * 카드에 들어간다." 그런데 두 경로가 따로 돌고 있었다 —
   *   · match_reports  기사 기반. 실사고 경기에서 **맞게** 나왔다 (FT+11시간)
   *   · saga_entries   기사 없이 스탯·타임라인만으로 자체 작성. **틀렸다** (FT+2시간 40분)
   * 사가 카드가 리포트를 쓰는 게 아니라 자기가 하나 더 쓰고 있었고, 늦게 나온 쪽이
   * 재료가 많아 더 정확했다. 같은 경기에 두 판본이 존재할 이유가 없다.
   *
   * ⚠️ PRD D5("외부 기사 본문·링크를 싣지 않는다")와 충돌하지 않는다. 매치 리포트는
   *    원문 전재가 아니라 **우리가 다시 쓴 글**이고, origin 은 계속 null 로 둔다
   *    (크롤링 출처 미노출 규약 유지).
   *
   * 기사는 FT 후 30분~수시간 뒤에 붙는다. 아직 없으면 **자체 작성으로 내려가지 않고
   * 그냥 건너뛴다** — 다음 시간 크론이 다시 본다. 재료를 기다리는 게 재료 없이 쓰고
   * 나중에 감수하는 것보다 싸고 정확하다.
   */
  const extras = await getMatchExtras(source.gameId).catch(() => null)
  if (extras?.report) {
    const summary = extras.report.paragraphs.join("\n\n").trim()
    if (summary) {
      const problem = teamGate(summary)
      if (problem) {
        console.warn(`[saga/match-review] 리포트 본문 ${problem} — 폐기 (${perspective.teamKr})`)
        return null
      }
      return { headline, summary, clusterKey, occurredAt: source.matchTime, result }
    }
  }
  const hoursSinceKickoff = (Date.now() - new Date(source.matchTime).getTime()) / 3_600_000
  if (hoursSinceKickoff < REPORT_WAIT_HOURS) return null // 기사 대기 — 다음 시간에 다시

  // 타임라인 통합(2026-08-19) 후에도 리뷰 재료는 골·퇴장만 — 카드·교체까지 넣으면
  // 요약이 사건 나열이 된다.
  //
  // ⚠️⚠️ **자책골은 두 팀을 따로 적는다** (2026-08-29 실사고).
  //    종전엔 `팀: sideName(g.side)` + `선수: "X (자책)"` 하나로 뭉개 넘겼는데,
  //    `side` 는 lib/lfa/match.ts:620 주석대로 **득점이 오른 팀**이고 실축 선수는 반대
  //    팀 소속이다. 그 둘이 한 필드에 섞이니 LLM 이 `팀` 을 선수 소속으로 읽었다:
  //
  //      입력  {팀:"크리스털 팰리스", 선수:"잔루이지 돈나룸마 (자책)"}
  //      출력  "크리스털 팰리스의 잔루이지 돈나룸마 자책골이 나오며 3-0"
  //
  //    돈나룸마는 맨시티 GK 다. 소속이 뒤집힌 데 이어 득점까지 시티 쪽으로 붙어
  //    골이 하나 늘었고, 다섯 골을 나열해놓고 마지막을 "네 번째"라 적는 모순이 났다.
  //    필드를 쪼개면 섞일 여지가 없다.
  const goals = lfa.timeline
    .filter((e) => e.kind === "goal" || e.kind === "pen" || e.kind === "og")
    .map((g) =>
      g.kind === "og"
        ? {
            분: g.minute,
            득점팀: sideName(g.side),
            자책골: true,
            넣은선수: g.player,
            넣은선수_소속: sideName(ogScorerSide(g.side)),
          }
        : { 분: g.minute, 득점팀: sideName(g.side), 선수: g.player }
    )
  // 퇴장은 몇 분에 나왔는지가 경기 해석을 좌우한다 — 반드시 재료에 넣는다 (2026-08-17 운영자)
  const reds = lfa.timeline
    .filter((e) => e.kind === "red")
    .map((r) => ({ 분: r.minute, 팀: sideName(r.side), 선수: r.player }))
  const stats = statsForPerspective(lfa.stats, weAreHome)

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

  // 결정론 게이트 ① — 입력에 없는 숫자가 하나라도 있으면 카드를 버린다
  const allowed = collectAllowedNumbers([
    us,
    them,
    ...goals.flatMap((g) => [g.분, "선수" in g ? g.선수 : g.넣은선수]),
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

  // 결정론 게이트 ② — 소속 표기. 리포트 경로와 **같은 검사**를 쓴다 (위 teamGate)
  const teamProblem = teamGate(summary)
  if (teamProblem) {
    console.warn(`[saga/match-review] ${teamProblem} — 폐기 (${perspective.teamKr})`)
    return null
  }

  return {
    headline,
    summary,
    clusterKey,
    occurredAt: source.matchTime,
    result,
  }
}
