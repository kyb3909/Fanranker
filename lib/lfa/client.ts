import "server-only"

/**
 * live-football-api.com 클라이언트 (2026-08-17).
 *
 * ## 왜 필요한가
 * betman 은 경기 종료를 **종료 후 1~1.5시간** 뒤에야 반영한다 (2026-08-16 실측: 커뮤니티
 * 실드 종료 후 90분 넘게 in_progress, ASEAN 경기는 종료 1시간 20분 뒤 반영). 그동안 매치
 * 페이지는 스코어도 리포트도 못 띄운다. 이 API 는 같은 시점에 이미 FT 3-0 을 갖고 있었다.
 *
 * ## 비용 규율 (크레딧 = 돈)
 * - **호출당 1크레딧.** 모든 호출은 반드시 unstable_cache 뒤에 둔다 — 직접 부르지 말 것.
 * - `/matches?date=` 한 번이 그날 전 경기를 준다. 경기별로 부르지 말고 날짜별로 한 번 받아
 *   메모리에서 고른다 (경기 20개 = 20크레딧 → 1크레딧).
 * - 클라이언트 컴포넌트에서 호출 금지. 서버에서 받아 우리 캐시로 서빙한다.
 * - `LFA_ENABLED=off` 로 전면 차단 가능 (프리뷰·dev 에서 크레딧 낭비 방지).
 *
 * 잔여 크레딧은 응답 `credits_remaining` 에 실려 온다 — 소모율 추적용으로 로깅한다.
 */

const BASE = "https://live-football-api.com/api/v1"

/** 응답 공통 봉투 */
interface LfaEnvelope<T> {
  success: boolean
  credits_remaining?: number
  message?: string
  data?: T
}

/**
 * 단일 호출. 실패는 전부 null (fail-open) — 이 API 가 죽어도 페이지는 살아야 한다.
 * ⚠️ 캐시 없이 호출하면 크레딧이 요청 수만큼 나간다. 반드시 캐시 안에서 부를 것.
 */
export async function lfaFetch<T>(
  endpoint: string,
  params: Record<string, string>
): Promise<T | null> {
  if (process.env.LFA_ENABLED === "off") return null
  const key = process.env.LIVE_FOOTBALL_API_KEY
  if (!key) return null

  try {
    const qs = new URLSearchParams({ api_key: key, ...params })
    const res = await fetch(`${BASE}/${endpoint}?${qs}`, {
      // Next 의 자동 fetch 캐시에 기대지 않는다 — 캐시 정책은 호출부(unstable_cache)가 쥔다
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.warn(`[lfa] ${endpoint} HTTP ${res.status}`)
      return null
    }
    const json = (await res.json()) as LfaEnvelope<T>
    if (json.credits_remaining != null && json.credits_remaining < 2000) {
      // 소진 임박 — 라이브가 조용히 멈추기 전에 로그로 경고
      console.warn(`[lfa] ⚠️ 잔여 크레딧 ${json.credits_remaining}`)
    }
    if (!json.success) {
      console.warn(`[lfa] ${endpoint} 실패: ${json.message}`)
      return null
    }
    return json.data ?? null
  } catch (e) {
    console.warn(`[lfa] ${endpoint} 예외:`, e instanceof Error ? e.message : e)
    return null
  }
}

/* ── 응답 타입 (실측 기준 — 문서와 다른 부분이 있어 실제 응답을 따랐다) ── */

export interface LfaMatch {
  id: string
  league: { id: string; name: string; country?: string }
  kickoff: string
  status: { status: string; display: string; is_live: boolean; state: string }
  home: { id: string; name: string; logo?: string; score?: string | null }
  away: { id: string; name: string; logo?: string; score?: string | null }
  halftime?: { home: number; away: number }
}

export interface LfaEvent {
  time: string
  type: string
  side: "home" | "away"
  detail?: {
    player?: { name?: string; id?: string }
    score?: string
    /** 골 이벤트의 도움 (2026-08-19 실측: 골 12건 중 5건에 존재) */
    assist?: { name?: string; id?: string }
    /** substitution 전용 — "선수명 안 줌" 코드 주석은 오류였다 (2026-08-19 실측 68건) */
    in?: { name?: string; id?: string }
    out?: { name?: string; id?: string }
  }
}

export interface LfaStat {
  label: string
  home: string
  away: string
}

export interface LfaMatchDetails {
  match_id: string
  header: {
    home: { name: string; score: string }
    away: { name: string; score: string }
    status: { display: string; is_live: boolean; minute: string; state: string }
  }
  events: LfaEvent[]
  stats: LfaStat[]
}
