import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { apiError, apiBadRequest } from '@/lib/api-error'

/**
 * GET /api/games/draft/rooms/find?code=XXXXXX — 방 코드로 검색 (인증 불필요)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')?.trim().toUpperCase()

  if (!code || code.length !== 6) {
    return apiBadRequest('올바른 6자리 방 코드를 입력해주세요.')
  }

  try {
    const supabase = createServiceRoleClient()

    const { data: room, error } = await supabase
      .from('draft_rooms')
      .select('*')
      .eq('room_code', code)
      .eq('status', 'waiting')
      .single()

    if (error || !room) {
      return apiBadRequest('해당 코드의 대기 중인 방을 찾을 수 없습니다.')
    }

    return NextResponse.json({ room })
  } catch (error) {
    return apiError('방 검색 중 오류가 발생했습니다.', 500, error)
  }
}
