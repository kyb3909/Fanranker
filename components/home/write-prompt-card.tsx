"use client"

import Link from "next/link"
import { Pencil } from "lucide-react"

/**
 * 인라인 글쓰기 프롬프트 (2026-08-20 — home-client 인라인에서 글자 그대로 추출).
 *
 * 두 곳에서 쓴다: ① board 탭 상단(종전 그대로) ② 떡밥 피드 딥스크롤 지점(i=18,
 * 모바일 전용). 쓰기 유도는 원탭 반응(폴·VS·담벼락 카드)보다 뒤 — 깊이 내려온
 * 사람에게만 멍석을 깐다 (읽기→원탭→쓰기 계단, 2026-07-01 진단).
 */
export function WritePromptCard() {
  return (
    <Link
      href="/write"
      className="flex items-center gap-3 rounded-xl px-4 py-3 no-underline transition-opacity hover:opacity-90"
      style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)" }}
        aria-hidden
      >
        <Pencil className="h-4 w-4" />
      </span>
      <span className="flex-1 text-[14px]" style={{ color: "var(--wc-mute)" }}>
        오늘 무슨 공놀이 이야기? 한 줄 남겨보세요…
      </span>
      <span
        className="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-bold"
        style={{ background: "var(--wc-burgundy)", color: "#fff" }}
      >
        글쓰기
      </span>
    </Link>
  )
}
