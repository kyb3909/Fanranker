import type { Metadata } from "next"
import { TarotClient } from "./tarot-client"

export const metadata: Metadata = {
  title: "루나의 축구 점집 — 오늘 우리 팀 이길까?",
  description:
    "경기, 이적설, 감독 거취. 궁금한 걸 물어보면 타로 리더 루나가 카드로 흐름을 읽어줍니다. 오락 목적의 재미 콘텐츠.",
  alternates: { canonical: "/tarot" },
}

/**
 * /tarot — 축구 타로 (2026-08-12 운영자 제안).
 *
 * 타로 서비스(D:/Projects/tarot)의 리딩 코어를 이식하고 축구로 각색했다.
 * 유입 표면 기준을 전부 만족한다: 유저 0명에서 성립 · 비로그인 가치 · 공유 유발 ·
 * 경기일마다 새 질문(데일리 훅).
 *
 * GNB 에는 걸지 않는다 — 예측(볼) 화면과 동선을 분리해 "점괘로 경기를 맞힌다"로
 * 읽히지 않게 한다(카카오 심사 진행 중). 직접 URL·공유 링크로만 들어온다.
 */
export default function TarotPage() {
  return (
    <div className="min-h-[100dvh]" style={{ background: "var(--wc-paper)" }}>
      <TarotClient />
    </div>
  )
}
