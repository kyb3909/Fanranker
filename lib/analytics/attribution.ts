/**
 * 유입 채널 귀속 (first-touch attribution)
 *
 * 유튜버 유입은 "영상 → 랜딩 → 이탈 → 며칠 뒤 재방문 → 가입" 처럼 끊긴다.
 * 가입 시점의 URL 만 보면 그 사람은 direct 로 잡히고 유튜버 기여가 증발한다.
 * 그래서 **첫 방문 때 채널을 박아두고 가입할 때 꺼내 쓴다.**
 *
 * 한 번 저장되면 덮어쓰지 않는다 — 묻는 것은 "누가 데려왔나"이지
 * "마지막에 뭘 클릭했나"가 아니다.
 */

const STORAGE_KEY = "gn_attr_v1"
const SESSION_LANDING_KEY = "gn_landing_v1"

export type Attribution = {
  source: string
  medium: string | null
  campaign: string | null
  content: string | null
  term: string | null
  referrerHost: string | null
  landingPath: string
  firstSeenAt: string
}

function readStored(): Attribution | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Attribution>
    if (!parsed || typeof parsed.source !== "string") return null
    return parsed as Attribution
  } catch {
    // 시크릿 모드 등 localStorage 차단 환경 — 귀속을 포기하되 페이지는 살려둔다.
    return null
  }
}

function hostOfReferrer(): string | null {
  const ref = document.referrer
  if (!ref) return null
  try {
    const host = new URL(ref).hostname.replace(/^www\./, "")
    // 내부 이동은 유입이 아니다.
    if (host === window.location.hostname.replace(/^www\./, "")) return null
    return host
  } catch {
    return null
  }
}

/**
 * 첫 방문이면 채널을 저장한다. 이미 저장돼 있으면 그대로 돌려준다.
 * UTM 이 없어도 저장한다 — direct/자연유입도 분모라서 빠지면 전환율이 뻥튀기된다.
 */
export function captureAttribution(): Attribution | null {
  if (typeof window === "undefined") return null

  const existing = readStored()
  if (existing) return existing

  const params = new URLSearchParams(window.location.search)
  const referrerHost = hostOfReferrer()
  const utmSource = params.get("utm_source")

  const attribution: Attribution = {
    source: utmSource || referrerHost || "direct",
    medium: params.get("utm_medium"),
    campaign: params.get("utm_campaign"),
    content: params.get("utm_content"),
    term: params.get("utm_term"),
    referrerHost,
    landingPath: window.location.pathname,
    firstSeenAt: new Date().toISOString(),
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution))
  } catch {
    /* 저장 못 해도 이번 방문의 GA4 이벤트에는 채널이 실린다 */
  }
  return attribution
}

export function getAttribution(): Attribution | null {
  if (typeof window === "undefined") return null
  return readStored()
}

/** GA4 이벤트에 얹을 채널 파라미터 (없으면 unknown 으로 채워 분모를 잃지 않는다) */
export function channelParams(attr: Attribution | null) {
  return {
    channel: attr?.source ?? "unknown",
    channel_campaign: attr?.campaign ?? "none",
  }
}

/** 세션당 1회만 랜딩 도달을 기록하기 위한 가드 */
export function markLandingFired(): boolean {
  try {
    if (window.sessionStorage.getItem(SESSION_LANDING_KEY)) return false
    window.sessionStorage.setItem(SESSION_LANDING_KEY, "1")
    return true
  } catch {
    return false
  }
}
