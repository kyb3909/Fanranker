import { createServiceRoleClient } from "@/lib/supabase/server"
import {
  getFixturesForDay,
  MATCHDAY_START_HOUR_KST,
  type FixtureRow,
} from "@/lib/match/get-fixtures"
import { MATCH_PAGE_LEAGUES, leagueLabel } from "@/lib/match/leagues"
import { getMatchLineup } from "@/lib/match/get-lineup"
import { displayTeamName, loadTeamShortMap } from "@/lib/match/team-display"
import { MATCH_THREAD_BOT_USER_ID } from "@/lib/constants/bot-users"
import { getSiblingGameIds } from "@/lib/match/sibling-ids"
import { threadMatchdays, THREAD_BEFORE_MS, THREAD_AFTER_MS } from "@/lib/match/thread-window"

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
 * - 생성 창 = 킥오프 90분 전 ~ 킥오프 120분 후. 확정 라인업이 ready 인 경기만 — 라인업
 *   발표(통상 T-60분)가 곧 "불판 깔 때"라는 운영자 정의를 그대로 따른다.
 * - 대상 = 매치센터와 같은 화이트리스트 (MATCH_PAGE_LEAGUES — 운영자 확정).
 * - 중복 방지: 형제 행 전체의 기존 글 조회 + 정렬된 대표 gameId로 insert + unique 인덱스.
 *   제목은 반복 대진의 식별자가 아니므로 중복 판정에 사용하지 않는다.
 */

// 킥오프 후에도 2시간까지 연다 (2026-08-24 운영자: "불판이 자동으로 생성이 되면" 매치센터
// 버튼이 뜨는 구조 — 그런데 8/23 라인업 장애 동안 종전 창(+10분)이 전부 지나가 EPL 빅매치에
// 불판이 하나도 없었다). 데이터가 늦게 살아나면 전반 중에라도 깐다 — status 가 completed 로
// 바뀌면 후보에서 빠지므로 종료 경기에 뒷북 불판이 생기지는 않는다.

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

export async function sweepMatchThreads(opts?: {
  /** 테스트용 — 창 판정을 무시하고 이 경기만 시도 (화이트리스트·라인업 조건은 유지) */
  forceGameId?: string
}): Promise<ThreadResult> {
  const supabase = createServiceRoleClient()
  const result: ThreadResult = { scanned: 0, inWindow: 0, created: [], skipped: [] }

  const now = Date.now()
  const [days, shortNames] = await Promise.all([
    Promise.all(threadMatchdays(now, MATCHDAY_START_HOUR_KST).map(getFixturesForDay)),
    loadTeamShortMap(),
  ])
  const fixtures = [...new Map(days.flat().map((f) => [f.matchKey, f])).values()]
  result.scanned = fixtures.length

  const candidates = fixtures.filter((f: FixtureRow) => {
    if (!f.gameId) return false // 매치 페이지가 없는 경기에 불판을 깔 수 없다
    if (!MATCH_PAGE_LEAGUES.has(f.leagueCode)) return false
    if (f.status === "cancelled") return false
    if (opts?.forceGameId) return f.gameId === opts.forceGameId
    if (f.status === "completed") return false
    const ko = new Date(f.matchTime).getTime()
    return now >= ko - THREAD_BEFORE_MS && now <= ko + THREAD_AFTER_MS
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
    const requestedId = f.gameId as string
    // 쓰기에서는 형제 조회 실패를 자기 자신으로 접지 않는다. 다른 마켓으로 중복 생성될 수 있다.
    const siblingIds = await getSiblingGameIds(supabase, requestedId, { strict: true }).catch(
      () => null
    )
    if (!siblingIds?.length) {
      result.skipped.push({ gameId: requestedId, reason: "sibling-lookup-failed" })
      continue
    }
    const gameId = f.source === "lfa" ? requestedId : [...siblingIds].sort()[0]
    const home = displayTeamName(f.homeTeam, shortNames)
    const away = displayTeamName(f.awayTeam, shortNames)
    const title = threadTitle(home, away, leagueLabel(f.leagueCode))

    // An existing post must not stop acquisition of the confirmed LFA roster.
    const lineup = await getMatchLineup(gameId).catch(() => null)

    // 어느 형제 행에 만들어졌든 재사용한다. 같은 대진이어도 킥오프가 다르면 새 경기다.
    const { data: existing, error: existingError } = await supabase
      .from("posts")
      .select("id")
      .in("match_game_id", siblingIds)
      .limit(1)
    if (existingError || existing?.length) {
      result.skipped.push({ gameId, reason: existingError ? "post-lookup-failed" : "exists" })
      continue
    }

    if (!lineup || lineup.status !== "ready" || lineup.projected === true) {
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

    // 본문은 안내 한 문단뿐 (2026-08-20 운영자: "선발 나열·매치센터 링크는 없애야" —
    // 전광판·스탯·라인업 위젯이 글 상단에 전부 있으니 본문 중복은 소음이다)
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: `${home} vs ${away} 불판입니다. 킥오프 ${kickoffKst} — 경기 보면서 자유롭게 댓글로 함께 응원해요. 스코어·라인업·스탯은 이 글 상단에 실시간으로 뜹니다.`,
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
