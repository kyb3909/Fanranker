"use client"

import { useEffect, useState } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { trackEvent } from "@/lib/analytics/events"
import type { CardNewsItem } from "@/lib/feed/cardnews"

/**
 * VS 쟁점 1탭 투표 — 카드/모달 공용.
 *
 * ## 왜 공용인가
 * 같은 투표를 표면마다 따로 만들면 이 저장소가 반복해서 앓은 병이 재발한다
 * (표기 사전이 읽는 경로 7개로 갈라져 하루에 사고가 다섯 번 났던 것과 같은 구조).
 * 낙관 반영·롤백·소표본 처리 규칙은 한 곳에만 있어야 한다.
 *
 * 글 상세의 VsIssueWidget 과는 **의도적으로 별개**다: 저쪽은 폴 원본(options 배열,
 * myKey 서버값)을 받는 큰 위젯이고, 이쪽은 피드 카드에 실려 오는 압축 형태
 * (`CardNewsItem["vs"]` — 퍼센트와 총표만)를 받는 한 줄짜리다.
 *
 * ## 표면별 계측
 * surface 로 노출·투표를 갈라 본다. 같은 폴이라도 다른 표면은 다른 노출이므로
 * 세션 dedupe 키도 표면별로 분리한다.
 */

const A_COLOR = "var(--wc-burgundy, #961e37)"
const B_COLOR = "#2c4a6e"

/** 소표본에 % 를 숨기는 하한 — 1표가 "0% vs 100%" 로 그려지면 유령 사이트 증거가 된다 */
const SHOW_PCT_MIN_VOTES = 10

export interface CardVsVoteProps {
  vs: NonNullable<CardNewsItem["vs"]>
  surface: "card" | "modal"
  /** 카드용 컴팩트 배치 — 질문을 한 줄로 줄이고 여백을 줄인다 */
  compact?: boolean
}

export function CardVsVote({ vs, surface, compact }: CardVsVoteProps) {
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const [myKey, setMyKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 카드엔 % 와 총표만 실려 온다 — 근사 카운트로 복원해 낙관 반영에 쓴다
  const [counts, setCounts] = useState(() => {
    const aCount = Math.round((vs.total * vs.aPct) / 100)
    return { [vs.aKey]: aCount, [vs.bKey]: vs.total - aCount }
  })

  useEffect(() => {
    const storageKey = `vs-seen-${surface}`
    try {
      const seen = JSON.parse(sessionStorage.getItem(storageKey) || "{}")
      if (!seen[vs.pollId]) {
        seen[vs.pollId] = 1
        sessionStorage.setItem(storageKey, JSON.stringify(seen))
        trackEvent({ name: "vs_impression", params: { poll_id: vs.pollId, surface } })
      }
    } catch {
      trackEvent({ name: "vs_impression", params: { poll_id: vs.pollId, surface } })
    }
  }, [vs.pollId, surface])

  async function vote(optionKey: string) {
    if (busy || myKey === optionKey) return
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    setBusy(true)
    const prevKey = myKey
    const prevCounts = counts
    // 낙관 반영 — 실패하면 되돌린다
    setCounts((c) => ({
      ...c,
      [optionKey]: (c[optionKey] ?? 0) + 1,
      ...(prevKey ? { [prevKey]: Math.max(0, (c[prevKey] ?? 1) - 1) } : {}),
    }))
    setMyKey(optionKey)
    try {
      const res = await fetch(`/api/polls/${vs.pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionKey }),
      })
      if (!res.ok) throw new Error()
      trackEvent({
        name: "vs_vote",
        params: { poll_id: vs.pollId, option_key: optionKey, surface },
      })
    } catch {
      setMyKey(prevKey)
      setCounts(prevCounts)
    } finally {
      setBusy(false)
    }
  }

  const aCount = counts[vs.aKey] ?? 0
  const bCount = counts[vs.bKey] ?? 0
  const total = aCount + bCount
  const aPct = total === 0 ? 50 : Math.round((aCount / total) * 100)
  const showPct = total >= SHOW_PCT_MIN_VOTES

  const side = (key: string, label: string, color: string) => {
    const mine = myKey === key
    return (
      <button
        type="button"
        onClick={(e) => {
          // 카드 전체가 링크(absolute inset-0)라 클릭이 기사로 새는 것을 막는다
          e.preventDefault()
          e.stopPropagation()
          vote(key)
        }}
        disabled={busy}
        aria-pressed={mine}
        className={`pointer-events-auto relative z-[2] min-w-0 flex-1 rounded-lg text-left transition-all disabled:opacity-70 ${
          compact ? "px-2 py-1.5" : "px-2.5 py-2"
        }`}
        style={{
          background: mine ? `color-mix(in srgb, ${color} 8%, white)` : "var(--wc-card, #fff)",
          border: `1.5px solid ${mine ? color : "var(--wc-line, #e8e5e0)"}`,
        }}
      >
        <span
          className={`block truncate font-bold ${compact ? "text-[11.5px]" : "text-[12.5px]"}`}
          style={{ color: mine ? color : "var(--wc-ink, #1a1714)", wordBreak: "keep-all" }}
        >
          {label}
          {mine && " ✓"}
        </span>
      </button>
    )
  }

  return (
    <div
      className={`pointer-events-auto relative z-[2] min-w-0 rounded-lg ${compact ? "mt-2 p-2" : "p-3"}`}
      style={{
        background: "var(--wc-paper, #faf9f7)",
        border: "1px solid var(--wc-line, #e8e5e0)",
      }}
    >
      <p
        className={`mb-1.5 leading-snug font-bold ${compact ? "line-clamp-1 text-[11.5px]" : "text-[12.5px]"}`}
        style={{ color: "var(--wc-ink, #1a1714)", wordBreak: "keep-all" }}
      >
        🗳️ {vs.question}
      </p>
      <div className="flex gap-1.5">
        {side(vs.aKey, vs.aLabel, A_COLOR)}
        {side(vs.bKey, vs.bLabel, B_COLOR)}
      </div>
      <p className="mt-1 text-[10.5px]" style={{ color: "var(--wc-mute, #5c6470)" }}>
        {total === 0 ? "첫 표를 던져보세요" : `참여 ${total.toLocaleString()}명`}
        {showPct && ` · ${aPct}% vs ${100 - aPct}%`}
        {!isSignedIn && " · 투표는 로그인 후"}
      </p>
    </div>
  )
}
