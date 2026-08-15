/**
 * Soccerway 경기 페이지 정적 fetch/파싱 (실록 단계 2, 2026-08-07)
 *
 * 실측 근거 (missing-information.md I-3b 개정):
 *  - 신 soccerway 는 전면 SPA 라 날짜/리그 페이지의 경기 목록은 정적으로 안 나온다.
 *  - 대신 팀 해시 2개로 /match/{slug-hash}/{slug-hash}/ 를 직접 구성하면:
 *    · 해당 쌍의 경기가 없으면 404 (4.5KB 껍데기)
 *    · 있으면 200 + SSR 메타: <title>"{홈} v {원정} live scores…"</title>,
 *      description "On {DD/MM/YYYY} stay tuned with {대회} for {홈} v {원정}…",
 *      canonical 링크(순서 뒤집어 요청해도 canonical 로 301 — 쌍은 순서 무관)
 *  - canonical URL 의 팀 순서는 홈/원정이 아니다 (빌라-뮌헨: canonical 은 빌라 먼저,
 *    title 홈은 뮌헨). 홈/원정 판별은 title 순서만 믿는다.
 *
 * 주의: 이 파서는 title/description 메타에만 의존한다 — 마크업 개편 시 여기가 첫 파손
 * 지점이며, 파싱 실패는 호출부에서 fetch_error(retry_wait)로 분류해 원장에 남긴다.
 */

const SOCCERWAY_BASE = "https://www.soccerway.com"

const FETCH_HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-GB,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
}

export interface SoccerwayTeamRef {
  slug: string
  soccerwayTeamId: string
}

/** 페이지가 서술하는 경기 1건 — 홈/원정 순서는 이 후보의 서술 순서가 정본 */
export interface SoccerwayMatchCandidate {
  homeEn: string
  awayEn: string
  /** YYYY-MM-DD — 연도가 명시된 단일 경기 템플릿(A)만. 목록 템플릿(B)은 null (연도는 킥오프 기준 추론) */
  dateIso: string | null
  month: number
  day: number
}

export interface SoccerwayMatchPageInfo {
  /**
   * 페이지가 서술하는 경기들. 실측 2템플릿:
   *  A. 단일: "On 07/08/2026 stay tuned with Club Friendly 2026 for Bayern Munich v Aston Villa live…" → 1건
   *  B. 목록(2연전 등): "Stay tuned with 05.08. Fenerbahce (TUR) - Sturm Graz (AUT), 11.08. Sturm Graz (AUT) - Fenerbahce (TUR) live…" → N건 (연도 없음)
   */
  candidates: SoccerwayMatchCandidate[]
  tournament: string | null
  canonicalUrl: string | null
  /** canonical URL 에서 추출한 팀 해시 2개 (순서 무의미 — 집합 대조용) */
  canonicalTeamIds: string[]
}

/** 팀 순서는 무관 — soccerway 가 canonical 순서로 301 시킨다 */
export function buildMatchUrl(a: SoccerwayTeamRef, b: SoccerwayTeamRef): string {
  return `${SOCCERWAY_BASE}/match/${a.slug}-${a.soccerwayTeamId}/${b.slug}-${b.soccerwayTeamId}/`
}

/** /match/{slug-hash}/{slug-hash}/ 경로에서 해시 2개 추출 (해시는 8자 영숫자 — 실측 전수 일치) */
export function extractTeamIdsFromMatchUrl(url: string): string[] {
  const m = url.match(/\/match\/[a-z0-9-]+-([A-Za-z0-9]{8})\/[a-z0-9-]+-([A-Za-z0-9]{8})\//)
  return m ? [m[1], m[2]] : []
}

/** "Fenerbahce (TUR)" → "Fenerbahce" (목록 템플릿의 국가 코드 접미 제거) */
function stripCountrySuffix(name: string): string {
  return name.replace(/\s*\([A-Z]{2,3}\)\s*$/, "").trim()
}

export function parseMatchPage(html: string): SoccerwayMatchPageInfo | null {
  // title 은 페이지 유효성 게이트 (404 껍데기 배제) — 홈/원정 판정에는 candidates 를 쓴다
  const title = html.match(/<title>([^<]+?)\s+v\s+([^<]+?)\s+live scores/i)
  if (!title) return null

  const descTag = html.match(/name="description" content="([^"]*)"/i)
  if (!descTag) return null
  const desc = descTag[1]

  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)
  const canonicalUrl = canonical ? canonical[1] : null

  const candidates: SoccerwayMatchCandidate[] = []
  let tournament: string | null = null

  // 템플릿 A: 단일 경기 — 연도 포함, 대회명이 description 안에 있음
  const single = desc.match(
    /^On (\d{2})\/(\d{2})\/(\d{4}) stay tuned with (.+?) for (.+?) v (.+?) live/i
  )
  if (single) {
    const [, dd, mm, yyyy, tour, home, away] = single
    tournament = tour.trim()
    candidates.push({
      homeEn: home.trim(),
      awayEn: away.trim(),
      dateIso: `${yyyy}-${mm}-${dd}`,
      month: Number(mm),
      day: Number(dd),
    })
  } else {
    // 템플릿 B: 경기 목록(2연전 등) — "DD.MM. 홈 (CC) - 원정 (CC)," 반복, 연도 없음
    for (const m of desc.matchAll(
      /(\d{2})\.(\d{2})\.\s+([^,]+?)\s+-\s+([^,]+?)(?=,\s*\d{2}\.\d{2}\.|\s+live scores)/g
    )) {
      candidates.push({
        homeEn: stripCountrySuffix(m[3]),
        awayEn: stripCountrySuffix(m[4]),
        dateIso: null,
        month: Number(m[2]),
        day: Number(m[1]),
      })
    }
    // 목록 템플릿의 대회명은 og:description ("EUROPE: Champions League - Qualification …")
    const og = html.match(/property="og:description" content="([^"]*)"/i)
    if (og && og[1]) tournament = og[1].trim()
  }

  if (candidates.length === 0) return null

  return {
    candidates,
    tournament,
    canonicalUrl,
    canonicalTeamIds: canonicalUrl ? extractTeamIdsFromMatchUrl(canonicalUrl) : [],
  }
}

/**
 * 경기 페이지 HTML → Livesport eventId 후보 (라인업 조회용, 2026-08-16).
 *
 * HTML 안의 8자 영숫자 id 는 팀 해시와 동형이라 전수 스캔은 오탐 지뢰밭이다.
 * 실측으로 확인한 **결정적 앵커 두 곳**만 읽는다:
 *   ① `window.environment = {"event_id_c":"dj140ofe", …}`  — 프론트 부트스트랩
 *   ② dataLayer pageinfo `{"event":"pageinfo", …, "type":"detail_page", "id":"dj140ofe"}`
 * 보통 둘이 같은 값이라 후보는 1개다. 그래도 **채택은 호출자가 라인업 API 의
 * 참가팀명을 대조한 뒤에** 한다 — 오탐 eventId 는 남의 경기 라인업이라 사고 등급이 높다.
 * (후보만 뽑고 채택은 검증이 — match-mapping 의 규율과 같은 모양)
 */
export function extractLivesportEventIds(html: string): string[] {
  const out: string[] = []
  const push = (id: string | undefined) => {
    if (id && /^[A-Za-z0-9]{6,12}$/.test(id) && !out.includes(id)) out.push(id)
  }
  push(html.match(/"event_id_c"\s*:\s*"([A-Za-z0-9]{6,12})"/)?.[1])
  push(html.match(/"event"\s*:\s*"pageinfo"[^}]{0,200}?"id"\s*:\s*"([A-Za-z0-9]{6,12})"/)?.[1])
  return out.slice(0, 3)
}

export interface MatchPageFetchResult {
  httpStatus: number
  html: string | null
  finalUrl: string
}

export async function fetchMatchPage(url: string): Promise<MatchPageFetchResult> {
  const res = await fetch(url, { headers: FETCH_HEADERS, redirect: "follow" })
  const html = res.ok ? await res.text() : null
  return { httpStatus: res.status, html, finalUrl: res.url || url }
}
