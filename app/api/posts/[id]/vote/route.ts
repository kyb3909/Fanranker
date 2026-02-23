import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentUser } from '@clerk/nextjs/server'
import { apiError, apiUnauthorized, checkRateLimit } from '@/lib/api-error'

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
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    // currentUser()를 사용하여 인증 확인 (API 라우트에서 더 안정적)
    const user = await currentUser()
    
    if (!user) {
      return apiUnauthorized()
    }

    const userId = user.id

    const { id: postId } = await params
    const body = await request.json()
    const voteType = body.type || 'up' // 'up' or 'down'

    if (voteType !== 'up' && voteType !== 'down') {
      return NextResponse.json(
        { error: 'vote_type은 "up" 또는 "down"이어야 합니다.' },
        { status: 400 }
      )
    }

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    // currentUser()로 이미 user_id를 검증했으므로 안전합니다.
    // ⚠️ 중요: Service Role은 RLS를 우회하므로, 반드시 코드에서 user_id를 검증해야 합니다!
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()

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
          return apiError('투표 취소 중 오류가 발생했습니다.', 500, deleteError)
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
          return apiError('투표 변경 중 오류가 발생했습니다.', 500, updateError)
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
        return apiError('투표 저장 중 오류가 발생했습니다.', 500, insertError)
      }
    }

    // 3. posts.vote_count 업데이트 (net count: up - down)
    const { count: upCount } = await supabase
      .from('post_votes')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId)
      .eq('vote_type', 'up')

    const { count: downCount } = await supabase
      .from('post_votes')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId)
      .eq('vote_type', 'down')

    const newVoteCount = (upCount || 0) - (downCount || 0)

    // vote_count 업데이트 + 게시물 작성자 온도 갱신
    const { data: postData, error: updateError } = await supabase
      .from('posts')
      .update({ vote_count: newVoteCount })
      .eq('id', postId)
      .select('user_id')
      .single()

    if (updateError) {
      console.error('Failed to update vote count:', updateError)
    }

    // 게시물 작성자 유저 온도 비동기 갱신
    if (postData?.user_id) {
      supabase.rpc('update_user_temperature', { p_user_id: postData.user_id }).then(() => {})
    }
    // 투표한 사람의 온도도 갱신 (투표 활동 반영)
    supabase.rpc('update_user_temperature', { p_user_id: userId }).then(() => {})

    return NextResponse.json({
      success: true,
      action: voteAction,
      voteType: newVoteType,
      voteCount: newVoteCount, // 업데이트된 vote_count 반환
      message: voteAction === 'deleted' ? '투표가 취소되었습니다.' : '투표가 저장되었습니다.',
    })
  } catch (error) {
    return apiError('서버 오류가 발생했습니다.', 500, error)
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
    // currentUser()를 사용하여 인증 확인
    const user = await currentUser()
    
    if (!user) {
      return NextResponse.json({ voted: false, voteType: null })
    }

    const userId = user.id

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
