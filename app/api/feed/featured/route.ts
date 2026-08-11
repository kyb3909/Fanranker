import { NextResponse } from "next/server"
import { fetchHeroCards } from "@/lib/feed/cardnews"
import { apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"

/**
 * GET /api/feed/featured — "오늘의 이슈" 편성 카드 (비로그인 공개).
 *
 * 패널 결론(2026-08-12) Top5 #3: 신호가 0인 콜드스타트 구간은 알고리즘이 아니라
 * 편집이 메꾼다. 그 편성 시스템은 **이미 3단으로 존재한다** (fetchHeroCards):
 *   1순위 운영자 수동 핀(hero_pinned_at, 글 상세 "메인 걸기")
 *   2순위 편집장 에이전트 픽(agent_picks, 30분 주기·6h 신선도)
 *   3순위 규칙 폴백(최신 이미지 카드) — 편성이 비어도 화면이 죽지 않는다
 * 담벼락 히어로는 RSC 에서 이걸 직접 부르지만, 예측 완료 모달은 클라이언트라
 * API 가 필요했다 — 이 라우트가 그 문이다. **두 화면이 같은 소스를 먹는 것**이
 * 편성 슬롯의 요점이다 (한 번 편성 → 동시 노출).
 */
export async function GET() {
  try {
    const cards = await fetchHeroCards(3)
    return NextResponse.json(
      { cards },
      // 편성 변경(핀 토글)이 1분 안에 모달에 반영되면 충분 — 읽기 API 캐시 정책 준수
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    )
  } catch (error) {
    apiError("Featured feed error", 500, error)
    return NextResponse.json({ cards: [] })
  }
}
