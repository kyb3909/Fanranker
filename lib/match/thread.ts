import { createServiceRoleClient } from "@/lib/supabase/server"
import { getFixturesForDay, todayKst, type FixtureRow } from "@/lib/match/get-fixtures"
import { MATCH_PAGE_LEAGUES, leagueLabel } from "@/lib/match/leagues"
import { getMatchLineup } from "@/lib/match/get-lineup"
import { displayTeamName, loadTeamShortMap } from "@/lib/match/team-display"
import { MATCH_THREAD_BOT_USER_ID } from "@/lib/constants/bot-users"

/**
 * 불판 (라이브 매치 스레드) 자동 생성 — 2026-08-20 운영자 승인.
 *
 * "라인업이 발표되면 그 경기의 불판이 게시물로 생기고, 라인업이 함께 들어가 있고,
 *  스코어와 기본 이벤트(득점·경고·퇴장)가 보이면 좋겠다."
 *
 * ## 설계
 * - 불판 = **진짜 게시물** (posts 행, 작성자 "중계불판" 봇) — 댓글·추천·담벼락 노출을
 *   전부 기존 인프라로 얻는다. 라이브 스코어·이벤트는 본문에 박지 않고 글 상세가
 *   `match_game_id` 를 보고 스코어 스트립을 실시간 렌더한다 (본문은 낡지 않는 것만).
 * - 생성 창 = 킥오프 90분 전 ~ 킥오프 10분 후. 라인업이 ready 인 경기만 — 라인업
 *   발표(통상 T-60분)가 곧 "불판 깔 때"라는 운영자 정의를 그대로 따른다.
 * - 대상 = 매치센터와 같은 화이트리스트 (MATCH_PAGE_LEAGUES — 운영자 확정).
 * - 중복 방지 3중: match_game_id unique 인덱스(진실의 원천) + 같은 제목 봇 글 조회
 *   (betman 중복 행이 다른 gameId 로 같은 경기를 다시 고르는 경우) + 낙관적 insert.
 */

const WINDOW_BEFORE_MS = 90 * 60 * 1000
const WINDOW_AFTER_MS = 10 * 60 * 1000

interface ThreadResult {
  scanned: number
  inWindow: number
  created: { gameId: string; postId: string; title: string }[]
  skipped: { gameId: string; reason: string }[]
  /** forceGameId 가 안 잡혔을 때만 — 그날 매치데이에 실제로 뭐가 있는지 (진단용) */
  debugFixtures?: {
    league: string
    home: string
    away: string
    gameId: string | null
    status: string
  }[]
}

function threadTitle(home: string, away: string, league: string): string {
  return `[불판] ${home} vs ${away} · ${league}`
}

/** 라인업 한 팀 → 본문 문단들 (헤딩 + 선발 나열 한 줄) */
function sideParagraphs(
  side: {
    teamLabel: string
    formation: string | null
    starters: { label: string; number: number | null }[]
  },
  label: string
) {
  const names = side.starters
    .map((p) => (p.number != null ? `${p.number} ${p.label}` : p.label))
    .join(" · ")
  return [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          marks: [{ type: "bold" }],
          text: `${label} — ${side.formation ? `${side.formation} · ` : ""}선발`,
        },
      ],
    },
    { type: "paragraph", content: [{ type: "text", text: names }] },
  ]
}

export async function sweepMatchThreads(opts?: {
  /** 테스트용 — 창 판정을 무시하고 이 경기만 시도 (화이트리스트·라인업 조건은 유지) */
  forceGameId?: string
}): Promise<ThreadResult> {
  const supabase = createServiceRoleClient()
  const result: ThreadResult = { scanned: 0, inWindow: 0, created: [], skipped: [] }

  const [fixtures, shortNames] = await Promise.all([
    getFixturesForDay(todayKst()),
    loadTeamShortMap(),
  ])
  result.scanned = fixtures.length

  const now = Date.now()
  const candidates = fixtures.filter((f: FixtureRow) => {
    if (!f.gameId) return false // 매치 페이지가 없는 경기에 불판을 깔 수 없다
    if (!MATCH_PAGE_LEAGUES.has(f.leagueCode)) return false
    if (f.status === "cancelled") return false
    if (opts?.forceGameId) return f.gameId === opts.forceGameId
    if (f.status === "completed") return false
    const ko = new Date(f.matchTime).getTime()
    return now >= ko - WINDOW_BEFORE_MS && now <= ko + WINDOW_AFTER_MS
  })
  result.inWindow = candidates.length
  if (opts?.forceGameId && candidates.length === 0) {
    result.debugFixtures = fixtures.map((f) => ({
      league: f.leagueCode,
      home: f.homeTeam,
      away: f.awayTeam,
      gameId: f.gameId,
      status: f.status,
    }))
  }

  for (const f of candidates) {
    const gameId = f.gameId as string
    const home = displayTeamName(f.homeTeam, shortNames)
    const away = displayTeamName(f.awayTeam, shortNames)
    const title = threadTitle(home, away, leagueLabel(f.leagueCode))

    // 이미 있나 — gameId 또는 같은 제목의 봇 글 (betman 중복 행 가드)
    const { data: existing } = await supabase
      .from("posts")
      .select("id")
      .or(
        `match_game_id.eq.${gameId},and(user_id.eq.${MATCH_THREAD_BOT_USER_ID},title.eq."${title.replace(/"/g, '\\"')}")`
      )
      .limit(1)
    if (existing?.length) {
      result.skipped.push({ gameId, reason: "exists" })
      continue
    }

    const lineup = await getMatchLineup(gameId).catch(() => null)
    if (!lineup || lineup.status !== "ready") {
      result.skipped.push({ gameId, reason: "lineup-not-ready" })
      continue
    }

    const kickoffKst = new Date(f.matchTime).toLocaleString("ko-KR", {
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul",
    })

    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: `${home} vs ${away} 불판입니다. 킥오프 ${kickoffKst} — 경기 보면서 자유롭게 댓글로 함께 응원해요. 스코어와 득점·카드 상황은 이 글 상단에 실시간으로 뜹니다.`,
            },
          ],
        },
        ...sideParagraphs(lineup.home, home),
        ...sideParagraphs(lineup.away, away),
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [{ type: "link", attrs: { href: `/match/${gameId}` } }],
              text: "매치센터에서 실시간 스탯 보기 →",
            },
          ],
        },
      ],
    }

    const { data: inserted, error } = await supabase
      .from("posts")
      .insert({
        user_id: MATCH_THREAD_BOT_USER_ID,
        community_slug: "football",
        title,
        content: doc,
        match_game_id: gameId,
      })
      .select("id")
      .single()
    if (error) {
      // unique(match_game_id) 충돌 = 동시 실행 레이스 — 정상 스킵
      result.skipped.push({ gameId, reason: `insert: ${error.code ?? error.message}` })
      continue
    }
    result.created.push({ gameId, postId: inserted.id, title })
  }

  return result
}
