import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentUser } from '@clerk/nextjs/server'

/**
 * GET /api/tokens/history
 *
 * Get current user's token transaction history
 */
export async function GET(request: NextRequest) {
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

    // Fetch token transactions
    const { data: transactions, error: txError } = await supabase
      .from('token_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (txError) {
      // If table doesn't exist, return empty array
      if (txError.code === '42P01') {
        return NextResponse.json({
          transactions: [],
        })
      }
      console.error('Failed to fetch transactions:', txError)
      return NextResponse.json(
        { error: '거래 내역을 가져오는 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    // Transform transactions
    interface TokenTransaction {
      id: string
      type: string
      amount: number
      description: string | null
      created_at: string
      balance_after: number | null
    }
    const transformedTransactions = (transactions || []).map((tx: TokenTransaction) => ({
      id: tx.id,
      type: tx.type || (tx.amount > 0 ? 'earn' : 'spend'),
      amount: Math.abs(tx.amount),
      description: tx.description || getDefaultDescription(tx.type, tx.amount),
      createdAt: tx.created_at,
      balanceAfter: tx.balance_after,
    }))

    return NextResponse.json({
      transactions: transformedTransactions,
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

function getDefaultDescription(type: string, amount: number): string {
  switch (type) {
    case 'reset':
      return '매일 볼 충전'
    case 'earn':
      return '적중 보상'
    case 'spend':
      return '승부예측 사용'
    case 'purchase':
      return '볼 구매'
    default:
      return amount > 0 ? '볼 획득' : '볼 사용'
  }
}
