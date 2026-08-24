import type { LfaMatch } from "@/lib/lfa/client"
import { BETMAN_CODE_BY_LFA_ID } from "@/lib/lfa/leagues"
import { isMatchPageLeague } from "@/lib/match/leagues"

/**
 * 하루치 목록을 얼마나 자주 다시 살 것인가 — **그날 경기 상황이 정한다** (2026-08-24 비용 감사).
 *
 * ## 왜 이 파일이 따로 있나
 * 이 함수 하나가 유료 크레딧 소모의 절반을 결정한다. 호출 1회 = 1크레딧이고,
 * `matches?date=` 는 모든 기능(라인업·스탯·불판·일정·홈 밴드)이 공유하는 앞단이다.
 * 순수 함수로 떼어 놔야 시험이 붙는다 — persist.ts 에 두면 Supabase 를 끌고 온다.
 *
 * ## 무엇이 문제였나
 * 종전엔 **달력 위치**만 봤다: "오늘이거나 아직 안 지난 날이면 무조건 5분".
 * 그래서 경기가 한 경기도 없는 날짜도, 이미 전 경기가 끝난 날짜도 5분마다 다시 샀다.
 * 실측으로 **동시에 3개 날짜**(어제 UTC·오늘 UTC·내일 UTC)가 그 대접을 받고 있었고,
 * 유럽 경기가 없는 KST 낮 시간대에도 시간당 45크레딧이 나갔다 — 하루 1,073,
 * 그날 소모의 절반이 "아무 일도 없는 시간"에서 나갔다.
 *
 * 목록에서 값이 실제로 **움직이는 건 경기가 진행 중일 때뿐**이다. 킥오프 전 일정은
 * 5분마다 바뀌지 않고, 끝난 경기 스코어는 영영 안 바뀐다.
 *
 * ⚠️ 불변식: **라이브 주기 <= 매치데이 주기 < 유휴 주기 < 킥오프 예열창**. 그래야 유휴 상태로 자다가 킥오프를 통째로
 *    놓치는 구간이 안 생긴다 — 마지막 구매가 아무리 늦어도 킥오프 45분 전 안쪽에서
 *    한 번 더 일어나고 거기서 빠른 주기로 전환된다. 둘 중 하나를 건드리면 이 부등호를
 *    반드시 같이 확인할 것 (`__tests__/lib/lfa-day-freshness.test.ts` 가 지킨다).
 */
export const PRE_KICKOFF_MS = 45 * 60_000
export const MATCH_WINDOW_MS = 3.5 * 3600_000
/**
 * 우리 리그 경기가 **실제로 진행 중**일 때. 목록의 값이 움직이는 건 이때뿐이라
 * 여기만 빠르게 간다 (2026-08-25). 5분이면 골이 최대 5분 늦게 뜬다 — 불판·매치센터가
 * 살아 있어야 할 바로 그 시간대다. 크롤러 누수(하루 ~20,000)를 막아 생긴 여유를
 * 여기에 쓴다: 우리 리그 라이브 창은 하루 몇 시간뿐이라 실제 증가는 하루 200 미만이다.
 */
export const FRESH_DAY_LIVE_MS = 90_000
/** 킥오프 예열 구간 — 아직 값이 안 움직이므로 라이브보다 느긋해도 된다. */
export const FRESH_DAY_MATCHDAY_MS = 5 * 60_000
export const FRESH_DAY_IDLE_MS = 30 * 60_000

/**
 * 우리가 실제로 지면에 내는 경기인가.
 *
 * ⚠️ 이 필터가 없으면 함수가 통째로 무력해진다 (2026-08-24 실측). `matches?date=` 는
 * **전 세계 경기**를 준다 — 하루 189~960경기. 지구 어딘가는 항상 경기 중이라
 * `is_live` 를 전수에서 보면 사실상 24시간 내내 "매치데이"로 판정된다.
 * 실제로 배포 직후 재보니 UTC 08-24 에 라이브 2경기가 있었고(우리가 안 쓰는 리그),
 * 그 둘 때문에 하루치 목록이 계속 5분마다 팔렸다 — 시간당 20크레딧.
 * 우리가 읽는 건 16개 리그뿐이다. 나머지는 신선도 판단에서 빼야 한다.
 */
function weServe(m: LfaMatch): boolean {
  const code = BETMAN_CODE_BY_LFA_ID.get(m.league?.id ?? "")
  return !!code && isMatchPageLeague(code)
}

export function dayFreshnessMs(dateUtc: string, matches: LfaMatch[]): number {
  const now = Date.now()
  const dayEnd = Date.parse(`${dateUtc}T00:00:00.000Z`) + 24 * 3600_000

  // 우리 리그 경기가 그날 하나도 없으면 이 목록에서 볼 게 없다
  const ours = matches.filter(weServe)
  if (ours.length === 0) return now > dayEnd ? Infinity : FRESH_DAY_IDLE_MS

  let anyUnfinished = false
  for (const m of ours) {
    if (m.status?.is_live) return FRESH_DAY_LIVE_MS
    const finished = m.status?.state === "postGame" || m.status?.display === "FT"
    if (finished) continue
    anyUnfinished = true
    // kickoff 는 그 UTC 날짜의 "HH:MM"
    const ko = /^\d{2}:\d{2}$/.test(m.kickoff) ? Date.parse(`${dateUtc}T${m.kickoff}:00.000Z`) : NaN
    if (!Number.isFinite(ko)) continue
    if (now >= ko - PRE_KICKOFF_MS && now <= ko + MATCH_WINDOW_MS) return FRESH_DAY_MATCHDAY_MS
  }

  // 안 끝난 경기가 하나도 없다 = 이 날짜는 굳었다. KST 날짜가 넘어갈 때까지 17시간을
  // 5분마다 다시 사던 "어제 UTC" 가 여기서 멈춘다.
  return anyUnfinished ? FRESH_DAY_IDLE_MS : Infinity
}

/**
 * 유료 조회를 허용하는 날짜 창 — 오늘 기준 과거 90일 ~ 미래 30일 (UTC).
 *
 * ⚠️⚠️ 2026-08-25 크레딧 화재. `/matches?date=` 가 형식만 맞으면 아무 날짜나 받았고,
 *    그 페이지의 날짜 칩이 양쪽으로 끝없이 이어져 크롤러에게 무한 링크 공간이었다.
 *    한 페이지가 곧 하루치 유료 구매라 캐시에 2003~2047년 9,466일이 쌓였고, 유료 호출이
 *    2시간에 1,742건 나갔다 (하루 ~21,000크레딧 — 평소 647의 32배).
 *    창 밖 날짜는 **사지 않는다**. 이미 산 게 있으면 그대로 준다.
 *
 * ⚠️ Supabase 를 끌어오지 않는 순수 모듈에 둔다 — 테스트가 env 없이 돌아야 한다.
 */
export const BUY_WINDOW_PAST_DAYS = 90
export const BUY_WINDOW_FUTURE_DAYS = 30

export function withinBuyWindow(dateUtc: string, now = Date.now()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateUtc)) return false
  const t = Date.parse(`${dateUtc}T00:00:00Z`)
  if (!Number.isFinite(t)) return false
  // 되돌아온 문자열이 다르면 존재하지 않는 날짜다 (2026-13-45 → 2027-01-14 로 밀린다)
  if (new Date(t).toISOString().slice(0, 10) !== dateUtc) return false
  const today = Math.floor(now / 86_400_000) * 86_400_000
  const days = Math.round((t - today) / 86_400_000)
  return days >= -BUY_WINDOW_PAST_DAYS && days <= BUY_WINDOW_FUTURE_DAYS
}

/* ── 경기 상세(스코어·분·타임라인·스탯) 캐시 수명 ── */

export const FRESH_LIVE_MS = 60_000
export const FRESH_OTHER_MS = 10 * 60_000
/** 킥오프가 임박하면 미리 라이브 주기로 전환 (LFA 가 늦게 뒤집는 것을 흡수) */
export const DETAILS_PRE_KICKOFF_MS = 10 * 60_000
export const DETAILS_MATCH_WINDOW_MS = 3.5 * 3600_000

/**
 * ⚠️⚠️ 수명을 **캐시된 값 스스로에게 묻지 않는다** (2026-08-25 실사고).
 *
 * 종전 규칙은 `live ? 60초 : 10분` 이었다. 그런데 `live` 는 방금 저장한 그 페이로드의
 * 필드다 — 킥오프 전엔 LFA 가 live:false 를 주므로 10분짜리 수명이 붙고, 그 10분 사이에
 * 경기가 시작해 골이 들어가도 다시 묻지 않는다. 게다가 아직 안 뒤집힌 상태에서 한 번 더
 * 물으면 또 live:false 를 받아 10분이 새로 시작된다 — **스스로 갇히는 캐시**다.
 *
 * 실사고: 풀럼 vs 첼시(2026-08-25 04:00 KST). 하루치 목록엔 0-1 · 11분 이 들어와 있는데
 * 매치센터는 계속 킥오프 시각만 보여줬다. 상세 캐시가 live:false 로 굳어 있었기 때문이다.
 *
 * 그래서 **시계**를 기준으로 판단한다 — 킥오프 창 안이면 캐시가 뭐라 하든 라이브 주기다.
 * (`dayFreshnessMs` 와 같은 교훈: 갱신 주기는 바깥 사실이 정해야 한다.)
 */
/** FT 후 LFA 가 이벤트를 늦게 채우는 경기를 기다려 주는 창 (재조회 6시간 규칙과 동일) */
export const DETAILS_EMPTY_RETRY_MS = 6 * 3600_000

export function detailsFreshnessMs(
  opts: { finished: boolean; live: boolean; matchTime?: string | null; emptyDetails?: boolean },
  now = Date.now()
): number {
  if (opts.finished) {
    // ⚠️ "끝났으면 영원히" 는 **채워진 경기**에만 해당한다 (2026-08-25).
    //    LFA 는 일부 경기의 이벤트·스탯을 FT 후 몇 시간 뒤에 채운다. 빈 상세가 finished
    //    로 저장되면 Infinity 에 갇혀 타임라인·득점자가 영영 빈다 — 프로 경기에 이벤트
    //    0(교체 포함)은 없다. unstable_cache 층의 "빈 응답 throw + 6시간 창" 과 같은
    //    교훈인데, DB 층(2026-08-24 신설)이 그 규칙 없이 위에 얹히면서 함정이 되살아났다.
    if (!opts.emptyDetails) return Infinity
    const kickoff = opts.matchTime ? Date.parse(opts.matchTime) : NaN
    const inRetry = Number.isFinite(kickoff) && now - kickoff < DETAILS_EMPTY_RETRY_MS
    return inRetry ? FRESH_OTHER_MS : Infinity
  }
  if (opts.live) return FRESH_LIVE_MS

  const kickoff = opts.matchTime ? Date.parse(opts.matchTime) : NaN
  if (Number.isFinite(kickoff)) {
    const from = kickoff - DETAILS_PRE_KICKOFF_MS
    const to = kickoff + DETAILS_MATCH_WINDOW_MS
    if (now >= from && now <= to) return FRESH_LIVE_MS
  }
  return FRESH_OTHER_MS
}
