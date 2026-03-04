import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * GET /api/cron/draft-auto-pick
 * 매분 실행: 타이머 만료된 드래프트 방의 자동 픽 처리
 */
export async function GET(request: Request) {
  // Vercel cron 인증
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceRoleClient()

    // 타이머 만료된 drafting 중인 방 찾기
    const { data: rooms } = await supabase
      .from('draft_rooms')
      .select('id')
      .eq('status', 'drafting')
      .lt('pick_deadline_at', new Date().toISOString())

    if (!rooms || rooms.length === 0) {
      return NextResponse.json({ processed: 0 })
    }

    let processed = 0
    for (const room of rooms) {
      try {
        // auto-pick API 내부 호출
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000'

        await fetch(`${baseUrl}/api/games/draft/rooms/${room.id}/auto-pick`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        processed++
      } catch {
        // Individual room failure shouldn't stop others
      }
    }

    return NextResponse.json({ processed, total: rooms.length })
  } catch (error) {
    console.error('[draft-auto-pick cron] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
