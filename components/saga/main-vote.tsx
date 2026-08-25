"use client"

import { useEffect, useState } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { trackEvent } from "@/lib/analytics/events"

/**
 * 사가 메인 투표 카드 — "나간다 vs 남는다" 1탭 참전 (PRD §4.2).
 *
 * 2026-08-04 리디자인 (design-references/saga-transfer-mockup-2026-08-04 목업 승인):
 * 독립 카드 + "팬들은 어떻게 보고 있나" 헤딩 + 큰 % 타이포 + 진영 컬러 아웃라인 버튼.
 * 0명일 때는 50:50 가짜 게이지 대신 첫 투표 유도 문구.
 *
 * 비로그인은 clerk.openSignIn() (vs-issue-widget 패턴 — 에러 모달 dead-end 금지).
 * 재투표(스탠스 변경) 허용 — 서버가 append-only 원장에 기록하므로 여론 시계열이 남고,
 * 댓글의 스탠스 스냅샷(D10)은 작성 시점 값이라 소환의 무결성은 깨지지 않는다.
 */

const GO_COLOR = "var(--wc-burgundy, #961E37)"
const STAY_COLOR = "#2B4C7E"

interface Props {
  slug: string
  closed: boolean
  initial: { go: number; stay: number; total: number }
  /** SSR 은 내 스탠스를 모른다(서비스롤 집계) — 마운트 후 GET 으로 하이드레이션 */
  labels?: { go: string; stay: string }
}

export function SagaMainVote({ slug, closed, initial, labels }: Props) {
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const [agg, setAgg] = useState(initial)
  const [myChoice, setMyChoice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const goLabel = labels?.go ?? "나간다"
  const stayLabel = labels?.stay ?? "남는다"
  const goPct = agg.total === 0 ? 50 : Math.round((agg.go / agg.total) * 100)

  // 내 스탠스 하이드레이션 — 로그인 유저만 (SSR 집계는 서비스롤이라 내 표를 모른다)
  useEffect(() => {
    if (!isSignedIn) return
    let alive = true
    fetch(`/api/saga/${slug}/vote`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) {
          setAgg({ go: d.go, stay: d.stay, total: d.total })
          setMyChoice(d.myChoice)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [isSignedIn, slug])

  const vote = async (choice: "go" | "stay") => {
    if (closed || busy) return
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/saga/${slug}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice }),
      })
      if (!res.ok) return
      const d = (await res.json()) as {
        go: number
        stay: number
        total: number
        myChoice: string
      }
      setAgg({ go: d.go, stay: d.stay, total: d.total })
      setMyChoice(d.myChoice)
      trackEvent({ name: "saga_vote", params: { saga_slug: slug, choice } })
    } finally {
      setBusy(false)
    }
  }

  const btn = (choice: "go" | "stay", label: string, color: string) => {
    const mine = myChoice === choice
    return (
      <button
        type="button"
        onClick={() => vote(choice)}
        disabled={closed || busy}
        aria-pressed={mine}
        className="flex-1 rounded-lg border-[1.5px] py-2.5 text-[14px] font-extrabold transition-colors disabled:opacity-50"
        style={{
          borderColor: color,
          background: mine ? `color-mix(in srgb, ${color} 8%, transparent)` : "transparent",
          color,
        }}
      >
        {label}
        {mine && " ✓"}
      </button>
    )
  }

  return (
    <section
      className="rounded-2xl px-5 py-5 sm:px-6"
      style={{ background: "var(--wc-card, #fff)", boxShadow: "var(--wc-shadow-1)" }}
      aria-label="여론 투표"
    >
      <h2 className="text-[16px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
        팬들은 어떻게 보고 있나
      </h2>

      {agg.total === 0 ? (
        <p className="mt-3 text-[13px] font-bold" style={{ color: "var(--wc-mute)" }}>
          아직 투표가 없습니다 — 첫 표를 던져보세요.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-[26px] font-extrabold sm:text-[26px]" style={{ color: GO_COLOR }}>
              {goLabel} {goPct}%
            </span>
            <span
              className="text-[26px] font-extrabold sm:text-[26px]"
              style={{ color: STAY_COLOR }}
            >
              {stayLabel} {100 - goPct}%
            </span>
          </div>
          <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            <span
              className="rounded-l-full transition-all duration-300"
              style={{ width: `${goPct}%`, background: GO_COLOR }}
            />
            <span
              className="flex-1 rounded-r-full transition-all duration-300"
              style={{ background: STAY_COLOR }}
            />
          </div>
          <p className="mt-2 text-center text-[12px]" style={{ color: "var(--wc-mute)" }}>
            {agg.total.toLocaleString()}명 참여
          </p>
        </>
      )}

      {closed ? (
        <p className="mt-3 text-[12px] font-bold" style={{ color: "var(--wc-mute)" }}>
          종결된 사가 — 투표가 마감됐습니다.
        </p>
      ) : (
        <div className="mt-3 flex gap-3">
          {btn("go", goLabel, GO_COLOR)}
          {btn("stay", stayLabel, STAY_COLOR)}
        </div>
      )}
    </section>
  )
}
