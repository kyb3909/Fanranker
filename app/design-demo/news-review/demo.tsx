"use client"

import { useEffect, useMemo, useRef, useState } from "react"

/**
 * 뉴스 검수 개선 시안 — 클라이언트 시연부.
 *
 * ⚠️ **API 를 부르지 않는다.** 발행/반려는 화면 목록에서만 빠지는 시연이다.
 *    실제 반영은 판정 받은 뒤 app/admin/news-review/fast-review.tsx 에 옮긴다.
 */

export interface DemoItem {
  id: string
  title: string
  originalTitle: string | null
  body: string[]
  sourceText: string | null
  credibility: number | null
  breaking: boolean
  createdAt: string
  expiresAt: string
}

type Decision = { id: string; kind: "발행" | "반려"; title: string }

function hoursLeft(expiresAt: string, now: number): number {
  return (new Date(expiresAt).getTime() - now) / 3600_000
}

/** ① 살아 움직이는 만료 라벨 — "몇 시간 뒤 몇 분"까지. 음수면 그대로 말한다(0으로 안 뭉갬) */
function expiryLabel(expiresAt: string, now: number): string {
  const h = hoursLeft(expiresAt, now)
  if (h < 0) return "만료 지남"
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}분 남음`
  return `${Math.floor(h)}시간 ${Math.round((h % 1) * 60)}분 남음`
}

function expiryTone(expiresAt: string, now: number): React.CSSProperties {
  const h = hoursLeft(expiresAt, now)
  if (h < 3) return { background: "var(--wc-burgundy)", color: "#fff" }
  if (h < 6) return { background: "var(--wc-wine-tint)", color: "var(--wc-burgundy)" }
  return { background: "var(--wc-soft)", color: "var(--wc-mute)" }
}

export function NewsReviewDemo({ items: initial }: { items: DemoItem[] }) {
  const [items, setItems] = useState(initial)
  const [cursor, setCursor] = useState(0)
  const [done, setDone] = useState<Decision[]>([])
  const [undo, setUndo] = useState<{
    item: DemoItem
    index: number
    kind: Decision["kind"]
  } | null>(null)
  // ① 시계가 실시간으로 간다 — 종전엔 페이지 로드 시점에 고정이었다
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  /** ② 속보 최상단 고정, 그 다음 만료 임박 순 — 편집 우선순위대로 */
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.breaking !== b.breaking) return a.breaking ? -1 : 1
        return a.expiresAt.localeCompare(b.expiresAt)
      }),
    [items]
  )
  const active = sorted[Math.min(cursor, sorted.length - 1)]

  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const decide = (kind: Decision["kind"]) => {
    if (!active) return
    const index = items.findIndex((i) => i.id === active.id)
    setItems((prev) => prev.filter((i) => i.id !== active.id))
    setDone((prev) => [...prev, { id: active.id, kind, title: active.title }])
    setCursor((c) => Math.min(c, sorted.length - 2))
    // ③ R/P 는 5초 undo — 원키 사고를 확인창 없이 회수 가능하게
    setUndo({ item: active, index, kind })
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setUndo(null), 5000)
  }
  const restore = () => {
    if (!undo) return
    setItems((prev) => {
      const next = [...prev]
      next.splice(Math.min(undo.index, next.length), 0, undo.item)
      return next
    })
    setDone((prev) => prev.filter((d) => d.id !== undo.item.id))
    setUndo(null)
  }

  // ③ 키보드 — select/input 포커스 중엔 전부 무시 (기존 가드의 <select> 구멍을 막은 판)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable) return
      if (e.key === "j" || e.key === "J") setCursor((c) => Math.min(c + 1, sorted.length - 1))
      if (e.key === "k" || e.key === "K") setCursor((c) => Math.max(c - 1, 0))
      if (e.key === "p" || e.key === "P") decide("발행")
      if (e.key === "r" || e.key === "R") decide("반려")
      if (e.key === "z" || e.key === "Z") restore()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, undo])

  const breakingCount = items.filter((i) => i.breaking).length
  const urgentCount = items.filter((i) => !i.breaking && hoursLeft(i.expiresAt, now) < 6).length

  return (
    <div className="worldcup-scope min-h-[100dvh]" style={{ background: "var(--wc-paper)" }}>
      <main className="mx-auto max-w-[1100px] px-4 pt-6 pb-24 sm:px-6">
        <p
          className="text-[12px] font-extrabold"
          style={{ color: "var(--wc-burgundy)", letterSpacing: "0.16em" }}
        >
          DESIGN PILOT · 시연 — 실제 발행/반려 안 됨
        </p>

        {/* ── 헤더: 오늘의 상태가 한 줄에 ── */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-[26px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
            뉴스 검수 <span className="gn-num">{items.length}</span>건
          </h1>
          {breakingCount > 0 && (
            <span
              className="rounded-full px-3 py-1 text-[13px] font-extrabold text-white"
              style={{ background: "var(--wc-burgundy)" }}
            >
              🚨 속보 {breakingCount}건 — 맨 위에 있음
            </span>
          )}
          {urgentCount > 0 && (
            <span
              className="rounded-full px-3 py-1 text-[13px] font-bold"
              style={{ background: "var(--wc-wine-tint)", color: "var(--wc-burgundy)" }}
            >
              ⏰ 6시간 내 만료 {urgentCount}건
            </span>
          )}
          <span className="ml-auto text-[13px]" style={{ color: "var(--wc-mute)" }}>
            오늘 처리 <b className="gn-num">{done.length}</b>건 · 일반 24h / 속보 48h 자동 반려
          </span>
        </div>
        <p className="mt-1 text-[12px]" style={{ color: "var(--wc-mute-2)" }}>
          J/K 이동 · P 발행 · R 반려 · Z 되돌리기 — 셀렉트·입력창에 포커스가 있으면 무시됩니다
        </p>

        {/* ── 목록 ── */}
        <div className="mt-5 flex flex-col gap-2">
          {sorted.map((item, i) => {
            const isActive = item.id === active?.id
            return (
              <div
                key={item.id}
                className="rounded-xl transition-shadow"
                style={{
                  background: item.breaking ? "var(--wc-wine-tint)" : "var(--wc-card, #fff)",
                  boxShadow: isActive ? "0 0 0 2px var(--wc-burgundy)" : "var(--wc-shadow-1)",
                }}
                onClick={() => setCursor(i)}
              >
                {/* 행 — 판단 신호가 접기 전에 다 보인다 (④) */}
                <div className="flex items-center gap-2.5 px-4 py-3">
                  {item.breaking ? (
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[12px] font-extrabold text-white"
                      style={{ background: "var(--wc-burgundy)" }}
                    >
                      오피셜급
                    </span>
                  ) : (
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[12px] font-bold"
                      style={{ background: "var(--wc-soft)", color: "var(--wc-mute)" }}
                    >
                      일반
                    </span>
                  )}
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[12px] font-bold whitespace-nowrap"
                    style={expiryTone(item.expiresAt, now)}
                  >
                    {expiryLabel(item.expiresAt, now)}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-[14px] font-bold"
                    style={{ color: "var(--wc-ink)" }}
                  >
                    {item.title}
                  </span>
                  {/* 신뢰도는 5점 만점 (DB 실측: 2~5) — 분모 없는 맨숫자가 편집장 지적 3-①이었다.
                      4 이상은 조용히, 3 이하는 앰버로 "정독 대상" 신호를 준다 */}
                  {item.credibility != null && (
                    <span
                      className="gn-num shrink-0 rounded px-1.5 py-0.5 text-[12px] font-bold"
                      style={
                        item.credibility >= 4
                          ? { color: "var(--wc-mute)" }
                          : { background: "rgba(148,106,18,.12)", color: "#946A12" }
                      }
                    >
                      신뢰 {item.credibility}/5{item.credibility <= 3 ? " · 정독" : ""}
                    </span>
                  )}
                </div>

                {/* 활성 카드 — 원문과 초안을 나란히 (④). 펼치기 클릭이 없다 */}
                {isActive && (
                  <div className="px-4 pb-4">
                    {item.originalTitle && (
                      <p className="mb-2 text-[12px]" style={{ color: "var(--wc-mute)" }}>
                        원제 <span style={{ color: "var(--wc-ink)" }}>{item.originalTitle}</span>
                      </p>
                    )}
                    <div className="grid gap-3 md:grid-cols-2">
                      <div
                        className="max-h-[380px] overflow-y-auto rounded-lg p-3 text-[13px] leading-relaxed"
                        style={{ background: "var(--wc-soft)", color: "var(--wc-mute)" }}
                      >
                        <p
                          className="mb-1.5 text-[12px] font-extrabold"
                          style={{ color: "var(--wc-mute-2)" }}
                        >
                          원문 재료
                        </p>
                        {item.sourceText ? (
                          <p style={{ whiteSpace: "pre-wrap", wordBreak: "keep-all" }}>
                            {item.sourceText.slice(0, 2800)}
                          </p>
                        ) : (
                          <p>원문 재료 없음</p>
                        )}
                      </div>
                      <div
                        className="max-h-[380px] overflow-y-auto rounded-lg p-3 text-[14px] leading-relaxed"
                        style={{
                          background: "var(--wc-card, #fff)",
                          border: "1px solid var(--wc-line)",
                          color: "var(--wc-ink)",
                        }}
                      >
                        <p
                          className="mb-1.5 text-[12px] font-extrabold"
                          style={{ color: "var(--wc-burgundy)" }}
                        >
                          우리 초안
                        </p>
                        {item.body.length > 0 ? (
                          item.body.map((p, j) => (
                            <p key={j} className="mb-2" style={{ wordBreak: "keep-all" }}>
                              {p}
                            </p>
                          ))
                        ) : (
                          <p style={{ color: "var(--wc-mute)" }}>(본문 없음)</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => decide("발행")}
                        className="rounded-lg px-4 py-2 text-[13px] font-extrabold text-white"
                        style={{ background: "var(--wc-burgundy)" }}
                      >
                        발행 (P)
                      </button>
                      <button
                        type="button"
                        onClick={() => decide("반려")}
                        className="rounded-lg px-4 py-2 text-[13px] font-bold"
                        style={{ background: "var(--wc-soft)", color: "var(--wc-ink)" }}
                      >
                        반려 (R)
                      </button>
                      <span className="ml-auto text-[12px]" style={{ color: "var(--wc-mute-2)" }}>
                        시연 — 실제 데이터는 바뀌지 않습니다
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {sorted.length === 0 && (
            <p
              className="rounded-xl px-5 py-10 text-center text-[14px]"
              style={{ background: "var(--wc-card, #fff)", color: "var(--wc-mute)" }}
            >
              검수 대기가 없습니다 — 오늘 {done.length}건 처리했습니다 🎉
            </p>
          )}
        </div>

        {/* ③ undo 토스트 — 원키 사고 5초 회수 */}
        {undo && (
          <div
            className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full px-5 py-3 text-[14px] font-bold text-white shadow-lg"
            style={{ background: "var(--wc-ink)" }}
          >
            <span>
              {undo.kind}됨 — {undo.item.title.slice(0, 24)}…
            </span>
            <button
              type="button"
              onClick={restore}
              className="rounded-full px-3 py-1 text-[13px] font-extrabold"
              style={{ background: "var(--wc-burgundy)" }}
            >
              되돌리기 (Z)
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
