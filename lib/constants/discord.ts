/**
 * 공놀이봇 디스코드 뉴스/알림 서버 초대 정보 (공개 링크 — 비밀 아님).
 * 서버 설계: docs/DISCORD_NEWSBOT_DESIGN.md
 */

/** 무기한·무제한 초대 링크 (#공지 채널 기준, 2026-07-19 생성) */
export const DISCORD_INVITE_URL = "https://discord.gg/N56fZjrm6N"

/** 배너 문구 — 서비스 톤(예측/응원, 도박 언어 금지) 준수 */
export const DISCORD_BANNER = {
  title: "디스코드로 소식 받기",
  desc: "축구 뉴스 · 매일 밤 오늘의 경기 알림을 디스코드로.",
  cta: "디스코드 참여하기",
} as const
