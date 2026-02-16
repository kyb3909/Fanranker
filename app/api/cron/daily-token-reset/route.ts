import { NextRequest, NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/server'
import { verifyCronSecret } from '@/lib/cron-auth'

/**
 * POST /api/cron/daily-token-reset
 * 
 * Daily token reset cron job endpoint
 * Should be called daily at 12:00 KST (or scheduled via Vercel Cron / external scheduler)
 * 
 * Security: Should be protected by API key or Vercel Cron secret
 */

export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const supabase = createAnonClient()

    // Find all users whose tokens need reset (last_reset_at < today 00:00 KST)
    // Using KST timezone: UTC+9
    const todayKST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
    todayKST.setHours(0, 0, 0, 0)
    const todayKSTISO = todayKST.toISOString()

    // Get all users who haven't had a reset today
    const { data: usersToReset, error: fetchError } = await supabase
      .from('user_tokens')
      .select('user_id')
      .or(`last_reset_at.is.null,last_reset_at.lt.${todayKSTISO}`)

    if (fetchError) {
      console.error('Failed to fetch users for token reset:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch users' },
        { status: 500 }
      )
    }

    if (!usersToReset || usersToReset.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No users need token reset',
        resetCount: 0,
      })
    }

    // Reset tokens for each user using the PostgreSQL function
    let resetCount = 0
    let errorCount = 0

    for (const user of usersToReset) {
      const { error: resetError } = await supabase.rpc('reset_user_daily_tokens', {
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
      totalUsers: usersToReset.length,
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
 * 
 * Manual trigger for testing purposes (development only)
 * Remove or protect this in production
 */
export async function GET(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 }
    )
  }

  // Reuse POST logic
  return POST(request)
}
