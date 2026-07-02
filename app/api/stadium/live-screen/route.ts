import { NextResponse } from "next/server"
import { CREATORS } from "@/lib/constants/creators"

/**
 * GET /api/stadium/live-screen
 *
 * 캣스날 유튜브 라이브 감지 — 스타디움 전광판 on/off 스위치.
 * youtube.com/channel/{id}/live 페이지를 서버에서 fetch 해 isLive 마커를 파싱.
 * (Data API 키/쿼터 불필요 — resolve-channel.ts 와 같은 스크레이프 방식)
 *
 * CDN 이 s-maxage=120 으로 캐시하므로 유튜브 실제 요청은 2분에 최대 1회.
 * 실패/컨센트 페이지는 live:false 로 fail-closed — 전광판이 꺼질 뿐 사이트엔 무해.
 */
export async function GET() {
  const creator = CREATORS.catsenal
  try {
    const res = await fetch(`https://www.youtube.com/channel/${creator.channelId}/live`, {
      headers: {
        // 데스크톱 UA — 모바일/봇 UA 는 다른 마크업을 받을 수 있음
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`youtube ${res.status}`)
    const html = await res.text()

    // 라이브 중이면 /live 가 해당 영상 워치 페이지로 렌더되고 isLive:true 마커 존재.
    // isUpcoming(예약된 라이브 대기 페이지)은 제외 — 시작 전 전광판이 켜지지 않게.
    const isLive = html.includes('"isLive":true') && !html.includes('"isUpcoming":true')
    let videoId: string | null = null
    if (isLive) {
      const canonical = html.match(
        /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/
      )
      videoId = canonical?.[1] ?? html.match(/"videoId":"([\w-]{11})"/)?.[1] ?? null
    }

    const response = NextResponse.json({
      live: isLive && !!videoId,
      videoId: isLive ? videoId : null,
      creator: creator.creatorId,
      channelId: creator.channelId,
    })
    response.headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300")
    return response
  } catch {
    // 감지 실패 = 전광판 꺼짐. 짧게 캐시해 유튜브 장애 시 재시도 폭주 방지.
    const response = NextResponse.json({ live: false, videoId: null, creator: creator.creatorId })
    response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120")
    return response
  }
}
