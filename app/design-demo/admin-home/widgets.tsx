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

/** 사이트 와인색 — admin 레이아웃엔 wc 토큰이 없어 상수로 (시안 전용) */
export const WINE = "#961e37"

/**
 * 위젯 껍데기 — 관제실 패널 (2026-08-30 "너무 안 예쁜데" 후속).
 * 라틴 키커 + 카운트 알약 + 얇은 그림자. 헤더에 사이트 와인색을 물려
 * admin 이 본편과 남남으로 보이던 것을 줄인다.
 */
export function Widget({
  title,
  kicker,
  count,
  tone = "default",
  children,
  className,
  headerRight,
}: {
  title: string
  /** 라틴 대문자 소제목 — 본편 밴드의 키커 문법 */
  kicker?: string
  count?: number
  tone?: "default" | "danger"
  children: React.ReactNode
  className?: string
  headerRight?: React.ReactNode
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border bg-white shadow-sm dark:bg-neutral-900",
        tone === "danger" && "border-red-200",
        className
      )}
    >
      <header className="flex items-center gap-2 border-b px-4 py-2.5">
        {kicker && (
          <span className="text-[10px] font-extrabold tracking-[0.18em]" style={{ color: WINE }}>
            {kicker}
          </span>
        )}
        <h2 className="text-sm font-bold">{title}</h2>
        {count != null && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-bold text-white tabular-nums",
              tone === "danger" ? "" : "opacity-90"
            )}
            style={{ background: tone === "danger" ? "#dc2626" : WINE }}
          >
            {count.toLocaleString()}
          </span>
        )}
        {headerRight && <span className="ml-auto">{headerRight}</span>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col p-4">{children}</div>
    </section>
  )
}

/** 미리보기 행 목록 — 신고·스쿼드·표기 후보 공용. 비어 있으면 정직한 빈 상태 문구 */
export function PreviewList({
  rows,
  empty,
  action,
}: {
  rows: { primary: string; secondary?: string; actionLabel?: string }[]
  empty: string
  action?: string
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground py-4 text-center text-xs">{empty}</p>
  }
  return (
    <ul className="divide-y">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center gap-2 py-2 text-xs">
          <span className="min-w-0 flex-1 truncate">{r.primary}</span>
          {r.secondary && (
            <span className="text-muted-foreground shrink-0 text-[11px]">{r.secondary}</span>
          )}
          {(r.actionLabel ?? action) && (
            <button className="shrink-0 rounded border px-2 py-0.5 text-[11px] font-medium hover:bg-neutral-50">
              {r.actionLabel ?? action}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * 스쿼드 검수 행 — **입력칸이 곧 편집기다** (운영자: "내가 바꾸고 싶을 때는?").
 *
 * 실제 /admin/team-squads 와 같은 문법: 초안이 입력칸에 들어 있고, 틀렸으면
 * 그 자리에서 고친 뒤 승인. Enter = 승인. 고치면 값이 초안과 달라진 것만으로
 * "수정 승인"이 된다 — 별도 수정 모드가 없다.
 * (시연 — 실제 저장 안 됨. 이식 때 confirm_team + edits API 를 그대로 문다)
 */
export function SquadReviewList({
  rows: initial,
}: {
  rows: { nameEn: string; nameKrDraft: string; teamKr: string }[]
}) {
  const [rows, setRows] = useState(initial.map((r) => ({ ...r, value: r.nameKrDraft })))
  const [done, setDone] = useState(0)

  const approve = (i: number) => {
    setRows((prev) => prev.filter((_, j) => j !== i))
    setDone((n) => n + 1)
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-center text-xs">
        미리보기 소진 — 오늘 {done}명 확정. 전체는 선수단 사전에서.
      </p>
    )
  }
  return (
    <ul className="divide-y">
      {rows.map((r, i) => {
        const edited = r.value.trim() !== r.nameKrDraft
        return (
          <li key={`${r.nameEn}-${i}`} className="flex items-center gap-2 py-1.5 text-xs">
            <span className="text-muted-foreground w-[130px] shrink-0 truncate">
              {r.teamKr} · {r.nameEn}
            </span>
            <span className="text-muted-foreground shrink-0">→</span>
            {/* 초안이 입력칸 — 틀렸으면 여기서 바로 고친다 */}
            <input
              value={r.value}
              onChange={(e) =>
                setRows((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x))
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && r.value.trim()) approve(i)
              }}
              className={cn(
                "min-w-0 flex-1 rounded border px-2 py-1",
                edited && "border-amber-400 bg-amber-50 font-semibold"
              )}
              aria-label={`${r.nameEn} 한글 표기`}
            />
            <button
              onClick={() => approve(i)}
              disabled={!r.value.trim()}
              className={cn(
                "shrink-0 rounded px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-40",
                edited ? "bg-amber-600" : "bg-emerald-600"
              )}
            >
              {edited ? "고쳐서 승인" : "승인"}
            </button>
          </li>
        )
      })}
    </ul>
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

  /** 좌우가 곧 스킵이다 (운영자: "스킵하는 건 좌우로 움직이면서 관리") — 순환 */
  const next = useCallback(
    () => setCursor((c) => (items.length === 0 ? 0 : (c + 1) % items.length)),
    [items.length]
  )
  const prev = useCallback(
    () => setCursor((c) => (items.length === 0 ? 0 : (c - 1 + items.length) % items.length)),
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
      if (e.key === "ArrowRight" || k === "s" || k === "j") next()
      if (e.key === "ArrowLeft" || k === "k") prev()
      if (k === "p" || k === "r") decideLocal()
      if (k === "e") setModal(true)
      if (e.key === "Escape") setModal(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [next, prev, decideLocal])

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
      {/* 헤더 한 줄 — 남은 개수·속보·만료 + 좌우 이동(=스킵) */}
      <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[11px]">
        <b className="text-foreground tabular-nums">
          {cursor + 1}/{items.length}
        </b>
        건 남음
        {breaking > 0 && <span className="font-bold text-red-600">🚨 오피셜급 {breaking}</span>}
        {urgent > 0 && <span className="text-red-600">⏰ 6시간 내 {urgent}</span>}
        <span className="ml-auto">오늘 처리 {done}건</span>
        <button
          onClick={prev}
          aria-label="이전 (←)"
          className="hover:bg-muted rounded border px-2 py-0.5 font-bold"
        >
          ◀
        </button>
        <button
          onClick={next}
          aria-label="다음 (→)"
          className="hover:bg-muted rounded border px-2 py-0.5 font-bold"
        >
          ▶
        </button>
      </div>

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
            스킵 (←/→)
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

/**
 * 운영 전황판 — **전 항목 항상 표시** (2026-08-30 운영자 번복).
 *
 * 처음엔 전문가 합의대로 "0건 위젯은 숨김"으로 갔는데 운영자가 뒤집었다:
 * "신고 같은 것도 있어야 하고 베트맨 상태도 나와야 하잖아. 정보가. 오류 있는지
 * 없는지. 왜 그런 메뉴들이 안 보여" — **문제가 없다는 것 자체가 정보**다.
 *
 * 절충: 사라지는 대신 **한 줄로 압축**한다. 정상 = 초록 체크 + 흐린 글씨 한 줄,
 * 이상 = 빨간 굵은 줄 + 액션 버튼. 위젯 하나가 통째로 나타났다 사라지는 것보다
 * 줄 색이 바뀌는 쪽이 "늘 지켜보고 있다"는 감각을 준다.
 */
export interface StatusRow {
  label: string
  /** 표시값 — "0건"·"정상 (32분 전)"·"381건" */
  value: string
  ok: boolean
  /** 이상일 때만 노출되는 액션 라벨 */
  action?: string
  /** ok 여도 주의 표시 (앰버) — 예: 접수 경로 미배선 */
  note?: string
  /** 이상일 때 줄 아래 펼치는 실물 목록 — "숫자만으론 뭔지 모른다" (운영자) */
  detail?: string[]
}

export function StatusBoard({ rows }: { rows: StatusRow[] }) {
  return (
    <Widget title="운영 전황" tone={rows.some((r) => !r.ok) ? "danger" : "default"}>
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.label} className="py-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span aria-hidden>{r.ok ? "✅" : "🔴"}</span>
              <span className={cn(r.ok ? "text-muted-foreground" : "font-bold text-red-700")}>
                {r.label}
              </span>
              {r.note && <span className="text-[10px] text-amber-600">{r.note}</span>}
              <span
                className={cn(
                  "ml-auto tabular-nums",
                  r.ok ? "text-muted-foreground" : "font-bold text-red-700"
                )}
              >
                {r.value}
              </span>
              {!r.ok && r.action && (
                <button className="rounded bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-white">
                  {r.action}
                </button>
              )}
            </div>
            {/* 이상 항목은 실물을 줄 밑에 펼친다 — 숫자만 던지지 않는다 */}
            {!r.ok && r.detail && r.detail.length > 0 && (
              <ul className="text-muted-foreground mt-1 space-y-0.5 pl-6 text-[11px]">
                {r.detail.map((line) => (
                  <li key={line} className="truncate">
                    · {line}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
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

/**
 * 티커 즉시 삭제 — 원본 홈의 숨은 실용 기능 회수 (2026-08-30 대조에서 발견).
 * 담벼락 티커에 이상한 게 올라오면 여기서 바로 죽인다. 시연 — 실제 삭제 안 됨.
 */
export function TickerModPanel({ items: initial }: { items: { id: string; title: string }[] }) {
  const [items, setItems] = useState(initial)
  return (
    <Widget kicker="TICKER" title="뉴스 티커 최근" count={items.length}>
      {items.length === 0 ? (
        <p className="text-muted-foreground py-3 text-center text-xs">최근 티커 없음</p>
      ) : (
        <ul className="divide-y">
          {items.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <button
                onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
                className="shrink-0 rounded border border-red-200 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50"
              >
                즉시 삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  )
}

/**
 * 참여도 패널 — 오늘 vs 어제 (운영자: "사람들 참여도, 메뉴 활용 데이터가 첫 화면에").
 * 큰 숫자 + 어제 대비 증감. 색은 숫자가 아니라 화살표에만 — 0이 많은 시기라
 * 빨간 판이 되지 않게.
 */
export function ParticipationPanel({
  rows,
}: {
  rows: { label: string; today: number; yesterday: number }[]
}) {
  return (
    <Widget kicker="PARTICIPATION" title="오늘의 참여">
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        {rows.map((r) => {
          const diff = r.today - r.yesterday
          return (
            <div key={r.label} className="rounded-lg bg-neutral-50 px-3 py-2.5 dark:bg-neutral-800">
              <p className="text-muted-foreground text-[11px]">{r.label}</p>
              <p className="text-xl font-extrabold tabular-nums">{r.today.toLocaleString()}</p>
              <p
                className={cn(
                  "text-[11px] tabular-nums",
                  diff > 0
                    ? "text-emerald-600"
                    : diff < 0
                      ? "text-red-500"
                      : "text-muted-foreground"
                )}
              >
                {diff > 0 ? `▲ ${diff}` : diff < 0 ? `▼ ${Math.abs(diff)}` : "—"} 어제{" "}
                {r.yesterday.toLocaleString()}
              </p>
            </div>
          )
        })}
      </div>
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
