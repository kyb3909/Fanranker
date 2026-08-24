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

/**
 * 크레딧 경보 (2026-08-23 사고) — 30,100 크레딧이 **아무 신호 없이** 바닥났고, 라인업·
 * 라이브 스코어·불판 생성이 한꺼번에 죽은 뒤에야 발견됐다. console.warn 은 아무도 안 본다.
 * 잔량이 임계 밑으로 내려가거나 403(소진/한도)이 오면 운영 채널로 밀어 올린다.
 * 서버리스 인스턴스마다 1회씩만 — 매 호출 알림은 그 자체로 소음이다.
 */
/**
 * 3,000 은 팩이 30,100 이던 시절의 10% 였다. 지금 팩은 20만대라 3,000 이면 1% 대 —
 * 그 시점엔 이미 며칠 안 남았다는 뜻이라 경보로서 늦다. 실측 소모(2026-08-24 심야
 * 20분 표본: 시간당 27 / 하루 647)를 기준으로 **한 달치**를 남기고 알린다.
 * 매치데이는 이보다 빠르므로 실제 여유는 2주 안팎으로 봐야 한다.
 */
const CREDIT_ALERT_THRESHOLD = 20_000
let creditAlerted = false
let deniedAlerted = false

async function alertOps(title: string, description: string) {
  try {
    const { notifyDiscordOps } = await import("@/lib/discord-notify")
    await notifyDiscordOps({ title, description, level: "alert" })
  } catch {
    /* 알림 실패가 본 작업을 깨면 안 된다 */
  }
}

/** 응답 공통 봉투 */
interface LfaEnvelope<T> {
  success: boolean
  credits_remaining?: number
  message?: string
  data?: T
}

/**
 * 단일 호출. 실패는 전부 null (fail-open) — 이 API 가 죽어도 페이지는 살아야 한다.
 * 일시 오류(네트워크·5xx)는 250ms 뒤 1회 재시도 — 라이브 중 한 번의 삐끗이 캐시 주기
 * 내내 화면을 죽이는 것을 줄인다 (2026-08-20 프로덕션 라이브 실사고).
 * ⚠️ 캐시 없이 호출하면 크레딧이 요청 수만큼 나간다. 반드시 캐시 안에서 부를 것.
 */
/**
 * 엔드포인트별 타임아웃 (2026-08-24 실측 사고).
 *
 * `matches?date=` 는 그날 **전 세계 경기**를 담아 913KB 다. LFA 서버가 날짜별로 응답을
 * 캐시하는데, 실측(2026-08-24)이 극단적이다:
 *   1차(서버 캐시 미스) **46,511ms** → 2차 518ms → 3차 620ms
 *
 * 종전 8초 고정은 시즌 개막으로 하루 800경기가 되면서 상시 실패로 돌아섰고, 더 나쁜 것은
 * **우리가 매번 중간에 끊어 서버 캐시가 영영 안 데워지는 악순환**이었다. 그 실패 하나가
 * 라인업·스탯·타임라인·불판 생성을 한꺼번에 죽였다 (증상은 "라인업이 안 나온다"로만 보여
 * 크레딧 소진으로 오인하기 쉬웠다).
 *
 * 그래서 두 축으로 푼다:
 *  · 타임아웃 55초 — 미스가 걸린 첫 호출을 끝까지 받아 서버·우리 캐시를 채운다
 *  · `/api/cron/lfa-warm` — cron 이 미리 데워 **사용자 요청은 항상 0.5초 히트**를 만난다
 * ⚠️ `league_id` 파라미터는 서버가 무시한다 (필터해도 800경기 그대로) — 응답 축소 불가.
 */
const TIMEOUT_MS: Record<string, number> = {
  matches: 55_000,
  // 경기 상세도 캐시 미스면 매우 느리다 (2026-08-24 실측: 120초 타임아웃에도 못 받음).
  // 통계 탭이 비어 있던 원인 — day 목록이 살아나도 여기서 막히면 스탯·타임라인이 빈다.
  live_match_details: 35_000,
  lineups: 25_000,
}
const DEFAULT_TIMEOUT_MS = 12_000

export async function lfaFetch<T>(
  endpoint: string,
  params: Record<string, string>
): Promise<T | null> {
  if (process.env.LFA_ENABLED === "off") return null
  const key = process.env.LIVE_FOOTBALL_API_KEY
  if (!key) return null

  for (let attempt = 0; ; attempt++) {
    try {
      const qs = new URLSearchParams({ api_key: key, ...params })
      const res = await fetch(`${BASE}/${endpoint}?${qs}`, {
        // Next 의 자동 fetch 캐시에 기대지 않는다 — 캐시 정책은 호출부(unstable_cache)가 쥔다
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS[endpoint] ?? DEFAULT_TIMEOUT_MS),
      })
      if (!res.ok) {
        console.warn(`[lfa] ${endpoint} HTTP ${res.status}`)
        // 403 = 키 무효·크레딧 소진·일일 한도·계정 비활성 — 라이브 전체가 죽는 상태다
        if (res.status === 403 && !deniedAlerted) {
          deniedAlerted = true
          await alertOps(
            "⚠️ 라이브 축구 API 차단 (403)",
            "크레딧 소진·일일 한도·키 문제 중 하나입니다. 라인업·라이브 스코어·불판 자동 생성이 전부 멈춥니다. live-football-api.com 대시보드에서 잔여 크레딧을 확인하세요."
          )
        }
        // 4xx 는 재시도해도 같다 (키·파라미터 문제) — 5xx·레이트리밋만 한 번 더
        if (attempt === 0 && (res.status >= 500 || res.status === 429)) {
          await new Promise((r) => setTimeout(r, 250))
          continue
        }
        return null
      }
      const json = (await res.json()) as LfaEnvelope<T>
      if (json.credits_remaining != null && json.credits_remaining < CREDIT_ALERT_THRESHOLD) {
        // 소진 임박 — 라이브가 조용히 멈추기 전에 운영 채널로 (로그만으론 아무도 못 본다)
        console.warn(`[lfa] ⚠️ 잔여 크레딧 ${json.credits_remaining}`)
        if (!creditAlerted) {
          creditAlerted = true
          await alertOps(
            "⚠️ 라이브 축구 API 크레딧 임박",
            `잔여 ${json.credits_remaining} — 바닥나면 라인업·라이브 스코어·불판이 전부 멈춥니다. 충전을 검토하세요.`
          )
        }
      }
      if (!json.success) {
        console.warn(`[lfa] ${endpoint} 실패: ${json.message}`)
        return null
      }
      return json.data ?? null
    } catch (e) {
      console.warn(`[lfa] ${endpoint} 예외:`, e instanceof Error ? e.message : e)
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 250))
        continue
      }
      return null
    }
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
