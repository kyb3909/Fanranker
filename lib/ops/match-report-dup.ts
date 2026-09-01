/**
 * 불변식 판정 — 같은 경기에 리포트가 둘 이상인가 (**순수 모듈**, 2026-09-01).
 *
 * ## 왜 감시가 필요한가
 * `match_reports` 의 PK 는 `game_id`(betman 행 uuid)인데 betman 은 같은 경기를 마켓별
 * 다중 행으로 갖는다. 짝짓기가 회차마다 다른 형제 행을 고르면 저장 확인이 기존 리포트를
 * 못 보고 **LLM 체인(작성 gpt-5.1 최대 3회 + 검증 terra)을 통째로 다시 돌린다.**
 *
 * 실사고(2026-09-01): 5경기에 리포트 15건 — 리버풀-노팅엄 5건, 레체-로마 3건(짝짓기
 * 수리 커밋 **이후**에도 하루 세 번), 바르사 3건. 돈이 매번 나갔고 어느 행으로 들어가느냐에
 * 따라 독자가 다른 리포트를 봤다(제목이 다른 쌍이 실재). 수리는 조회를 경기 단위로 바꾼
 * 것이고 **저장은 여전히 행 단위**라, 읽기 경로가 되돌아가면 그대로 재발한다.
 *
 * ## 임계값 — 무관용 (비율 아님)
 * 정상 상태가 물리적으로 0 이다: 경기 1개 = 리포트 1개. 그리고 중복 1건이 곧 LLM 실비다.
 * 규칙 1·4·5·7·8 과 같은 계열로, 한 건이라도 나오면 위반이다.
 *
 * ⚠️ 창(기본 7일)이 필요한 이유: 사람이 정리하면 자연히 resolved 로 닫혀야 하는데,
 *    창이 없으면 옛 중복이 원장에 영구 open 으로 남아 알림 1회 후 침묵 상태로 굳는다.
 */
import { matchKeyOf, matchLabelOf } from "@/lib/match/match-key"

export interface ReportRow {
  gameId: string
  eventId: string | null
  title: string
}

export interface GameRow {
  id: string
  homeTeam: string
  awayTeam: string
  matchTime: string
}

export interface ReportDupGroup {
  /** 경기 키 (betman 행을 못 찾으면 `event:{eventId}`) */
  key: string
  label: string
  gameIds: string[]
  /** 서로 다른 제목 — 1개면 같은 글의 사본, 2개 이상이면 지면마다 내용이 다르다 */
  titles: string[]
}

/**
 * 경기 단위로 접어 리포트가 2건 이상인 것만 돌려준다.
 *
 * ⚠️ betman 행을 못 찾은 고아 리포트는 `event_id` 로 한 번 더 접는다 — 경기가 재수집되어
 *    game_id 가 통째로 갈린 경우의 폴백이다. 이걸 안 하면 가장 오래 방치된 중복이
 *    오히려 감시에서 빠진다.
 */
export function findDuplicateReports(reports: ReportRow[], games: GameRow[]): ReportDupGroup[] {
  const gameById = new Map(games.map((g) => [g.id, g]))
  const groups = new Map<string, { label: string; gameIds: string[]; titles: Set<string> }>()

  for (const r of reports ?? []) {
    const g = gameById.get(r.gameId)
    // 폴백 키는 `event:` 접두로 구분한다 — 경기 키와 충돌하지 않게
    const key = g ? matchKeyOf(g) : r.eventId ? `event:${r.eventId}` : null
    if (!key) continue // 경기도 이벤트도 모르면 접을 수가 없다 — 세지 않는다
    const label = g ? matchLabelOf(g) : `event ${r.eventId}`
    const hit = groups.get(key)
    if (hit) {
      hit.gameIds.push(r.gameId)
      if (r.title) hit.titles.add(r.title)
    } else {
      groups.set(key, {
        label,
        gameIds: [r.gameId],
        titles: new Set(r.title ? [r.title] : []),
      })
    }
  }

  const out: ReportDupGroup[] = []
  for (const [key, v] of groups) {
    if (v.gameIds.length < 2) continue
    out.push({ key, label: v.label, gameIds: v.gameIds, titles: [...v.titles] })
  }
  // 심한 것부터 — 경보 본문이 잘려도 최악이 먼저 보인다
  return out.sort((a, b) => b.gameIds.length - a.gameIds.length)
}
