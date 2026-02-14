import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentUser } from '@clerk/nextjs/server'

/**
 * POST /api/payments/subscribe
 * 
 * Subscribe to an expert user (monthly subscription)
 * 
 * Body:
 * - expert_id: string (required) - Expert user ID to subscribe to
 * - amount_paid: number (optional) - Payment amount (default: 0 for token-based system)
 * 
 * Note: This is a simplified version. For production, integrate with Stripe or other payment gateway.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const userId = user.id

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()
    const body = await request.json()
    const { expert_id, amount_paid } = body

    if (!expert_id) {
      return NextResponse.json(
        { error: '전문가 ID가 필요합니다.' },
        { status: 400 }
      )
    }

    if (userId === expert_id) {
      return NextResponse.json(
        { error: '자기 자신을 구독할 수 없습니다.' },
        { status: 400 }
      )
    }

    // Check if expert exists and is actually an expert
    const { data: expertProfile } = await supabase
      .from('profiles')
      .select('user_id, is_expert')
      .eq('user_id', expert_id)
      .single()

    if (!expertProfile) {
      return NextResponse.json(
        { error: '전문가를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (!expertProfile.is_expert) {
      return NextResponse.json(
        { error: '이 사용자는 전문가가 아닙니다.' },
        { status: 400 }
      )
    }

    // Check for existing active subscription
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('id, status, expires_at')
      .eq('subscriber_id', userId)
      .eq('expert_id', expert_id)
      .eq('status', 'active')
      .single()

    if (existingSubscription) {
      // Check if subscription is still valid
      if (existingSubscription.expires_at && new Date(existingSubscription.expires_at) > new Date()) {
        return NextResponse.json(
          { error: '이미 활성화된 구독이 있습니다.', subscription: existingSubscription },
          { status: 400 }
        )
      }
    }

    // Calculate expiry date (30 days from now for monthly subscription)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    // Create subscription
    const { data: subscription, error: insertError } = await supabase
      .from('subscriptions')
      .insert({
        subscriber_id: userId,
        expert_id: expert_id,
        subscription_type: 'monthly',
        status: 'active',
        started_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        amount_paid: amount_paid || 0,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to create subscription:', insertError)
      
      // Handle unique constraint violation (duplicate active subscription)
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: '이미 활성화된 구독이 있습니다.' },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { error: '구독 생성 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    // TODO: Process payment (Stripe or token deduction)
    // For now, this is just a database record
    
    return NextResponse.json({
      success: true,
      message: '구독이 완료되었습니다.',
      subscription,
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/payments/subscribe
 * 
 * Cancel subscription to an expert
 * 
 * Body:
 * - expert_id: string (required) - Expert user ID to unsubscribe from
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const userId = user.id

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()
    const body = await request.json()
    const { expert_id } = body

    if (!expert_id) {
      return NextResponse.json(
        { error: '전문가 ID가 필요합니다.' },
        { status: 400 }
      )
    }

    // Update subscription status to cancelled
    const { data: subscription, error: updateError } = await supabase
      .from('subscriptions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('subscriber_id', userId)
      .eq('expert_id', expert_id)
      .eq('status', 'active')
      .select()
      .single()

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { error: '활성화된 구독을 찾을 수 없습니다.' },
          { status: 404 }
        )
      }

      console.error('Failed to cancel subscription:', updateError)
      return NextResponse.json(
        { error: '구독 취소 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '구독이 취소되었습니다.',
      subscription,
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/payments/subscribe
 * 
 * Get subscription status for current user
 * 
 * Query Parameters:
 * - expert_id?: string - Check subscription to specific expert
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return NextResponse.json({ subscriptions: [] })
    }

    const userId = user.id

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()
    const { searchParams } = new URL(request.url)
    const expertId = searchParams.get('expert_id')

    let query = supabase
      .from('subscriptions')
      .select('id, expert_id, subscription_type, status, started_at, expires_at, amount_paid')
      .eq('subscriber_id', userId)
      .eq('status', 'active')

    if (expertId) {
      query = query.eq('expert_id', expertId)
    }

    const { data: subscriptions, error } = await query

    if (error) {
      console.error('Failed to fetch subscriptions:', error)
      return NextResponse.json({ subscriptions: [] })
    }

    // Filter out expired subscriptions
    const activeSubscriptions = (subscriptions || []).filter((sub) => {
      if (!sub.expires_at) return true // one_time subscriptions
      return new Date(sub.expires_at) > new Date()
    })

    return NextResponse.json({ subscriptions: activeSubscriptions })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ subscriptions: [] })
  }
}
