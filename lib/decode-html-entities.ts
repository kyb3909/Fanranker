/**
 * HTML 엔티티 디코딩 — 외부 출처(OG 메타, oembed, RSS/크롤러)에서 가져온 텍스트가
 * `&#x27;`, `&quot;`, `&amp;` 같은 엔티티를 그대로 담고 있어, 표시/저장 전에 풀어준다.
 * 16진(`&#x27;`)·10진(`&#39;`)·named(`&quot;` 등) 모두 처리.
 *
 * 정규식으로 메타태그/RSS 를 파싱하는 진입 지점(`/api/og`, `/api/oembed`, reddit 시딩 등)이
 * 공유한다. (data/crawlers·data/agents 는 별도 패키지라 자체 사본을 둔다.)
 */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&") // &amp; 는 마지막에 (이중 디코딩 방지)
}
