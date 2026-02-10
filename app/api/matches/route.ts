import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/matches
 * 오늘의 경기 목록 (액티비티 사이드바용)
 * 실제 경기 데이터가 없을 때 빈 배열 반환하여 404 방지
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status') // upcoming 등
  const limit = parseInt(searchParams.get('limit') || '4', 10)

  // TODO: 실제 경기 API 연동 시 betman/games 등에서 조회
  // 현재는 빈 배열 반환하여 사이드바가 정상 동작하도록 함
  return NextResponse.json({
    matches: [],
    limit,
    status: status || null,
  })
}
