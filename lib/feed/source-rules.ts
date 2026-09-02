/**
 * 뉴스 출처 판정 규칙 — **순수 모듈** (2026-09-02 분리).
 *
 * 원래 `lib/feed/cardnews.ts` 안에 있었는데, 그 파일은 최상위에서 supabase 서버
 * 클라이언트를 import 하므로 규칙만 쓰고 싶은 곳(티커 매핑·시험)이 env 없이 못 불렀다.
 * 규칙을 두 벌로 복사하면 갈라지므로 여기 한 곳에 두고 양쪽이 가져다 쓴다.
 */

/**
 * 한국 매체 출처 판정 — 떡밥·티커에 넣지 않는다 (2026-08-04 운영자: "한국 뉴스에서
 * 퍼온 건 안 넣을 거야"). .kr TLD + 네이버/다음 + .com 을 쓰는 국내 매체.
 * 현재 파이프라인(레딧 스캐너)은 전부 해외 원문이라 지금은 0건 — 미래 유입 가드.
 */
export const KOREAN_SOURCE_RE =
  /\.kr(\/|$)|naver\.com|daum\.net|chosun\.com|donga\.com|newsis\.com|joongang\.co|hankyung\.com|starnewskorea\.com/i

export function isKoreanSource(sourceUrl: string | null | undefined): boolean {
  return !!sourceUrl && KOREAN_SOURCE_RE.test(sourceUrl)
}

/** 제목 앞 `[출처]` 프리픽스 — 봇 발행 규약 (예: "[로마노] 아스날, …") */
export const SOURCE_PREFIX_RE = /^\[([^\]]{1,24})\]\s*/

/** `[출처] 제목` → { source, title }. 프리픽스가 없으면 source 는 null. */
export function stripSourcePrefix(title: string): { source: string | null; title: string } {
  const m = title.match(SOURCE_PREFIX_RE)
  if (!m) return { source: null, title: title.trim() }
  return { source: m[1].trim(), title: title.slice(m[0].length).trim() }
}
