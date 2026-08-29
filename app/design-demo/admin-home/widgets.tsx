"use client"

import { useCallback, useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { DashboardData, MiniNewsItem } from "./data"

/**
 * 대시보드 시안 공용 위젯 — **시연 전용, 아무것도 쓰지 않는다.**
 * 발행/반려/스킵은 화면 목록에서만 동작한다. 실제 이식 때 fast-review 의
 * 유예 커밋(5초 undo + keepalive)을 그대로 물린다.
 *
 * 2인 합의 규칙 (디자이너 + PM):
 *  · 0건 위젯은 렌더링 자체를 접는다 — "빈 대시보드가 곧 퇴근 신호"
 *  · 위젯당 최대 3행 — 위젯 안 무한 리스트 금지
 *  · 스쿼드 백로그(마감 없음)는 위젯 금지, 링크 한 줄만
 */

function hoursLeftOf(item: MiniNewsItem, now: number): number {
  return (new Date(item.expiresAt).getTime() - now) / 3600_000
}

function expiryLabel(item: MiniNewsItem, now: number): string {
  const h = hoursLeftOf(item, now)
  if (h < 0) return "만료 지남"
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}분 남음`
  return `${Math.floor(h)}시간 남음`
}

export function useTick(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** 위젯 껍데기 — 제목 + 카운트 + 본문. 시안이라 admin 톤(shadcn 계열)으로 */
export function Widget({
  title,
  count,
  tone = "default",
  children,
  className,
}: {
  title: string
  count?: number
  tone?: "default" | "danger"
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "bg-background flex flex-col rounded-xl border p-4",
        tone === "danger" && "border-red-300",
        className
      )}
    >
      <h2 className="mb-2 flex items-baseline gap-1.5 text-sm font-bold">
        {title}
        {count != null && (
          <span
            className={cn(
              "tabular-nums",
              tone === "danger" ? "text-red-600" : "text-muted-foreground"
            )}
          >
            {count}
          </span>
        )}
      </h2>
      {children}
    </section>
  )
}

/**
 * 뉴스 미니 덱 — 대시보드의 심장.
 * compact: 제목+신호+본문 요약, 원문 대조 없음 (B안 — 펼치면 모달)
 * full: 원문·초안 2열 인라인 (A안 — 모달 불필요)
 */
export function MiniNewsDeck({
  items: initial,
  variant,
}: {
  items: MiniNewsItem[]
  variant: "compact" | "full"
}) {
  const now = useTick()
  const [items, setItems] = useState(initial)
  const [cursor, setCursor] = useState(0)
  const [done, setDone] = useState(0)
  const [modal, setModal] = useState(false)
  const item = items[Math.min(cursor, Math.max(0, items.length - 1))]

  const next = useCallback(
    () => setCursor((c) => (items.length === 0 ? 0 : (c + 1) % items.length)),
    [items.length]
  )
  const decideLocal = useCallback(() => {
    if (!item) return
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    setCursor((c) => Math.min(c, Math.max(0, items.length - 2)))
    setDone((n) => n + 1)
    setModal(false)
  }, [item, items.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable) return
      const k = e.key.toLowerCase()
      if (e.key === "ArrowRight" || k === "s") next()
      if (k === "p" || k === "r") decideLocal()
      if (k === "e") setModal(true)
      if (e.key === "Escape") setModal(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [next, decideLocal])

  const breaking = items.filter((i) => i.breaking).length
  const urgent = items.filter((i) => hoursLeftOf(i, now) < 6).length

  if (!item) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        검수 대기 0건 — 오늘 {done}건 처리 🎉
      </p>
    )
  }

  const hl = hoursLeftOf(item, now)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 헤더 한 줄 — 남은 개수·속보·만료 */}
      <p className="text-muted-foreground mb-2 text-[11px]">
        <b className="text-foreground tabular-nums">
          {cursor + 1}/{items.length}
        </b>
        건 남음
        {breaking > 0 && (
          <span className="ml-1.5 font-bold text-red-600">🚨 오피셜급 {breaking}</span>
        )}
        {urgent > 0 && <span className="ml-1.5 text-red-600">⏰ 6시간 내 {urgent}</span>}
        <span className="float-right ml-auto">오늘 처리 {done}건</span>
      </p>

      {/* 카드 1장 */}
      <div className={cn("rounded-lg border p-3", item.breaking && "border-red-300 bg-red-50/40")}>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {item.breaking ? (
            <span className="rounded bg-red-600 px-1.5 py-0.5 font-bold text-white">오피셜급</span>
          ) : (
            <span className="text-muted-foreground rounded border px-1.5 py-0.5">일반</span>
          )}
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-medium tabular-nums",
              hl < 3
                ? "bg-red-600 text-white"
                : hl < 6
                  ? "bg-red-50 text-red-700"
                  : "text-muted-foreground"
            )}
          >
            {expiryLabel(item, now)}
          </span>
          {item.credibility != null && (
            <span
              className={cn(
                "tabular-nums",
                item.credibility <= 3
                  ? "rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800"
                  : "text-muted-foreground"
              )}
            >
              신뢰 {item.credibility}/5{item.credibility <= 3 ? " · 정독" : ""}
            </span>
          )}
          {!item.image && <span className="text-amber-600">사진 없음</span>}
        </div>

        <p className="mt-1.5 text-sm leading-snug font-semibold">{item.title}</p>

        {variant === "compact" ? (
          <p className="text-muted-foreground mt-1 line-clamp-3 text-xs leading-relaxed">
            {item.body || "(본문 없음)"}
          </p>
        ) : (
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <div className="bg-muted/50 rounded border p-2">
              <p className="text-muted-foreground mb-1 text-[10px] font-bold">원문 재료</p>
              <p className="text-muted-foreground max-h-[220px] overflow-auto text-[11px] leading-relaxed whitespace-pre-wrap">
                {item.sourceText?.slice(0, 2000) ?? "(원문 없음)"}
              </p>
            </div>
            <div className="rounded border p-2">
              <p className="mb-1 text-[10px] font-bold text-red-800">우리 초안</p>
              <p className="max-h-[220px] overflow-auto text-xs leading-relaxed">
                {item.body || "(본문 없음)"}
              </p>
            </div>
          </div>
        )}

        {/* 액션 — 발행·반려·스킵 + 펼치기. 편집·사가·VS 는 미니에서 뺐다(오조작 지대) */}
        <div className="mt-2.5 flex items-center gap-1.5">
          <button
            onClick={decideLocal}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            발행 (P)
          </button>
          <button onClick={decideLocal} className="rounded border px-3 py-1.5 text-xs">
            반려 (R)
          </button>
          <button
            onClick={next}
            className="text-muted-foreground rounded border px-3 py-1.5 text-xs"
          >
            스킵 (→)
          </button>
          <button
            onClick={() => setModal(true)}
            className="text-muted-foreground ml-auto rounded border px-2.5 py-1.5 text-[11px]"
          >
            펼치기 (E)
          </button>
        </div>
      </div>

      {/* 다음 예고 한 줄 */}
      {items.length > 1 && (
        <button
          onClick={next}
          className="text-muted-foreground hover:bg-muted/50 mt-1.5 w-full truncate rounded border border-dashed px-2 py-1 text-left text-[11px]"
        >
          다음 → {items[(cursor + 1) % items.length].breaking ? "🚨 " : ""}
          {items[(cursor + 1) % items.length].title}
        </button>
      )}

      {/* 펼치기 모달 (B안 확장) — 원문 대조 + (실제 구현에선 편집·사가·VS) */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setModal(false)}
        >
          <div
            className="bg-background max-h-[85vh] w-full max-w-[1100px] overflow-auto rounded-xl border p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <p className="text-base font-bold">{item.title}</p>
              <button
                onClick={() => setModal(false)}
                className="text-muted-foreground ml-auto rounded border px-2 py-1 text-xs"
              >
                닫기 (Esc)
              </button>
            </div>
            {item.originalTitle && (
              <p className="text-muted-foreground mt-1 text-xs">원제 {item.originalTitle}</p>
            )}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="bg-muted/50 rounded-lg border p-3">
                <p className="text-muted-foreground mb-1 text-[11px] font-bold">원문 재료</p>
                <p className="text-muted-foreground max-h-[50vh] overflow-auto text-xs leading-relaxed whitespace-pre-wrap">
                  {item.sourceText ?? "(원문 없음)"}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-1 text-[11px] font-bold text-red-800">우리 초안</p>
                <p className="max-h-[50vh] overflow-auto text-sm leading-relaxed">{item.body}</p>
              </div>
            </div>
            <p className="text-muted-foreground mt-3 text-[11px]">
              실제 구현에선 여기에 편집(TipTap)·말머리·사가 연결·VS 토글이 들어옵니다 — 미니
              위젯에서 뺀 넷 전부.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={decideLocal}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
              >
                발행
              </button>
              <button onClick={decideLocal} className="rounded border px-4 py-2 text-sm">
                반려
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** 표기 후보 위젯 — 행 단위 원클릭이라 위젯 내 완결 (PM 판정) */
export function DictWidget({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <Widget title="표기 후보" count={count}>
      <p className="text-muted-foreground text-xs leading-relaxed">
        선수 사전 미등재로 잠든 사가 슬립 {count}건 — 한글 표기 승인하면 자동으로 풀립니다.
      </p>
      <button className="mt-2 self-start rounded border px-2.5 py-1 text-[11px] font-medium">
        후보 보기
      </button>
    </Widget>
  )
}

/** 신고 위젯 — 0건이면 렌더링하지 않는다 */
export function ReportsWidget({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <Widget title="신고" count={count} tone="danger">
      <p className="text-muted-foreground text-xs">미처리 신고 {count}건</p>
    </Widget>
  )
}

/** 범용 큐 위젯 — 0건이면 렌더링하지 않는다. 인라인 1액션 + 열기 */
export function QueueWidget({
  title,
  count,
  detail,
  action,
  danger,
}: {
  title: string
  count: number
  detail: string
  action?: string
  danger?: boolean
}) {
  if (count === 0) return null
  return (
    <Widget title={title} count={count} tone={danger ? "danger" : "default"}>
      <p className="text-muted-foreground text-xs leading-relaxed">{detail}</p>
      <div className="mt-2 flex gap-1.5">
        {action && (
          <button className="rounded bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-white">
            {action}
          </button>
        )}
        <button className="rounded border px-2.5 py-1 text-[11px]">열기</button>
      </div>
    </Widget>
  )
}

/**
 * 베트맨 위젯 — 큐가 아니라 **시스템**이다. 전부 정상이면 상단 초록 줄에 접히고,
 * 하나라도 이상(동기화 지연·미정산·환불 대기)이면 위젯으로 나타나 액션을 준다.
 */
export function BetmanWidget({ betman }: { betman: DashboardData["betman"] }) {
  const hasIssue = betman.status !== "ok" || betman.unsettled > 0 || betman.refundsPending > 0
  if (!hasIssue) return null
  return (
    <Widget title="베트맨" tone="danger">
      <ul className="space-y-1.5 text-xs">
        {betman.status !== "ok" && (
          <li className="flex items-center gap-2">
            <span className="font-semibold text-red-600">
              동기화 {betman.status === "stale" ? "지연" : "장애"}
            </span>
            <span className="text-muted-foreground">
              마지막{" "}
              {betman.lastCheckedAt
                ? `${Math.round((Date.now() - new Date(betman.lastCheckedAt).getTime()) / 3600_000)}시간 전`
                : "기록 없음"}
            </span>
            <button className="ml-auto rounded bg-neutral-900 px-2 py-0.5 text-[11px] text-white">
              재동기화
            </button>
          </li>
        )}
        {betman.unsettled > 0 && (
          <li className="flex items-center gap-2">
            <span>
              미정산 경기 <b className="tabular-nums">{betman.unsettled}</b>건
            </span>
            <span className="text-muted-foreground">(settle-pending 크론 15분 안전망 있음)</span>
            <button className="ml-auto rounded border px-2 py-0.5 text-[11px]">정산 열기</button>
          </li>
        )}
        {betman.refundsPending > 0 && (
          <li className="flex items-center gap-2">
            <span>
              환불 대기 <b className="tabular-nums">{betman.refundsPending}</b>건
            </span>
            <button className="ml-auto rounded border px-2 py-0.5 text-[11px]">환불 열기</button>
          </li>
        )}
      </ul>
    </Widget>
  )
}

/** 오늘의 흐름 — KPI 강등판: 대형 카드 대신 압축 한 줄 (2인 합의) */
export function TodayStrip({ today }: { today: DashboardData["today"] }) {
  return (
    <p className="text-muted-foreground text-xs">
      오늘 가입 <b className="text-foreground tabular-nums">{today.signups}</b> · 글{" "}
      <b className="text-foreground tabular-nums">{today.posts}</b> · 예측{" "}
      <b className="text-foreground tabular-nums">{today.predictions}</b>
    </p>
  )
}
