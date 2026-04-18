/**
 * betman.co.kr HTTP 공용 클라이언트
 *
 * 주의: betman.co.kr은 한국 IP에서만 응답을 반환함 (해외 IP는 차단/빈 응답).
 * Vercel(해외)에서 호출 시 대부분 실패하고, Vultr 서울 VPS에서만 안정적으로 동작.
 */

export const BETMAN_BASE = "https://www.betman.co.kr"
export const GM_ID = "G101"

export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "X-Requested-With": "XMLHttpRequest",
  Origin: BETMAN_BASE,
}

const FETCH_TIMEOUT_MS = 15000
const MAX_BACKOFF_MS = 8000

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (resp.ok) return resp
      // 4xx는 재시도 의미 없음
      if (resp.status >= 400 && resp.status < 500) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
      }
      lastError = new Error(`HTTP ${resp.status}`)
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
    }
    if (attempt < maxRetries - 1) {
      const delay = Math.min(1000 * Math.pow(2, attempt), MAX_BACKOFF_MS) + Math.random() * 500
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError || new Error("fetch failed after retries")
}
