import { NextResponse } from 'next/server'

/**
 * Verify CRON_SECRET Bearer token for internal/cron API routes.
 * Returns a NextResponse error if auth fails, or null if auth succeeds.
 *
 * SECURITY: Always rejects if CRON_SECRET env var is not set,
 * preventing unauthenticated access in misconfigured environments.
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

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  return null
}
