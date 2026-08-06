/**
 * 원문 URL 정규화 — **"같은 원문 URL = 같은 기사"** 규칙의 단일 소스.
 *
 * 2026-08-06 가디언 이중 발행 실사고에서 나온 규칙이다. 같은 기사가 utm 쿼리·www·
 * 대소문자·꼬리 슬래시·프래그먼트만 다른 URL 로 들어와 중복 판정을 빠져나갔다.
 * 호스트(www 제거)+경로만 남긴다. 파싱 불가면 원문 소문자 그대로 — 비교가 실패해서
 * 중복이 새는 것보다 낫다.
 *
 * 소비처 4곳 (전부 이 함수 하나를 쓴다 — 복제하면 한쪽만 고쳐지는 드리프트가 난다):
 *   유입(agent-draft) · 자동발행 게이트 · 발행 초크포인트(publishNewsDraft) ·
 *   사가 엔트리 접기(upsertSagaEntry)
 */
export function canonicalSourceUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase()
  } catch {
    return url.trim().toLowerCase()
  }
}
