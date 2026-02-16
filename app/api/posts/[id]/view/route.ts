import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createAnonClient } from '@/lib/supabase/server'

/**
 * POST /api/posts/[id]/view
 * 조회수 증가 (IP 기반 제한: 1시간에 한 번만)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAnonClient()

    // IP 주소를 SHA-256 해시하여 개인정보 보호 (PIPA 준수)
    const forwarded = request.headers.get('x-forwarded-for')
    const realIp = request.headers.get('x-real-ip')
    const rawIp = forwarded?.split(',')[0]?.trim() || realIp || 'unknown'
    const ipHash = createHash('sha256').update(rawIp).digest('hex')

    // RPC 함수를 사용하여 IP 해시 기반 제한과 함께 조회수 증가
    const { data, error } = await supabase.rpc('increment_post_view_count', {
      post_id_param: id,
      ip_address_param: ipHash,
    })

    if (error) {
      console.error('Failed to increment view count:', error)
      // 에러가 발생해도 조회수 증가 실패만 로그하고 계속 진행
      return NextResponse.json({ success: false, message: '조회수 증가 실패' })
    }

    // data가 false면 이미 최근 1시간 내에 조회한 IP
    if (data === false) {
      return NextResponse.json({ 
        success: false, 
        message: '이미 최근 1시간 내에 조회했습니다.',
        incremented: false 
      })
    }

    return NextResponse.json({ 
      success: true, 
      message: '조회수가 증가했습니다.',
      incremented: true 
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
