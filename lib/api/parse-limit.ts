/**
 * 쿼리스트링의 limit/offset 을 안전하게 파싱한다.
 *
 * 왜 필요한가
 * - `parseInt(searchParams.get("limit") ?? "20")` 패턴이 15곳 넘게 복사돼 있었고,
 *   그중 일부는 상한 클램프가 아예 없었다(`/api/bookmarks`, `/api/rankings`).
 * - 클램프가 있는 곳도 `?limit=abc` 면 `parseInt` 가 NaN 을 내고
 *   `Math.min(NaN, 50)` 역시 NaN 이라 그대로 쿼리로 흘러간다.
 *
 * 이 헬퍼는 NaN·음수·0·초과값을 전부 흡수한다.
 */

interface LimitOptions {
  /** 값이 없거나 유효하지 않을 때 쓸 기본값 */
  def: number
  /** 허용 최대값 (상한 클램프) */
  max: number
}

export function parseLimit(
  params: URLSearchParams | { get(k: string): string | null },
  { def, max }: LimitOptions
): number {
  const raw = params.get("limit")
  if (raw === null || raw.trim() === "") return def
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return def
  return Math.min(n, max)
}

/** offset/페이지 오프셋용 — 음수·NaN 은 0 으로 */
export function parseOffset(
  params: URLSearchParams | { get(k: string): string | null },
  key = "offset"
): number {
  const raw = params.get(key)
  if (raw === null || raw.trim() === "") return 0
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}
