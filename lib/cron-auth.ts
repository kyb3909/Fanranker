import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

/**
 * Verify CRON_SECRET Bearer token for internal/cron API routes.
 * Returns a NextResponse error if auth fails, or null if auth succeeds.
 *
 * SECURITY: Uses timing-safe comparison to prevent timing attacks.
 * Always rejects if CRON_SECRET env var is not set.
 */
export function verifyCronSecret(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('CRON_SECRET environment variable is not set')
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    )
  }

  const authHeader = request.headers.get('authorization') || ''
  const expected = `Bearer ${cronSecret}`

  // Timing-safe comparison to prevent brute-force timing attacks
  try {
    const a = Buffer.from(authHeader)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
