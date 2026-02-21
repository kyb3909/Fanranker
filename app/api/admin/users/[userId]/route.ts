import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi, isErrorResponse } from '@/lib/admin/require-admin-api'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth
    const { userId } = await params

    const [
      { data: profile },
      { data: tokens },
      { data: gold },
      { count: postCount },
      { count: commentCount },
      { count: predictionCount },
      { data: sanctions },
      { data: recentPosts },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).single(),
      supabase.from('user_tokens').select('token_balance, total_tokens_earned').eq('user_id', userId).maybeSingle(),
      supabase.from('user_gold').select('gold_balance').eq('user_id', userId).maybeSingle(),
      supabase.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', userId).is('deleted_at', null),
      supabase.from('comments').select('*', { count: 'exact', head: true }).eq('user_id', userId).is('deleted_at', null),
      supabase.from('predictions').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('user_sanctions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
      supabase.from('posts').select('id, title, community_slug, created_at').eq('user_id', userId).is('deleted_at', null).order('created_at', { ascending: false }).limit(5),
    ])

    if (!profile) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json({
      profile,
      economy: {
        tokenBalance: tokens?.token_balance ?? 0,
        totalTokensEarned: tokens?.total_tokens_earned ?? 0,
        goldBalance: gold?.gold_balance ?? 0,
      },
      activity: {
        postCount: postCount ?? 0,
        commentCount: commentCount ?? 0,
        predictionCount: predictionCount ?? 0,
      },
      sanctions: sanctions ?? [],
      recentPosts: recentPosts ?? [],
    })
  } catch (error) {
    console.error('User detail API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
