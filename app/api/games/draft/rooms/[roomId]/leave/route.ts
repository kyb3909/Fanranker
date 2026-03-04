import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { apiError, apiBadRequest } from '@/lib/api-error'
import { getDraftUser } from '@/lib/draft/auth'

/**
 * POST /api/games/draft/rooms/[roomId]/leave — 방 나가기
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const user = await getDraftUser(request)
  if (!user) return apiBadRequest('인증이 필요합니다.')

  const { roomId } = await params

  try {
    const supabase = createServiceRoleClient()

    const { data: room } = await supabase
      .from('draft_rooms').select('*').eq('id', roomId).single()

    if (!room) return apiBadRequest('방을 찾을 수 없습니다.')
    if (room.status === 'drafting') return apiBadRequest('드래프트 진행 중에는 나갈 수 없습니다.')
    if (room.status !== 'waiting') return apiBadRequest('이미 종료된 방입니다.')

    const { error: deleteErr } = await supabase
      .from('draft_participants')
      .delete()
      .eq('room_id', room.id)
      .eq('user_id', user.id)

    if (deleteErr) return apiError('나가기에 실패했습니다.', 500, deleteErr)

    // 호스트가 나가면 방 폐기
    if (room.host_user_id === user.id) {
      await supabase
        .from('draft_rooms')
        .update({ status: 'abandoned', updated_at: new Date().toISOString() })
        .eq('id', room.id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError('나가기 중 오류가 발생했습니다.', 500, error)
  }
}
