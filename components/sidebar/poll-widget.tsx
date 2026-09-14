"use client"

import { useState, useEffect, memo } from "react"
import { BarChart3 } from "lucide-react"
import useSWR from "swr"
import { useAuth } from "@clerk/nextjs"
import { fetcher } from "@/lib/swr"

interface PollOption {
  key: string
  label: string
}
interface PollEntry {
  poll: { id: string; question: string; options: PollOption[]; allowReason: boolean }
  results: Record<string, number>
  total: number
  myVote: { optionKey: string; reason: string | null } | null
}

/**
 * 메인 사이드바 설문(폴) 위젯 — "최근 댓글 달린 게시물" 바로 아래.
 * 원탭 투표 → 즉시 결과 → 선택적 "왜?" 한 줄(글쓰기 온램프).
 * 활성 폴이 없으면 아무것도 렌더하지 않음.
 *
 * 2026-07-30 복수 폴 로테이션 — /api/polls/active 가 { polls: [...] } 배열(최대 3)
 * 을 주고, 위젯은 **페이지 로드마다 랜덤으로 1개만** 보여준다 (운영자 지시:
 * 나란히 다 보여주지 말고 번갈아가며 — 매 방문이 새 설문일 수 있어 재방문 재미).
 * 클라이언트 fetch 후 선택이라 SSR 하이드레이션 불일치 없음.
 */
export const PollWidget = memo(function PollWidget() {
  const [pollId, setPollId] = useState<string | null>(null)
  const { userId, isLoaded } = useAuth()
  const { data, mutate } = useSWR<{ polls: PollEntry[] }>(
    isLoaded ? ["/api/polls/active", userId ?? "guest"] : null,
    ([url]: [string, string]) => fetcher(url),
    { revalidateOnFocus: false }
  )

  useEffect(() => {
    const polls = data?.polls ?? []
    setPollId((previous) =>
      polls.some((entry) => entry.poll.id === previous)
        ? previous
        : (polls[Math.floor(Math.random() * polls.length)]?.poll.id ?? null)
    )
  }, [data])
  const entry = data?.polls.find((item) => item.poll.id === pollId)
  function onVoted(updated: PollEntry) {
    void mutate(
      (current) =>
        current
          ? {
              polls: current.polls.map((item) =>
                item.poll.id === updated.poll.id ? updated : item
              ),
            }
          : current,
      false
    )
  }

  if (!data || !entry) return null

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
          className="text-[12px] font-bold uppercase"
          style={{ color: "var(--wc-ink)", letterSpacing: "0.18em" }}
        >
          오늘의 설문
        </h3>
      </div>

      <PollCard key={(userId ?? "guest") + entry.poll.id} initial={entry} onVoted={onVoted} />
    </div>
  )
})

PollWidget.displayName = "PollWidget"

/** 폴 1개 — 투표/결과/한마디 상태를 독립적으로 가진다 */
function PollCard({
  initial,
  onVoted,
}: {
  initial: PollEntry
  onVoted: (updated: PollEntry) => void
}) {
  const [data, setData] = useState<PollEntry>(initial)
  const [submitting, setSubmitting] = useState(false)
  const [needLogin, setNeedLogin] = useState(false)
  const [reason, setReason] = useState("")
  const [reasonSaved, setReasonSaved] = useState(!!initial.myVote?.reason)

  useEffect(() => {
    setData(initial)
    setReasonSaved(!!initial.myVote?.reason)
  }, [initial])

  const { poll, results, total, myVote } = data
  const voted = !!myVote

  async function vote(optionKey: string, withReason?: string) {
    if (submitting) return
    setSubmitting(true)
    setNeedLogin(false)
    try {
      const res = await fetch(`/api/polls/${poll.id}/vote`, {
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
      const updated = { ...data, results: d.results, total: d.total, myVote: d.myVote }
      setData(updated)
      onVoted(updated)
      if (withReason && withReason.length > 0) setReasonSaved(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="px-4 py-3.5">
      <p className="mb-3 text-[14px] leading-snug font-semibold" style={{ color: "var(--wc-ink)" }}>
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
          <p className="pt-0.5 text-[12px]" style={{ color: "var(--wc-mute)" }}>
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
            <p className="pt-0.5 text-[12px]" style={{ color: "var(--wc-mute)" }}>
              의견 고마워요 👍
            </p>
          )}
        </div>
      )}
    </div>
  )
}
