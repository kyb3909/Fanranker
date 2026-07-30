/**
 * 뉴스 초안 품질 판정 (순수 함수 — 서버 발행 게이트와 검수 UI 가 공유).
 *
 * 무내용 초안: 원문 추출이 0자로 실패하면 LLM 이 내용 대신 "세부 사항은 기사에서
 * 확인할 수 있습니다"류 자기지시 필러를 쓴다 (2026-07-30 hermes-reddit-1vank7k 사례).
 */

/** 무내용 초안이 쓰는 자기지시 필러 문구 */
export const CONTENT_FREE_PHRASES = [
  "기사에서 확인할 수",
  "기사를 참고",
  "자세한 내용은 기사",
  "세부 사항은 기사",
  "자세한 사항은 원문",
  "원문에서 확인",
]

/** 본문 최소 길이 — 이보다 짧으면 기사가 아니라 한 줄 요약이다 */
export const MIN_BODY_LENGTH = 80

/** 본문 텍스트가 무내용 초안인지 — 너무 짧거나 자기지시 필러 포함 */
export function isContentFreeText(text: string): boolean {
  const t = text.trim()
  if (t.length < MIN_BODY_LENGTH) return true
  return CONTENT_FREE_PHRASES.some((p) => t.includes(p))
}
