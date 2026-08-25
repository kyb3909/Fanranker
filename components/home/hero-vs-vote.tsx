"use client"

import { useEffect, useState } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import Link from "@/components/ui/app-link"
import { trackEvent } from "@/lib/analytics/events"
import type { CardNewsItem } from "@/lib/feed/cardnews"

/**
 * 히어로 배너의 "오늘의 쟁점" — **그 자리에서 바로 투표** (2026-08-12 운영자).
 *
 * 운영자: "오늘의 쟁점 - 로드리 이적이 맞는가 라는 투표가 공개 되어있잖아. 섬네일에.
 *          그러면 나는 그냥 거기서 바로 투표를 진행하면서 안에 들어갈 수 있게끔"
 *
 * ## 무엇이 바뀌었나
 * 이전엔 스트립 전체가 `<Link href="/post/...">` 라 어디를 눌러도 기사로만 갔다 —
 * 결과 바가 보이는데 참여는 못 하는 구조였다. 이제 양쪽 라벨이 투표 버튼이고,
 * 기사 진입은 아래 "이야기 보러 가기" 링크가 따로 맡는다.
 * 두 동작이 한 영역에 겹치면 오클릭이 난다 — 그래서 영역을 나눴다.
 *
 * ## 다크 허용 구역
 * 히어로는 밴드(선언 영역)라 다크가 허용된다 — 목록·카드·액션의 다크 금지 규칙과
 * 구분된다. 그래서 색을 크림/버건디 계열로 유지하고 흰 카드로 바꾸지 않는다.
 *
 * 계측은 surface="hero" — 카드·모달·본문과 다른 표면이므로 분리해서 본다.
 */

/** 소표본 % 숨김 하한 — 1표가 "0% vs 100%" 로 그려지면 유령 사이트 증거가 된다 */
const SHOW_PCT_MIN_VOTES = 10

export function HeroVsVote({
  vs,
  postId,
}: {
  vs: NonNullable<CardNewsItem["vs"]>
  postId: string
}) {
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const [myKey, setMyKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [counts, setCounts] = useState(() => {
    const aCount = Math.round((vs.total * vs.aPct) / 100)
    return { [vs.aKey]: aCount, [vs.bKey]: vs.total - aCount }
  })

  useEffect(() => {
    try {
      const seen = JSON.parse(sessionStorage.getItem("vs-seen-hero") || "{}")
      if (!seen[vs.pollId]) {
        seen[vs.pollId] = 1
        sessionStorage.setItem("vs-seen-hero", JSON.stringify(seen))
        trackEvent({ name: "vs_impression", params: { poll_id: vs.pollId, surface: "hero" } })
      }
    } catch {
      trackEvent({ name: "vs_impression", params: { poll_id: vs.pollId, surface: "hero" } })
    }
  }, [vs.pollId])

  async function vote(optionKey: string) {
    if (busy || myKey === optionKey) return
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    setBusy(true)
    const prevKey = myKey
    const prevCounts = counts
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
        params: { poll_id: vs.pollId, option_key: optionKey, surface: "hero" },
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

  return (
    <div className="mt-3 block max-w-[430px]">
      <span
        className="mb-1.5 flex items-baseline gap-2 text-[12px] font-bold"
        style={{ color: "var(--gn-cream)" }}
      >
        <span
          className="rounded px-1.5 py-0.5 text-[12px] font-extrabold tracking-wider"
          style={{ background: "rgba(150,30,55,.35)", color: "#e8a0b0" }}
        >
          오늘의 쟁점
        </span>
        <span style={{ wordBreak: "keep-all" }}>{vs.question}</span>
      </span>

      {/* 게이지 — 결과는 항상 공개(소표본만 % 숨김) */}
      <span
        className="flex h-[22px] overflow-hidden rounded-md text-[12px] font-extrabold"
        style={{ color: "var(--gn-cream)" }}
        role="img"
        aria-label={
          showPct
            ? `${vs.aLabel} ${aPct}%, ${vs.bLabel} ${100 - aPct}%`
            : `${vs.aLabel} 대 ${vs.bLabel} — 집계 중`
        }
      >
        <span
          className="flex items-center pl-2 transition-[width] duration-500"
          style={{
            width: `${aPct}%`,
            minWidth: 30,
            background:
              "linear-gradient(100deg, var(--wc-burgundy-deep,#771629), var(--wc-burgundy,#961e37))",
          }}
        >
          {showPct && `${aPct}%`}
        </span>
        <span
          className="flex items-center justify-end pr-2 transition-[width] duration-500"
          style={{
            width: `${100 - aPct}%`,
            minWidth: 30,
            background: "linear-gradient(100deg, #2c4a6e, #1f3550)",
          }}
        >
          {showPct && `${100 - aPct}%`}
        </span>
      </span>

      {/* 양쪽 라벨이 곧 투표 버튼 — 결과를 보던 자리에서 바로 참여한다 */}
      <div className="mt-1.5 flex gap-1.5">
        {(
          [
            [vs.aKey, vs.aLabel, "#e8a0b0", "rgba(150,30,55,.30)"],
            [vs.bKey, vs.bLabel, "#9db8d8", "rgba(44,74,110,.38)"],
          ] as const
        ).map(([key, label, color, tint]) => {
          const mine = myKey === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => vote(key)}
              disabled={busy}
              aria-pressed={mine}
              className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-[12px] font-bold transition-all disabled:opacity-70"
              style={{
                background: mine ? tint : "rgba(255,255,255,.07)",
                border: `1px solid ${mine ? color : "rgba(255,255,255,.16)"}`,
                color,
                wordBreak: "keep-all",
              }}
            >
              {label}
              {mine && " ✓"}
            </button>
          )
        })}
      </div>

      <p className="mt-1.5 text-[12px]" style={{ color: "var(--gn-cream-dim)" }}>
        {total === 0 ? "첫 표를 던져보세요" : `참여 ${total.toLocaleString()}명`}
        {!isSignedIn && " · 투표는 로그인 후"}
        {" · "}
        {/* 기사 진입은 별도 링크로 — 투표 버튼과 영역이 겹치면 오클릭이 난다 */}
        <Link href={`/post/${postId}`} className="underline underline-offset-2">
          이야기 보러 가기
        </Link>
      </p>
    </div>
  )
}
