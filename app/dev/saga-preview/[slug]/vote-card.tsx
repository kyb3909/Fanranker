"use client"

import { useEffect, useState } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"

/**
 * 여론 투표 카드 — 코덱스 목업(design-references/saga-transfer-mockup-2026-08-04) 스타일.
 * 로직은 components/saga/main-vote.tsx 그대로, 표현만 교체:
 * 섹션 제목 + 큰 % 타이포 + 아웃라인 투표 버튼. 프리뷰 검증용 (analytics 미발화).
 */

const GO = "var(--wc-burgundy, #8B1E3F)"
const STAY = "#2B4C7E"

interface Props {
  slug: string
  closed: boolean
  initial: { go: number; stay: number; total: number }
}

export function VoteCard({ slug, closed, initial }: Props) {
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const [agg, setAgg] = useState(initial)
  const [myChoice, setMyChoice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const goPct = agg.total === 0 ? 50 : Math.round((agg.go / agg.total) * 100)

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
      const d = (await res.json()) as { go: number; stay: number; total: number; myChoice: string }
      setAgg({ go: d.go, stay: d.stay, total: d.total })
      setMyChoice(d.myChoice)
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
      className="mt-4 rounded-2xl px-5 py-5 sm:px-6"
      style={{ background: "var(--wc-card, #fff)", boxShadow: "var(--wc-shadow-1)" }}
      aria-label="여론 투표"
    >
      <h2 className="text-[16px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
        팬들은 어떻게 보고 있나
      </h2>

      {agg.total === 0 ? (
        <p className="mt-3 text-[13.5px] font-bold" style={{ color: "var(--wc-mute)" }}>
          아직 투표가 없습니다 — 첫 표를 던져보세요.
        </p>
      ) : (
        <>
          {/* 큰 타이포 % — 이 카드의 존재 이유 */}
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-[24px] font-extrabold sm:text-[28px]" style={{ color: GO }}>
              나간다 {goPct}%
            </span>
            <span className="text-[24px] font-extrabold sm:text-[28px]" style={{ color: STAY }}>
              남는다 {100 - goPct}%
            </span>
          </div>
          <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            <span
              className="rounded-l-full transition-all duration-300"
              style={{ width: `${goPct}%`, background: GO }}
            />
            <span
              className="flex-1 rounded-r-full transition-all duration-300"
              style={{ background: STAY }}
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
          {btn("go", "나간다", GO)}
          {btn("stay", "남는다", STAY)}
        </div>
      )}
    </section>
  )
}
