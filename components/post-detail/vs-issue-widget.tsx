"use client"

import { useEffect, useState } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { trackEvent } from "@/lib/analytics/events"
import type { VsPollData } from "@/lib/news/vs-issue"

/**
 * VS 쟁점 위젯 (게시물 상세, 라이트 존) — 찬반 1탭 투표 + 게이지.
 *
 * 결과는 항상 공개(사이드바 폴과 동일 정책 — 비로그인도 열람, 투표만 로그인).
 * 투표하면 내 선택이 하이라이트되고, 내 댓글에 진영 칩이 붙는다.
 * 다크 금지 규칙: 라이트 존이므로 흰 카드 + 배경 틴트/게이지 색으로만 진영 구분.
 */

const A_COLOR = "var(--wc-burgundy, #961e37)"
const B_COLOR = "#2c4a6e"

export function VsIssueWidget({ vs }: { vs: VsPollData }) {
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const [myKey, setMyKey] = useState(vs.myKey)
  const [counts, setCounts] = useState(vs.counts)
  const [busy, setBusy] = useState(false)

  // 노출 계측 — 세션당 폴별 1회 (카드 표면과 같은 dedupe 키를 공유해 이중 집계 방지 안 함:
  // surface 가 다르면 다른 노출이다. 키를 surface 별로 분리)
  useEffect(() => {
    try {
      const seen = JSON.parse(sessionStorage.getItem("vs-seen-post") || "{}")
      if (!seen[vs.pollId]) {
        seen[vs.pollId] = 1
        sessionStorage.setItem("vs-seen-post", JSON.stringify(seen))
        trackEvent({ name: "vs_impression", params: { poll_id: vs.pollId, surface: "post" } })
      }
    } catch {
      trackEvent({ name: "vs_impression", params: { poll_id: vs.pollId, surface: "post" } })
    }
  }, [vs.pollId])

  const a = vs.options[0]
  const b = vs.options[1]
  if (!a || !b) return null

  const aCount = counts[a.key] ?? 0
  const bCount = counts[b.key] ?? 0
  const total = aCount + bCount
  // 표가 없으면 50:50 으로 그린다 (빈 게이지는 죽어 보인다)
  const aPct = total === 0 ? 50 : Math.round((aCount / total) * 100)
  const bPct = 100 - aPct
  // 소표본(10표 미만)엔 % 를 숨긴다 — 1표가 "0% vs 100%" 로 그려지는 순간
  // 콜드스타트 장치가 유령 사이트 증거로 뒤집힌다 (2026-07-30 워룸)
  const showPct = total >= 10

  async function vote(optionKey: string) {
    if (busy || myKey === optionKey) return
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    setBusy(true)
    const prevKey = myKey
    const prevCounts = counts
    // 낙관적 반영 — 실패 시 롤백
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
        params: { poll_id: vs.pollId, option_key: optionKey, surface: "post" },
      })
    } catch {
      setMyKey(prevKey)
      setCounts(prevCounts)
    } finally {
      setBusy(false)
    }
  }

  const optionBtn = (opt: { key: string; label: string }, color: string, tint: string) => {
    const mine = myKey === opt.key
    return (
      <button
        type="button"
        onClick={() => vote(opt.key)}
        disabled={busy}
        aria-pressed={mine}
        className="rounded-xl px-3.5 py-3 text-left transition-all disabled:opacity-70"
        style={{
          background: mine ? tint : "var(--wc-card, #fff)",
          border: `1.5px solid ${mine ? color : "var(--wc-line, #e5ded4)"}`,
        }}
      >
        <span
          className="block text-[13px] leading-snug font-bold"
          style={{ color: mine ? color : "var(--wc-ink, #2a2530)", wordBreak: "keep-all" }}
        >
          {opt.label}
        </span>
        <span className="mt-0.5 block text-[12px]" style={{ color: "var(--wc-mute, #8a8378)" }}>
          {mine ? "내 선택 ✓" : "이쪽에 한 표"}
        </span>
      </button>
    )
  }

  return (
    <section
      aria-label="오늘의 쟁점 투표"
      className="rounded-2xl p-4"
      style={{ background: "var(--wc-card, #fff)", boxShadow: "var(--wc-shadow-1)" }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className="rounded-md px-2 py-[3px] text-[12px] font-extrabold tracking-wider"
          style={{
            background: "color-mix(in srgb, var(--wc-burgundy) 8%, transparent)",
            color: "var(--wc-burgundy)",
          }}
        >
          오늘의 쟁점
        </span>
        <h3
          className="text-[16px] font-extrabold"
          style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
        >
          {vs.question}
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {optionBtn(a, A_COLOR, "color-mix(in srgb, #961e37 7%, white)")}
        {optionBtn(b, B_COLOR, "color-mix(in srgb, #2c4a6e 8%, white)")}
      </div>

      {/* 게이지 — 결과 항상 공개 (소표본은 % 숨김) */}
      <div
        className="mt-3 flex h-8 overflow-hidden rounded-lg text-[13px] font-extrabold text-white"
        role="img"
        aria-label={
          showPct ? `${a.label} ${aPct}%, ${b.label} ${bPct}%` : `참여 ${total}명 — 집계 중`
        }
      >
        <div
          className="flex items-center pl-2.5 transition-[width] duration-500"
          style={{ width: `${aPct}%`, background: A_COLOR, minWidth: 34 }}
        >
          {showPct && `${aPct}%`}
        </div>
        <div
          className="flex items-center justify-end pr-2.5 transition-[width] duration-500"
          style={{ width: `${bPct}%`, background: B_COLOR, minWidth: 34 }}
        >
          {showPct && `${bPct}%`}
        </div>
      </div>
      <p className="mt-2 text-[12px]" style={{ color: "var(--wc-mute, #8a8378)" }}>
        {total === 0
          ? "아직 표가 없어요 — 첫 표를 던져보세요"
          : `참여 ${total.toLocaleString()}명${showPct ? "" : " · 집계 중"}`}
        {!isSignedIn && " · 투표는 로그인 후"}
        {myKey && " · 댓글을 남기면 내 진영 표시가 붙는다"}
      </p>
    </section>
  )
}

/** 3줄 요약 박스 — 본문 위에서 이슈를 10초 안에 파악시키는 장치 */
export function IssueSummary({ summary }: { summary: string[] }) {
  if (summary.length === 0) return null
  return (
    <div
      className="rounded-xl px-4 py-3.5"
      style={{ background: "var(--wc-soft, #f1ece4)", border: "1px solid var(--wc-line, #e5ded4)" }}
    >
      <p
        className="mb-1.5 text-[12px] font-extrabold tracking-[0.14em]"
        style={{ color: "var(--wc-burgundy)" }}
      >
        3줄 요약
      </p>
      <ul className="space-y-0.5">
        {summary.slice(0, 3).map((line, i) => (
          <li
            key={i}
            className="relative pl-3.5 text-[13px] leading-relaxed"
            style={{ color: "var(--wc-ink, #4a443c)", wordBreak: "keep-all" }}
          >
            <span
              className="absolute left-0 font-extrabold"
              style={{ color: "var(--wc-burgundy)" }}
              aria-hidden
            >
              ·
            </span>
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}
