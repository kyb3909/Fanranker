"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  OUTCOME_LABEL,
  SEVERITY_LABEL,
  WORK_STATE_LABEL,
  actionableItems,
  isWaiting,
  sortOutcomes,
  standDown,
  summarizeDomains,
  summarizeObservations,
  waitingItems,
  type ObservationState,
  type WorkItem,
} from "@/lib/admin/control-center"
import type { ControlCenterResponse } from "./types"

/**
 * 관제 센터 — 관리자 첫 화면 (2026-09-08).
 *
 * 위에서 아래로 운영자가 실제로 묻는 순서다:
 *   ① 지금 보이는 숫자를 믿어도 되나 (관측 상태)
 *   ② 내가 지금 해야 할 일은 무엇인가 (우선순위 큐 + 근거)
 *   ③ 전체 영역은 어떤가 (업무별 현황)
 *   ④ 시스템이 맡고 있는 건 무엇인가 (기다리는 일)
 *   ⑤ 내가 한 조치가 실제로 적용됐나 (최근 결과)
 *
 * 판정은 전부 `lib/admin/control-center` 순수 모듈이 한다 — 화면에서 다시 계산하면
 * "화면은 빨간불인데 API 는 정상"이 생긴다.
 */

/** 화면이 이 시간보다 오래된 데이터를 들고 있으면 오래됐다고 말한다 */
const STALE_AFTER_MS = 5 * 60_000

const OBSERVATION_TEXT: Record<ObservationState, { label: string; tone: string }> = {
  ok: { label: "확인됨", tone: "text-emerald-700 dark:text-emerald-400" },
  failed: { label: "확인 불가", tone: "text-red-700 dark:text-red-400" },
  unwired: { label: "미연결", tone: "text-amber-700 dark:text-amber-400" },
  stale: { label: "오래됨", tone: "text-amber-700 dark:text-amber-400" },
}

const PIPELINE_TEXT: Record<string, { label: string; tone: string }> = {
  ok: { label: "정상", tone: "text-emerald-700 dark:text-emerald-400" },
  warn: { label: "지연", tone: "text-amber-700 dark:text-amber-400" },
  down: { label: "중단", tone: "text-red-700 dark:text-red-400" },
}

function Section({
  title,
  right,
  children,
  className,
}: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("bg-background rounded-xl border p-4 shadow-sm", className)}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function timeAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return "기록 없음"
  const ms = now - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return "기록 없음"
  const min = Math.round(ms / 60_000)
  if (min < 1) return "방금"
  if (min < 60) return `${min}분 전`
  const hours = ms / 3_600_000
  if (hours < 24) return `${hours.toFixed(1)}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

function clock(iso: string | null | undefined): string {
  if (!iso) return "-"
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function ControlCenter() {
  const { data, error, isLoading, mutate, isValidating } = useSWR<ControlCenterResponse>(
    "/api/admin/control-center",
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true, keepPreviousData: true }
  )
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const listRef = useRef<HTMLUListElement>(null)

  // 1분마다 시계만 다시 그린다 — 경과 시간과 기한 초과 판정이 멈춰 있으면 안 된다
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const view = useMemo(() => {
    if (!data) return null
    const observations = data.observations
    const items = data.items
    const summary = summarizeObservations(observations)
    return {
      summary,
      actionable: actionableItems(items, now),
      waiting: waitingItems(items, now),
      domains: summarizeDomains(items, now),
      close: standDown(observations, items, now),
      outcomes: sortOutcomes(data.outcomes),
    }
  }, [data, now])

  const selected = useMemo(
    () => view?.actionable.find((i) => i.key === selectedKey) ?? view?.actionable[0] ?? null,
    [view, selectedKey]
  )

  /**
   * 목록 안에서만 도는 방향키. window 전역에 걸지 않는다 —
   * 전역 단축키는 다른 영역을 보다가 실행되는 사고를 만든다.
   * 한글 조합 중(isComposing)과 입력칸에서는 아무 것도 하지 않는다.
   */
  const onListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLUListElement>) => {
      if (e.nativeEvent.isComposing) return
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
      const list = view?.actionable ?? []
      if (list.length === 0) return
      e.preventDefault()
      const current = list.findIndex((i) => i.key === (selected?.key ?? ""))
      const next = e.key === "ArrowDown" ? current + 1 : current - 1
      const clamped = Math.max(0, Math.min(next, list.length - 1))
      setSelectedKey(list[clamped].key)
    },
    [view, selected]
  )

  if (isLoading && !data) {
    return (
      <div className="text-muted-foreground p-6 text-sm" role="status">
        관제 센터를 불러오는 중…
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="p-6">
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40"
        >
          <p className="text-sm font-bold text-red-800 dark:text-red-300">
            관제 센터를 불러오지 못했습니다.
          </p>
          <p className="mt-1 text-xs text-red-700 dark:text-red-400">
            이 화면은 지금 아무것도 관측하지 못한 상태입니다. 업무가 0건이라는 뜻이 아닙니다.
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => mutate()}>
            다시 시도
          </Button>
        </div>
      </div>
    )
  }

  if (!data || !view) return null

  const dataAge = now - new Date(data.generatedAt).getTime()
  const isStale = dataAge > STALE_AFTER_MS
  const { summary, close } = view

  return (
    <main id="main-content" tabIndex={-1} className="w-full px-4 py-5 sm:px-6 2xl:px-8">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-xl font-extrabold tracking-tight">관제 센터</h1>
        <p className="text-muted-foreground text-xs">
          {clock(data.generatedAt)} 기준
          {isStale && (
            <span className="ml-1 font-bold text-amber-700 dark:text-amber-400">
              · 오래된 정보입니다 ({timeAgo(data.generatedAt, now)})
            </span>
          )}
          {error && (
            <span className="ml-1 font-bold text-red-700 dark:text-red-400">
              · 갱신 실패 — 마지막 정상 화면을 그대로 두었습니다
            </span>
          )}
        </p>
        <div className="ml-auto">
          <Button size="sm" variant="outline" onClick={() => mutate()} disabled={isValidating}>
            {isValidating ? "갱신 중…" : "새로고침"}
          </Button>
        </div>
      </div>

      {/* ── ① 전체 서비스 상태 ─────────────────────────────────────────── */}
      <ObservationBar
        summary={summary}
        close={close}
        observations={data.observations}
        pipelines={data.pipelines}
        now={now}
      />

      {/* ── ② 지금 처리해야 할 일 ──────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Section
          title="지금 처리해야 할 일"
          right={
            <span className="text-muted-foreground text-[11px]">
              긴급도 · 기한 · 최장 대기 순 (건수는 마지막 기준)
            </span>
          }
        >
          {view.actionable.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              확인한 범위에서 지금 직접 처리할 일이 없습니다.
              {summary.failed + summary.unwired + summary.stale > 0 && (
                <>
                  {" "}
                  <b className="text-amber-700 dark:text-amber-400">
                    다만 {summary.unobservedLabels.slice(0, 3).join(", ")}
                    {summary.unobservedLabels.length > 3 ? " 외" : ""}는 확인하지 못했습니다.
                  </b>
                </>
              )}
            </p>
          ) : (
            <ul
              ref={listRef}
              className="space-y-1.5 focus:outline-none"
              tabIndex={0}
              onKeyDown={onListKeyDown}
              aria-label="처리할 일 목록 (위아래 방향키로 이동)"
            >
              {view.actionable.map((item) => (
                <ActionRow
                  key={item.key}
                  item={item}
                  now={now}
                  selected={selected?.key === item.key}
                  onSelect={() => setSelectedKey(item.key)}
                />
              ))}
            </ul>
          )}
        </Section>

        <DetailPanel item={selected} now={now} />
      </div>

      {/* ── ③ 업무별 현황 ─────────────────────────────────────────────── */}
      <Section title="업무별 현황" className="mt-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {view.domains.map((d) => (
            <DomainCard key={d.domain} summary={d} now={now} />
          ))}
        </div>
      </Section>

      {/* ── ④ 진행·대기 중인 일 ───────────────────────────────────────── */}
      <Section
        title="기다리는 일"
        className="mt-4"
        right={
          <span className="text-muted-foreground text-[11px]">
            기한이 지나면 위 &quot;지금 처리해야 할 일&quot;로 되돌아옵니다
          </span>
        }
      >
        {view.waiting.length === 0 ? (
          <p className="text-muted-foreground text-sm">기다리는 일이 없습니다.</p>
        ) : (
          <ul className="divide-y" aria-label="기다리는 일 목록">
            {view.waiting.map((w) => (
              <li key={w.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                <span className="text-sm font-medium">{w.label}</span>
                <span className="text-sm font-bold tabular-nums">{w.count}</span>
                <span className="text-muted-foreground text-xs">
                  {WORK_STATE_LABEL[w.state]}
                  {w.owner ? ` · 담당 ${w.owner}` : " · 담당 없음"}
                </span>
                <span className="text-muted-foreground ml-auto text-xs">
                  다음 확인 {w.nextCheckAt ? clock(w.nextCheckAt) : "예정 없음"}
                  {w.dueAt && ` · 기한 ${clock(w.dueAt)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── ⑤ 최근 처리 결과 ──────────────────────────────────────────── */}
      {data.role === "admin" && (
        <Section
          title="최근 처리 결과"
          className="mt-4"
          right={
            <span className="text-muted-foreground text-[11px]">
              요청한 사실과 실제 적용된 사실을 나눠 표시합니다
            </span>
          }
        >
          {view.outcomes.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              최근 48시간 안에 기록된 조치가 없습니다.
            </p>
          ) : (
            <ul className="divide-y" aria-label="최근 처리 결과 목록">
              {view.outcomes.map((o) => (
                <li key={o.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-bold",
                      o.state === "applied" && "bg-emerald-100 text-emerald-800",
                      o.state === "partial" && "bg-amber-100 text-amber-900",
                      o.state === "failed" && "bg-red-100 text-red-800",
                      (o.state === "verifying" || o.state === "requested") &&
                        "bg-muted text-foreground/80"
                    )}
                  >
                    {OUTCOME_LABEL[o.state]}
                  </span>
                  <span className="text-sm font-medium">{o.action}</span>
                  <span className="text-muted-foreground min-w-0 flex-1 text-xs">{o.evidence}</span>
                  <span className="text-muted-foreground text-xs">{clock(o.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </main>
  )
}

/* ─────────────────────────── ① 관측 상태 ─────────────────────────── */

function ObservationBar({
  summary,
  close,
  observations,
  pipelines,
  now,
}: {
  summary: ReturnType<typeof summarizeObservations>
  close: ReturnType<typeof standDown>
  observations: ControlCenterResponse["observations"]
  pipelines: ControlCenterResponse["pipelines"]
  now: number
}) {
  const [open, setOpen] = useState(false)
  const brokenPipelines = pipelines.filter((p) => p.status !== "ok")

  const tone =
    summary.state === "ok" && brokenPipelines.length === 0
      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
      : summary.state === "down" || brokenPipelines.some((p) => p.status === "down")
        ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
        : "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"

  return (
    <section className={cn("rounded-xl border p-4", tone)} aria-label="전체 서비스 상태">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm font-bold">{close.headline}</p>
        {!close.canClose && close.blockers.length > 0 && (
          <p className="text-xs">닫기 전 확인: {close.blockers.join(" · ")}</p>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto text-xs font-medium underline underline-offset-2"
          aria-expanded={open}
        >
          {open ? "관측 범위 접기" : "관측 범위 펼치기"}
        </button>
      </div>

      {/* 접혀 있어도 무엇을 확인했고 무엇을 못 봤는지는 한 줄로 남는다 */}
      <p className="mt-1 text-xs">
        업무 {summary.ok}/{summary.total}곳 확인
        {summary.failed > 0 && ` · 확인 불가 ${summary.failed}`}
        {summary.unwired > 0 && ` · 미연결 ${summary.unwired}`}
        {summary.stale > 0 && ` · 오래됨 ${summary.stale}`}
        {" · 자동 수집 "}
        {pipelines.length - brokenPipelines.length}/{pipelines.length}곳 정상
        {summary.lastOkAt && ` · 마지막 성공 확인 ${timeAgo(summary.lastOkAt, now)}`}
      </p>

      {brokenPipelines.length > 0 && (
        <ul className="mt-2 space-y-1">
          {brokenPipelines.map((p) => (
            <li key={p.key} className="text-xs">
              <span className={cn("font-bold", PIPELINE_TEXT[p.status]?.tone)}>
                {p.label} {PIPELINE_TEXT[p.status]?.label}
              </span>
              <span className="text-muted-foreground"> · {p.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
          {observations.map((o) => (
            <div key={o.key} className="flex items-baseline gap-2 text-xs">
              <span className={cn("font-medium", OBSERVATION_TEXT[o.state].tone)}>
                {OBSERVATION_TEXT[o.state].label}
              </span>
              <span className="font-medium">{o.label}</span>
              <span className="text-muted-foreground min-w-0 flex-1 truncate">
                {o.state === "ok"
                  ? `확인 ${timeAgo(o.observedAt, now)}`
                  : (o.note ??
                    (o.lastOkAt ? `마지막 성공 ${timeAgo(o.lastOkAt, now)}` : "확인 기록 없음"))}
              </span>
            </div>
          ))}
          {pipelines.map((p) => (
            <div key={p.key} className="flex items-baseline gap-2 text-xs">
              <span className={cn("font-medium", PIPELINE_TEXT[p.status]?.tone)}>
                {PIPELINE_TEXT[p.status]?.label}
              </span>
              <span className="font-medium">{p.label}</span>
              <span className="text-muted-foreground min-w-0 flex-1 truncate">{p.detail}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/* ─────────────────────────── ② 할 일 행 ─────────────────────────── */

function ActionRow({
  item,
  now,
  selected,
  onSelect,
}: {
  item: WorkItem
  now: number
  selected: boolean
  onSelect: () => void
}) {
  const overdue = !!item.dueAt && new Date(item.dueAt).getTime() < now
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "hover:bg-muted/60 flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2.5 text-left transition",
          selected && "ring-foreground/30 bg-muted/40 ring-2",
          item.severity === "critical" && "border-red-300 dark:border-red-900"
        )}
      >
        <span
          className={cn(
            "min-w-[2.5rem] rounded-md px-2 py-0.5 text-center text-sm font-bold tabular-nums",
            item.severity === "critical"
              ? "bg-red-600 text-white"
              : item.severity === "high"
                ? "bg-amber-500 text-white"
                : "bg-foreground/85 text-background"
          )}
        >
          {item.count}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-bold">{item.label}</span>
            {/* 색만으로 구분하지 않는다 — 긴급도를 글자로도 적는다 */}
            <span className="text-muted-foreground text-[11px]">
              {SEVERITY_LABEL[item.severity]}
            </span>
            {overdue && (
              <span className="text-[11px] font-bold text-red-700 dark:text-red-400">
                기한 초과
              </span>
            )}
            {!item.actionWired && (
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                처리 화면 없음
              </span>
            )}
          </span>
          <span className="text-muted-foreground block text-xs">{item.impact}</span>
        </span>
        <span className="text-muted-foreground shrink-0 text-right text-[11px]">
          <span className="block">
            {item.oldestAt ? `최장 대기 ${timeAgo(item.oldestAt, now)}` : "대기 시각 미상"}
          </span>
          <span className="block">{item.dueAt ? `기한 ${clock(item.dueAt)}` : "기한 없음"}</span>
        </span>
      </button>
    </li>
  )
}

/* ─────────────────────────── ② 상세 ─────────────────────────── */

function DetailPanel({ item, now }: { item: WorkItem | null; now: number }) {
  if (!item) {
    return (
      <Section title="선택한 업무">
        <p className="text-muted-foreground text-sm">
          왼쪽에서 업무를 고르면 근거와 다음 행동이 여기 나옵니다.
        </p>
      </Section>
    )
  }
  const overdue = !!item.dueAt && new Date(item.dueAt).getTime() < now
  return (
    <Section title="선택한 업무">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-bold">{item.label}</p>
          <p className="text-muted-foreground text-xs">{item.domain}</p>
        </div>

        <dl className="space-y-1.5 text-xs">
          <div className="flex gap-2">
            <dt className="text-muted-foreground w-20 shrink-0">영향</dt>
            <dd className="min-w-0 flex-1">{item.impact}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground w-20 shrink-0">미해결</dt>
            <dd className="min-w-0 flex-1 tabular-nums">{item.count}건</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground w-20 shrink-0">최장 대기</dt>
            <dd className="min-w-0 flex-1">
              {item.oldestAt ? `${timeAgo(item.oldestAt, now)} (${clock(item.oldestAt)})` : "미상"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground w-20 shrink-0">기한</dt>
            <dd className={cn("min-w-0 flex-1", overdue && "font-bold text-red-700")}>
              {item.dueAt ? `${clock(item.dueAt)}${overdue ? " · 초과" : ""}` : "정해진 기한 없음"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground w-20 shrink-0">담당·상태</dt>
            <dd className="min-w-0 flex-1">
              {item.owner ?? "미배정"} · {WORK_STATE_LABEL[item.state]}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground w-20 shrink-0">관측</dt>
            <dd className={cn("min-w-0 flex-1", OBSERVATION_TEXT[item.observation].tone)}>
              {OBSERVATION_TEXT[item.observation].label}
            </dd>
          </div>
        </dl>

        {item.note && (
          <p className="bg-muted text-muted-foreground rounded px-2 py-1.5 text-[11px] leading-relaxed">
            {item.note}
          </p>
        )}

        <div>
          <p className="text-muted-foreground mb-1 text-[11px]">다음 행동</p>
          <p className="text-sm font-medium">{item.nextAction}</p>
        </div>

        {item.href && item.actionWired ? (
          <Button asChild size="sm" className="w-full">
            {/* 필터·정렬을 URL 로 넘긴다 — 돌아왔을 때 같은 화면이 복원된다 */}
            <Link href={item.href}>처리 화면 열기</Link>
          </Button>
        ) : (
          <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            이 업무를 처리하는 화면이 아직 없습니다. 숫자만 보여드리고 있으며, 처리하려면 다른
            경로가 필요합니다.
          </p>
        )}
      </div>
    </Section>
  )
}

/* ─────────────────────────── ③ 업무별 현황 ─────────────────────────── */

function DomainCard({
  summary,
  now,
}: {
  summary: ReturnType<typeof summarizeDomains>[number]
  now: number
}) {
  // 정상 0건만 접는다. 확인 불가가 섞이면 접지 않는다 — 그게 "0건처럼 보이는" 원인이다
  const [open, setOpen] = useState(!summary.collapsible)

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        summary.degraded && "border-amber-300 dark:border-amber-900",
        summary.topSeverity === "critical" && "border-red-300 dark:border-red-900"
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold">{summary.domain}</h3>
        <span className="text-sm font-bold tabular-nums">{summary.open}</span>
      </div>
      <p className="text-muted-foreground mt-0.5 text-[11px]">
        {summary.degraded ? (
          <span className="font-bold text-amber-700 dark:text-amber-400">
            일부 확인 불가 — 이 숫자가 전부가 아닙니다
          </span>
        ) : summary.open === 0 ? (
          "확인 완료 · 미해결 없음"
        ) : (
          `가장 오래된 건 ${timeAgo(summary.oldestAt, now)}`
        )}
      </p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-muted-foreground mt-2 text-[11px] underline underline-offset-2"
        aria-expanded={open}
      >
        {open ? "접기" : `세부 ${summary.items.length}항목 펼치기`}
      </button>

      {open && (
        <ul className="mt-2 space-y-1">
          {summary.items.map((i) => (
            <li key={i.key} className="flex items-baseline gap-2 text-[11px]">
              <span
                className={cn(
                  "shrink-0 font-medium",
                  i.observation === "ok"
                    ? "text-muted-foreground"
                    : OBSERVATION_TEXT[i.observation].tone
                )}
              >
                {i.observation === "ok" ? i.count : OBSERVATION_TEXT[i.observation].label}
              </span>
              {i.href && i.actionWired ? (
                <Link href={i.href} className="min-w-0 flex-1 truncate hover:underline">
                  {i.label}
                </Link>
              ) : (
                <span className="min-w-0 flex-1 truncate">{i.label}</span>
              )}
              {isWaiting(i.state) && (
                <span className="text-muted-foreground shrink-0">
                  {WORK_STATE_LABEL[i.state].replace(" 중", "")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
