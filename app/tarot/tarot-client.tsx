"use client"

import { useSearchParams } from "next/navigation"
import { TarotReader } from "@/components/tarot/tarot-reader"

/**
 * /tarot 페이지 어댑터 — URL 질문(?q=)을 리더에 넘긴다.
 *
 * 리딩 UI 자체는 components/tarot/tarot-reader 에 있다(모달과 공유). 여기 남은 일은
 * "질문이 어디서 오는가"뿐이다 — 페이지는 URL, 모달은 기사 제목.
 *
 * 기사에서 들어오면 질문이 이미 채워져 있다 (lib/tarot/suggest) —
 * 콜드스타트에서 가장 큰 마찰은 빈 입력창이다.
 */
export function TarotClient() {
  const searchParams = useSearchParams()
  return <TarotReader initialQuestion={searchParams.get("q") ?? ""} />
}
