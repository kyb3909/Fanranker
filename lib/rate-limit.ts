/**
 * Simple in-memory sliding window rate limiter for Edge Runtime.
 *
 * On Vercel Edge, isolate memory persists across requests within the
 * same instance, providing effective per-instance rate limiting.
 * Not distributed, but meaningfully reduces abuse from rapid-fire attacks.
 *
 * ⚠️ 한계:
 * - 서버리스 환경에서 인스턴스간 상태 비공유 (각 인스턴스가 독립적인 카운터 유지)
 * - 인스턴스 재시작 시 카운터 초기화
 * - 분산 환경에서 정확한 전역 제한이 필요하면 Redis/Upstash 등 외부 저장소 사용 권장
 * - 현재 구현은 단일 인스턴스 내 rapid-fire 공격 방어에 효과적
 */

const store = new Map<string, { count: number; resetTime: number }>()

// Periodic cleanup to prevent memory leaks
let lastCleanup = Date.now()
const CLEANUP_INTERVAL = 60_000 // 1 minute

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, record] of store) {
    if (record.resetTime < now) store.delete(key)
  }
}

/**
 * Check rate limit for a given key.
 * @returns { success, remaining } — success=false means limit exceeded
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number } {
  const now = Date.now()
  cleanup(now)

  const record = store.get(key)

  if (!record || record.resetTime < now) {
    store.set(key, { count: 1, resetTime: now + windowMs })
    return { success: true, remaining: limit - 1 }
  }

  if (record.count >= limit) {
    return { success: false, remaining: 0 }
  }

  record.count++
  return { success: true, remaining: limit - record.count }
}

// Rate limit presets (requests per window)
export const RATE_LIMITS = {
  // Sensitive: token spending, payments, account deletion
  STRICT: { limit: 10, windowMs: 60_000 },
  // Standard: general API calls
  STANDARD: { limit: 60, windowMs: 60_000 },
  // Lenient: public reads
  LENIENT: { limit: 120, windowMs: 60_000 },
} as const
