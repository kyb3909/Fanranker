import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

/**
 * POST /api/posts/[id]/vote
 * 투표 (추천/비추천) - Toggle 방식
 * 
 * Body:
 * - type: 'up' | 'down' (선택, 기본값: 'up')
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const { id: postId } = await params
    const body = await request.json()
    const voteType = body.type || 'up' // 'up' or 'down'

    if (voteType !== 'up' && voteType !== 'down') {
      return NextResponse.json(
        { error: 'vote_type은 "up" 또는 "down"이어야 합니다.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // 1. 기존 투표 확인
    const { data: existingVote, error: checkError } = await supabase
      .from('post_votes')
      .select('id, vote_type')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .single()

    let voteAction: 'created' | 'updated' | 'deleted' = 'created'
    let newVoteType: string | null = voteType

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Failed to check existing vote:', checkError)
    }

    // 2. 투표 처리
    if (existingVote) {
      // 이미 투표한 경우
      if (existingVote.vote_type === voteType) {
        // 같은 타입의 투표를 다시 클릭하면 취소 (삭제)
        const { error: deleteError } = await supabase
          .from('post_votes')
          .delete()
          .eq('id', existingVote.id)

        if (deleteError) {
          console.error('Failed to delete vote:', deleteError)
          return NextResponse.json(
            { error: '투표 취소 중 오류가 발생했습니다.', details: deleteError.message },
            { status: 500 }
          )
        }

        voteAction = 'deleted'
        newVoteType = null
      } else {
        // 다른 타입의 투표로 변경
        const { error: updateError } = await supabase
          .from('post_votes')
          .update({ vote_type: voteType })
          .eq('id', existingVote.id)

        if (updateError) {
          console.error('Failed to update vote:', updateError)
          return NextResponse.json(
            { error: '투표 변경 중 오류가 발생했습니다.', details: updateError.message },
            { status: 500 }
          )
        }

        voteAction = 'updated'
      }
    } else {
      // 새로운 투표 생성
      const { error: insertError } = await supabase
        .from('post_votes')
        .insert({
          post_id: postId,
          user_id: userId,
          vote_type: voteType,
        })

      if (insertError) {
        console.error('Failed to create vote:', insertError)
        return NextResponse.json(
          { error: '투표 저장 중 오류가 발생했습니다.', details: insertError.message },
          { status: 500 }
        )
      }
    }

    // 3. posts.vote_count 업데이트 (비동기로 처리, 실패해도 무시)
    // upvote 개수 계산 후 업데이트
    supabase
      .from('post_votes')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId)
      .eq('vote_type', 'up')
      .then(({ count: upCount }) => {
        // downvote는 현재 구현에서 사용하지 않지만, 나중을 위해 남겨둠
        return supabase
          .from('posts')
          .update({ vote_count: upCount || 0 })
          .eq('id', postId)
      })
      .then(() => {
        console.log(`Vote count updated for post ${postId}`)
      })
      .catch((err) => {
        console.error('Failed to update vote count:', err)
      })

    return NextResponse.json({
      success: true,
      action: voteAction,
      voteType: newVoteType,
      message: voteAction === 'deleted' ? '투표가 취소되었습니다.' : '투표가 저장되었습니다.',
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
 * GET /api/posts/[id]/vote
 * 사용자의 투표 상태 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ voted: false, voteType: null })
    }

    const { id: postId } = await params
    const { createAnonClient } = await import('@/lib/supabase/server')
    const supabase = createAnonClient()

    const { data: vote } = await supabase
      .from('post_votes')
      .select('vote_type')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .single()

    return NextResponse.json({
      voted: !!vote,
      voteType: vote?.vote_type || null,
    })
  } catch (error) {
    // 에러 발생 시 투표하지 않은 것으로 간주
    return NextResponse.json({ voted: false, voteType: null })
  }
}
