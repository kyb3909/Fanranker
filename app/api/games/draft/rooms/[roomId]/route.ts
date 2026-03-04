import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api-error'

/**
 * GET /api/games/draft/rooms/[roomId] — 방 상태 전체 조회 (인증 불필요)
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params

  try {
    const supabase = createServiceRoleClient()

    const [roomRes, participantsRes, picksRes] = await Promise.all([
      supabase.from('draft_rooms').select('*').eq('id', roomId).single(),
      supabase.from('draft_participants').select('*').eq('room_id', roomId).order('seat_index'),
      supabase.from('draft_picks').select('*').eq('room_id', roomId).order('pick_number'),
    ])

    if (roomRes.error) return apiError('방을 찾을 수 없습니다.', 404, roomRes.error)

    let results = null
    if (roomRes.data.status === 'completed') {
      const resultsRes = await supabase
        .from('draft_results')
        .select('*')
        .eq('room_id', roomId)
        .order('seat_index')
      results = resultsRes.data
    }

    return NextResponse.json({
      room: roomRes.data,
      participants: participantsRes.data || [],
      picks: picksRes.data || [],
      results,
    })
  } catch (error) {
    return apiError('방 조회 중 오류가 발생했습니다.', 500, error)
  }
}
