/**
 * 불변식 판정 — 리포트 대상 경기의 Soccerway 매핑이 **봉인**됐는가 (순수 모듈, 2026-09-07).
 *
 * ## 왜 감시가 필요한가
 * 매핑 원장(`match_mapping_attempts`)은 (경기, 입력 해시, 술어 버전)당 확정 판정을 한 번만 받는다 —
 * `proposed` 뿐 아니라 `no_candidate`(404)·`ambiguous` 도 status `ok` 로 봉인되고, 사전의 팀 해시가
 * 바뀌어 입력 해시가 달라져야만 다시 판정한다. 그 봉인은 아무 화면에도 안 나왔다.
 *
 * 실사고(2026-08-30~09-07): 팀 사전 백필이 넣은 `lfa_…` 자리표시 행이 Soccerway 팀 해시로 쓰여
 * 구성 URL 이 404 → 분데스리가 6경기가 `no_candidate` 로 봉인 → 리포트 원장엔 매시 `resolve`
 * (베르더–라이프치히 57행, 샬케–바이에른 51행)만 쌓이고 리포트는 수동으로 복구했다. 원인 코드는
 * c2e22eda 에서 고쳤지만 "봉인된 판정을 본다"는 눈이 없었다.
 *
 * ## 판정
 * 경기(형제 행 전부) 단위로 접어, 어느 형제에도 `proposed` 가 없고 **가장 최근** 판정이
 *  - status `ok` 이면서 outcome `no_candidate`·`ambiguous`, 또는
 *  - status `dead_letter`(fetch 2회 실패)
 * 이면 봉인이다. `retry_wait`(재시도 대기)·`team_unresolved`(발견이 순환 재시도)는 아직 열려 있다.
 * 시도가 아예 없는 경기는 여기서 세지 않는다 — 그건 "봉인"이 아니라 "아직 안 봄"이다.
 *
 * ⚠️ 호출부가 리포트 대상 리그(MATCH_EXTRAS_LEAGUES)·창을 거른다. 여기는 접고 판정만 한다.
 */
import { matchKeyOf, matchLabelOf } from "@/lib/match/match-key"

export interface MappingGameRow {
  id: string
  homeTeam: string
  awayTeam: string
  matchTime: string
  leagueCode: string | null
}

export interface MappingAttemptRow {
  gameId: string
  outcome: string
  status: string
  createdAt: string
  candidateUrl: string | null
  error: string | null
}

export interface SealedMapping {
  key: string
  label: string
  leagueCode: string | null
  matchTime: string
  gameIds: string[]
  outcome: string
  status: string
  candidateUrl: string | null
  error: string | null
  /** 마지막 판정 시각 */
  sealedAt: string
}

const SEALED_OUTCOMES = new Set(["no_candidate", "ambiguous"])

export function findSealedMappings(
  games: MappingGameRow[],
  attempts: MappingAttemptRow[]
): SealedMapping[] {
  const byGame = new Map<string, MappingAttemptRow[]>()
  for (const a of attempts ?? []) {
    if (!a?.gameId) continue
    byGame.set(a.gameId, [...(byGame.get(a.gameId) ?? []), a])
  }

  const groups = new Map<string, { games: MappingGameRow[]; attempts: MappingAttemptRow[] }>()
  for (const g of games ?? []) {
    const key = matchKeyOf(g)
    const hit = groups.get(key) ?? { games: [], attempts: [] }
    hit.games.push(g)
    hit.attempts.push(...(byGame.get(g.id) ?? []))
    groups.set(key, hit)
  }

  const out: SealedMapping[] = []
  for (const [key, v] of groups) {
    if (v.attempts.length === 0) continue
    if (v.attempts.some((a) => a.outcome === "proposed")) continue
    const latest = [...v.attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    const sealed =
      latest.status === "dead_letter" ||
      (latest.status === "ok" && SEALED_OUTCOMES.has(latest.outcome))
    if (!sealed) continue
    const rep = v.games[0]
    out.push({
      key,
      label: matchLabelOf(rep),
      leagueCode: rep.leagueCode,
      matchTime: rep.matchTime,
      gameIds: v.games.map((g) => g.id),
      outcome: latest.outcome,
      status: latest.status,
      candidateUrl: latest.candidateUrl,
      error: latest.error,
      sealedAt: latest.createdAt,
    })
  }
  // 킥오프가 가까운 것부터 — 경보 본문이 잘려도 급한 것이 먼저 보인다
  return out.sort((a, b) => a.matchTime.localeCompare(b.matchTime))
}
