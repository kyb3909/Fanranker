import { NextRequest, NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/server'
import { verifyCronSecret } from '@/lib/cron-auth'

/**
 * POST /api/cron/daily-token-reset
 *
 * Daily token reset cron job — runs at 23:00 KST (14:00 UTC)
 * Calls ensure_daily_token_reset RPC for each user; the DB function
 * (get_token_reset_date) handles the 23:00 KST boundary logic.
 */

export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const supabase = createAnonClient()

    // Get all user_ids that have token records
    const { data: users, error: fetchError } = await supabase
      .from('user_tokens')
      .select('user_id')

    if (fetchError) {
      console.error('Failed to fetch users for token reset:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch users' },
        { status: 500 }
      )
    }

    if (!users || users.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No users found',
        resetCount: 0,
      })
    }

    // Call ensure_daily_token_reset for each user — the DB function
    // checks get_token_reset_date internally and only resets if needed
    let resetCount = 0
    let errorCount = 0

    for (const user of users) {
      const { error: resetError } = await supabase.rpc('ensure_daily_token_reset', {
        target_user_id: user.user_id,
      })

      if (resetError) {
        console.error(`Failed to reset tokens for user ${user.user_id}:`, resetError)
        errorCount++
      } else {
        resetCount++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Token reset completed`,
      resetCount,
      errorCount,
      totalUsers: users.length,
    })
  } catch (error) {
    console.error('Token reset cron job error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/cron/daily-token-reset
 * Manual trigger for testing (development only)
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 }
    )
  }

  return POST(request)
}
