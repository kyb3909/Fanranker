/**
 * 네이버 뉴스 검색 건수 — 표기의 **실사용 근거**.
 *
 * ⚠️ 이 파일은 `server-only` 를 쓰지 않는다 (2026-08-30). verify.ts 에 있을 때는
 *    CLI(tsx)에서 못 불러서, 스쿼드 이름 초안을 근거 없이 LLM 음차로만 만들어야 했다.
 *    판정 로직(pick.ts)이 이미 순수 모듈이므로 재료 수집도 같은 자리에 둔다.
 */

/**
 * 네이버 뉴스 검색 총 건수 — 표기의 실사용 근거.
 *
 * `scope`(보통 구단명)를 주면 **그 맥락 안에서만** 센다. 이름만 세면 흔한 단어가
 * 이기기 때문이다 (2026-08-10 운영자 지적). 실측:
 *   '레앙' 5,209 vs '레온' 45,133      → 레온 승 (다른 대상인데 오답)
 *   AC밀란 한정 3,384 vs 376           → 레앙 승 (정답)
 *   '아라우호' 6,790 vs '아라우조' 3,607 → 1.9배라 판정 보류
 *   바르셀로나 한정 4,661 vs 63        → 74배, 확정
 *
 * ⚠️ 질의 형태 주의: **이름만 따옴표**로 묶고 scope 는 밖에 둔다. 전체를 묶으면
 * 정확한 구절 검색이 되어 거의 0이 나온다 (실측으로 한 번 헛다리 짚었다).
 */
export async function naverNewsCount(query: string, scope?: string | null): Promise<number | null> {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/news.json?${new URLSearchParams({
        query: scope ? `"${query}" ${scope}` : `"${query}"`,
        display: "1",
      })}`,
      {
        headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
        signal: AbortSignal.timeout(10000),
      }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { total?: number }
    return typeof data.total === "number" ? data.total : null
  } catch {
    return null
  }
}
