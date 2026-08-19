"use client"

import { trackEvent } from "@/lib/analytics/events"
import { DISCORD_INVITE_URL, DISCORD_BANNER } from "@/lib/constants/discord"

const DISCORD_BLURPLE = "#5865F2"

/** 디스코드 로고 마크 (외부 아이콘 의존 없이 인라인 SVG) */
function DiscordMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.036A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.056c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028ZM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.955 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
    </svg>
  )
}

function handleClick(placement: string) {
  trackEvent({ name: "discord_invite_click", params: { placement } })
}

/**
 * 디스코드 초대 배너 — 뉴스/알림 서버로 유입.
 * variant: "sidebar" (카드) | "inline" (예측 완료 다이얼로그 등 좁은 폭)
 */
export function DiscordInviteBanner({
  variant = "sidebar",
  placement,
}: {
  variant?: "sidebar" | "inline"
  placement: string
}) {
  if (variant === "inline") {
    return (
      <a
        href={DISCORD_INVITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => handleClick(placement)}
        className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
        style={{ background: DISCORD_BLURPLE }}
      >
        <DiscordMark className="h-4 w-4" />
        디스코드로 축구 뉴스·경기 알림 받기
      </a>
    )
  }

  // 브랜드색을 면(面)으로 쓰면 그 화면의 컬러 오너십을 뺏긴다 (2026-08-20 감리 A-10 —
  // 우측 레일에서 가장 채도 높은 물체였다). 카드 자체는 페이퍼, 블러플은 아이콘 원 안에만 —
  // 아이콘 한 점이면 충분히 "디스코드"로 읽힌다.
  return (
    <a
      href={DISCORD_INVITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => handleClick(placement)}
      className="block overflow-hidden rounded-lg transition-colors hover:bg-[var(--wc-soft)]"
      style={{
        background: "var(--wc-card)",
        border: "1px solid var(--wc-line)",
        boxShadow: "var(--wc-shadow-1)",
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: DISCORD_BLURPLE }}
        >
          <DiscordMark className="h-5 w-5 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold" style={{ color: "var(--wc-ink)" }}>
            {DISCORD_BANNER.title}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--wc-mute)" }}>
            {DISCORD_BANNER.desc}
          </p>
        </div>
      </div>
    </a>
  )
}
