"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth, useClerk } from "@clerk/nextjs"
import Link from "@/components/ui/app-link"
import { trackEvent } from "@/lib/analytics/events"

/**
 * 한마디 — 인라인 퀵 글쓰기 (2026-08-21 운영자: "글쓰기 버튼이 너무 무거워질 것 같아.
 * 디씨처럼 너무 가벼우면 안 되지만 간단한 의견을 서로 나누면서 쓰게").
 *
 * 종전 글쓰기 동선은 /write 이동 → 제목 → 에디터 → 게시판 선택 — "한마디 얹고 싶은"
 * 사람에겐 4단 계단이었다. 여기서는 그 자리에서 한두 줄 쓰고 등록하면 일반 글로
 * 담벼락에 올라간다 (새 콘텐츠 타입이 아니다 — posts 그대로, 제목은 첫 줄 자동).
 *
 * 가벼움의 하한: 5자 미만 거절 + 기존 서버 가드(정지 유저·rate limit) 그대로.
 * 무거운 길은 없애지 않는다 — "길게 쓰기 →"가 /write 로 간다.
 * 비로그인은 일단 쓰게 두고 등록에서 로그인 모달 (A7 문법 — 쓰던 글 보존 실측).
 */

const BOARDS = [
  { slug: "football", name: "축구" },
  { slug: "free-board", name: "자유" },
] as const

export function QuickComposer() {
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const router = useRouter()
  const [text, setText] = useState("")
  const [board, setBoard] = useState<string>("football")
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const submit = async () => {
    if (busy) return
    const body = text.trim()
    if (body.length < 5) {
      setNote("다섯 글자는 넘겨 주세요")
      return
    }
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    setBusy(true)
    setNote(null)
    try {
      const lines = body
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
      const title = lines[0].length > 60 ? `${lines[0].slice(0, 60)}…` : lines[0]
      const content = {
        type: "doc",
        content: lines.map((l) => ({
          type: "paragraph",
          content: [{ type: "text", text: l }],
        })),
      }
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ community_slug: board, title, content }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(d.error || "등록에 실패했어요")
      trackEvent({ name: "quick_post_submit", params: { community: board } })
      setText("")
      setExpanded(false)
      setNote("담벼락에 올라갔어요")
      router.refresh()
    } catch (e) {
      setNote(e instanceof Error ? e.message : "등록에 실패했어요")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
    >
      <textarea
        value={text}
        onFocus={() => setExpanded(true)}
        onChange={(e) => {
          setText(e.target.value)
          if (note) setNote(null)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit()
        }}
        rows={expanded ? 3 : 1}
        maxLength={2000}
        placeholder="오늘 공놀이 얘기, 한 줄이면 충분해요"
        className="w-full resize-none text-[14px] outline-none"
        style={{
          background: "transparent",
          color: "var(--wc-ink)",
          lineHeight: 1.55,
        }}
      />
      {expanded && (
        <div className="mt-2 flex items-center gap-2">
          {/* 게시판 — 축구 기본, 잡담은 자유로. 두 개면 충분하다 (고르게 하는 순간 무거워진다) */}
          <div className="flex gap-1">
            {BOARDS.map((b) => {
              const on = board === b.slug
              return (
                <button
                  key={b.slug}
                  type="button"
                  onClick={() => setBoard(b.slug)}
                  aria-pressed={on}
                  className="rounded-full px-2.5 py-1 text-[12px] font-bold transition-colors"
                  style={{
                    background: on ? "var(--wc-wine-tint)" : "transparent",
                    border: `1px solid ${on ? "var(--wc-burgundy)" : "var(--wc-line)"}`,
                    color: on ? "var(--wc-burgundy)" : "var(--wc-mute)",
                  }}
                >
                  {b.name}
                </button>
              )
            })}
          </div>
          <Link
            href="/write"
            className="ml-auto shrink-0 text-[12px] font-bold no-underline"
            style={{ color: "var(--wc-mute)" }}
          >
            길게 쓰기 →
          </Link>
          <button
            type="button"
            onClick={submit}
            disabled={busy || text.trim().length === 0}
            className="shrink-0 rounded-lg px-3.5 py-1.5 text-[13px] font-bold transition-opacity disabled:opacity-50"
            style={{ background: "var(--wc-burgundy)", color: "#fff" }}
          >
            {busy ? "올리는 중…" : "올리기"}
          </button>
        </div>
      )}
      {expanded && !isSignedIn && !note && (
        <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
          올릴 때 로그인 창이 떠도 쓰던 글은 그대로 남아 있어요.
        </p>
      )}
      {note && (
        <p
          className="mt-1.5 text-[12px] font-bold"
          style={{
            color: note === "담벼락에 올라갔어요" ? "var(--wc-go, #2f7d5b)" : "var(--wc-burgundy)",
          }}
        >
          {note}
        </p>
      )}
    </div>
  )
}
