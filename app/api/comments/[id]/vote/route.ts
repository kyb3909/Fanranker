import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'

/**
 * POST /api/comments/[id]/vote
 * 댓글 투표 (추천/비추천) - Toggle 방식
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const { id: commentId } = await params
    const body = await request.json()
    const voteType = body.type || 'up'

    if (voteType !== 'up' && voteType !== 'down') {
      return NextResponse.json({ error: 'type은 "up" 또는 "down"이어야 합니다.' }, { status: 400 })
    }

    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()

    // 기존 투표 확인
    const { data: existing, error: checkError } = await supabase
      .from('comment_votes')
      .select('id, vote_type')
      .eq('comment_id', commentId)
      .eq('user_id', user.id)
      .single()

    let action: 'created' | 'updated' | 'deleted' = 'created'
    let newVoteType: string | null = voteType

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Failed to check existing vote:', checkError)
    }

    if (existing) {
      if (existing.vote_type === voteType) {
        // 같은 타입 재클릭 → 취소
        await supabase.from('comment_votes').delete().eq('id', existing.id)
        action = 'deleted'
        newVoteType = null
      } else {
        // 다른 타입으로 변경
        await supabase.from('comment_votes').update({ vote_type: voteType }).eq('id', existing.id)
        action = 'updated'
      }
    } else {
      // 새 투표
      const { error: insertError } = await supabase
        .from('comment_votes')
        .insert({ comment_id: commentId, user_id: user.id, vote_type: voteType })

      if (insertError) {
        console.error('Failed to insert comment vote:', insertError)
        return NextResponse.json({ error: '투표 저장 중 오류가 발생했습니다.' }, { status: 500 })
      }
    }

    // vote_count 업데이트: up - down
    const { count: upCount } = await supabase
      .from('comment_votes')
      .select('id', { count: 'exact', head: true })
      .eq('comment_id', commentId)
      .eq('vote_type', 'up')

    const { count: downCount } = await supabase
      .from('comment_votes')
      .select('id', { count: 'exact', head: true })
      .eq('comment_id', commentId)
      .eq('vote_type', 'down')

    const newVoteCount = (upCount || 0) - (downCount || 0)

    const { data: commentData } = await supabase
      .from('comments')
      .update({ vote_count: newVoteCount })
      .eq('id', commentId)
      .select('user_id')
      .single()

    // 댓글 작성자 + 투표한 사람의 유저 온도 갱신
    if (commentData?.user_id) {
      supabase.rpc('update_user_temperature', { p_user_id: commentData.user_id }).then(() => {})
    }
    supabase.rpc('update_user_temperature', { p_user_id: user.id }).then(() => {})

    return NextResponse.json({
      success: true,
      action,
      voteType: newVoteType,
      voteCount: newVoteCount,
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
