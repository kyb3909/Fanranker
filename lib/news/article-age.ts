/**
 * 기사 자체의 나이 — "레딧엔 방금 올라왔지만 기사는 3주 전"인 재탕을 거르는 근거
 * (2026-09-03 애스턴 빌라-PSG 슈퍼컵 recap: 8/13 경기가 9/3 에 다시 발행됐다).
 *
 * 스캐너(VPS)의 신선도는 레딧 글 시각뿐이고, 자동발행의 MAX_AGE_HOURS 는 초안 생성 시각 기준이라
 * 둘 다 기사 날짜를 보지 않았다. 스캐너가 /api/og 의 publishedAt 을 raw.published_at 으로 넘기고,
 * 없으면 원문 URL 의 /YYYY/MM/DD/ 경로로 추정한다. 어느 것도 없으면 null — **판정하지 않는다**.
 */

/** 원문 URL 경로의 /YYYY/MM/DD/ (일 단위까지 있을 때만 — 월만 있는 /2026/08/ 은 애매해서 안 쓴다) */
export function dateFromUrlPath(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null
  let pathname: string
  try {
    pathname = new URL(sourceUrl).pathname
  } catch {
    return null
  }
  const m = pathname.match(/\/(20\d{2})\/(\d{1,2})\/(\d{1,2})\//)
  if (!m) return null
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T12:00:00Z`
  return Number.isFinite(Date.parse(iso)) ? iso : null
}

/** 기사 나이(시간). 게시 시각을 모르면 null */
export function articleAgeHours(input: {
  publishedAt?: string | null
  sourceUrl?: string | null
  now?: number
}): number | null {
  const now = input.now ?? Date.now()
  const candidates = [input.publishedAt, dateFromUrlPath(input.sourceUrl)]
  for (const c of candidates) {
    if (!c) continue
    const t = Date.parse(c)
    // 2000년 이전·미래(하루 이상)는 파싱 사고로 보고 버린다
    if (!Number.isFinite(t) || t < Date.parse("2000-01-01") || t > now + 86_400_000) continue
    return Math.max(0, (now - t) / 3_600_000)
  }
  return null
}

/** 자동발행이 거르는 기사 나이 상한 — 스캐너 STALE_ARTICLE_HOURS 와 같은 값 */
export const MAX_ARTICLE_AGE_HOURS = 72
