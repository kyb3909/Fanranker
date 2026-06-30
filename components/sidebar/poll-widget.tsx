"use client"

import { useState, useEffect, memo } from "react"
import { BarChart3 } from "lucide-react"

interface PollOption {
  key: string
  label: string
}
interface PollData {
  poll: { id: string; question: string; options: PollOption[]; allowReason: boolean } | null
  results: Record<string, number>
  total: number
  myVote: { optionKey: string; reason: string | null } | null
}

/**
 * 메인 사이드바 설문(폴) 위젯 — "최근 댓글 달린 게시물" 바로 아래.
 * 원탭 투표 → 즉시 결과 → 선택적 "왜?" 한 줄(글쓰기 온램프).
 * 활성 폴이 없으면 아무것도 렌더하지 않음.
 */
export const PollWidget = memo(function PollWidget() {
  const [data, setData] = useState<PollData | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [needLogin, setNeedLogin] = useState(false)
  const [reason, setReason] = useState("")
  const [reasonSaved, setReasonSaved] = useState(false)

  useEffect(() => {
    let alive = true
    fetch("/api/polls/active")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PollData | null) => {
        if (alive && d) {
          setData(d)
          if (d.myVote?.reason) setReasonSaved(true)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [])

  if (!loaded || !data?.poll) return null
  const { poll, results, total, myVote } = data
  const voted = !!myVote

  async function vote(optionKey: string, withReason?: string) {
    if (submitting || !data?.poll) return
    setSubmitting(true)
    setNeedLogin(false)
    try {
      const res = await fetch(`/api/polls/${data.poll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionKey, reason: withReason }),
      })
      if (res.status === 401) {
        setNeedLogin(true)
        return
      }
      if (!res.ok) return
      const d = await res.json()
      setData((prev) =>
        prev ? { ...prev, results: d.results, total: d.total, myVote: d.myVote } : prev
      )
      if (withReason && withReason.length > 0) setReasonSaved(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ background: "var(--wc-card)", borderBottom: "1px solid var(--wc-line)" }}
      >
        <BarChart3 className="h-3.5 w-3.5" style={{ color: "var(--wc-burgundy)" }} />
        <h3
          className="text-[11px] font-bold uppercase"
          style={{ color: "var(--wc-ink)", letterSpacing: "0.18em" }}
        >
          오늘의 설문
        </h3>
      </div>

      <div className="px-4 py-3.5">
        <p
          className="mb-3 text-[14px] leading-snug font-semibold"
          style={{ color: "var(--wc-ink)" }}
        >
          {poll.question}
        </p>

        {!voted ? (
          <div className="space-y-2">
            {poll.options.map((o) => (
              <button
                key={o.key}
                type="button"
                disabled={submitting}
                onClick={() => vote(o.key, reason)}
                className="block w-full rounded-md px-3 py-2 text-left text-[13px] font-medium transition-colors disabled:opacity-60"
                style={{ border: "1px solid var(--wc-line)", color: "var(--wc-ink)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--wc-soft)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent"
                }}
              >
                {o.label}
              </button>
            ))}
            {needLogin && (
              <p className="pt-1 text-[12px]" style={{ color: "var(--wc-mute)" }}>
                로그인 후 투표할 수 있어요.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {poll.options.map((o) => {
              const count = results[o.key] ?? 0
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              const mine = myVote?.optionKey === o.key
              return (
                <div
                  key={o.key}
                  className="relative overflow-hidden rounded-md"
                  style={{ border: "1px solid var(--wc-line)" }}
                >
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${pct}%`,
                      background: mine ? "rgba(150,30,55,0.14)" : "var(--wc-soft)",
                    }}
                  />
                  <div className="relative flex items-center justify-between px-3 py-2 text-[13px]">
                    <span style={{ color: "var(--wc-ink)", fontWeight: mine ? 700 : 500 }}>
                      {o.label}
                      {mine ? " ✓" : ""}
                    </span>
                    <span className="tabular-nums" style={{ color: "var(--wc-mute)" }}>
                      {pct}%
                    </span>
                  </div>
                </div>
              )
            })}
            <p className="pt-0.5 text-[11px]" style={{ color: "var(--wc-mute)" }}>
              {total}명 참여
            </p>

            {poll.allowReason && !reasonSaved && (
              <div className="pt-1">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={280}
                  placeholder="왜 그렇게 생각해요? (선택)"
                  className="w-full rounded-md px-3 py-2 text-[13px] outline-none"
                  style={{
                    border: "1px solid var(--wc-line)",
                    color: "var(--wc-ink)",
                    background: "var(--wc-card)",
                  }}
                />
                <button
                  type="button"
                  disabled={submitting || reason.trim().length === 0}
                  onClick={() => myVote && vote(myVote.optionKey, reason.trim())}
                  className="mt-1.5 w-full rounded-md px-3 py-1.5 text-[12px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: "var(--wc-burgundy, #961e37)" }}
                >
                  한마디 남기기
                </button>
              </div>
            )}
            {reasonSaved && (
              <p className="pt-0.5 text-[11px]" style={{ color: "var(--wc-mute)" }}>
                의견 고마워요 👍
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

PollWidget.displayName = "PollWidget"
