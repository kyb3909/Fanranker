"use client"

/**
 * LiveBillboard — 스타디움 전광판.
 *
 * 캣스날이 유튜브 라이브를 켜면 자동으로 나타나는 오버레이 (평소엔 없음):
 *  - /api/stadium/live-screen 을 3분 간격 폴링 (CDN 이 2분 캐시라 실요청은 적음)
 *  - 영상: 공식 embed (자동재생·음소거 시작 — 유저가 플레이어에서 해제)
 *  - 채팅: 유튜브 공식 live_chat 임베드 (입력창 포함 — 크롬/엣지에서 유튜브
 *    로그인 상태면 자기 계정으로 직접 채팅 가능. 사파리는 서드파티 쿠키
 *    차단으로 읽기 전용일 수 있음 → "유튜브에서 열기" 링크 제공)
 *  - 접기(🔴 LIVE 필)/닫기, 채팅 토글
 *
 * 데모/검증용: ?live_test=<videoId> 로 감지와 무관하게 강제 표시 가능.
 */

import { useEffect, useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"

interface LiveScreenState {
  live: boolean
  videoId: string | null
}

export function LiveBillboard() {
  const { data } = useSWR<LiveScreenState>("/api/stadium/live-screen", fetcher, {
    refreshInterval: 180_000,
    revalidateOnFocus: false,
  })

  // 데모/피치용 강제 표시 파라미터
  const [testVideoId, setTestVideoId] = useState<string | null>(null)
  const [host, setHost] = useState("gongnori.fan")
  useEffect(() => {
    setTestVideoId(new URLSearchParams(window.location.search).get("live_test"))
    setHost(window.location.hostname)
  }, [])

  const videoId = testVideoId ?? (data?.live ? data.videoId : null)

  const [dismissed, setDismissed] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [showChat, setShowChat] = useState(true)

  // 새 라이브(다른 videoId)가 시작되면 닫았던 상태 초기화
  useEffect(() => {
    setDismissed(false)
    setMinimized(false)
  }, [videoId])

  if (!videoId || dismissed) return null

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="absolute top-14 left-3 z-20 flex items-center gap-1.5 rounded-full border border-red-500/60 bg-black/80 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg backdrop-blur-sm transition-transform hover:scale-105"
      >
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
        캣스날 LIVE — 전광판 열기
      </button>
    )
  }

  return (
    <div className="absolute top-14 left-3 z-20 w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-xl border-2 border-neutral-700 bg-black shadow-2xl">
      {/* 전광판 헤더 */}
      <div className="flex items-center justify-between border-b border-white/10 bg-neutral-900 px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-white">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
          캣스날 LIVE
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowChat((v) => !v)}
            className="rounded px-2 py-0.5 text-[10px] font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            {showChat ? "채팅 접기" : "채팅 보기"}
          </button>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noreferrer"
            className="rounded px-2 py-0.5 text-[10px] font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            유튜브에서 열기 ↗
          </a>
          <button
            onClick={() => setMinimized(true)}
            aria-label="전광판 접기"
            className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            —
          </button>
          <button
            onClick={() => setDismissed(true)}
            aria-label="전광판 닫기"
            className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>
      {/* 영상 */}
      <div className="aspect-video w-full">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1`}
          title="캣스날 라이브"
          className="h-full w-full"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
      {/* 유튜브 라이브 채팅 (입력창 포함 공식 임베드) */}
      {showChat && (
        <iframe
          src={`https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${host}`}
          title="캣스날 라이브 채팅"
          className="h-[280px] w-full border-t border-white/10"
        />
      )}
    </div>
  )
}
