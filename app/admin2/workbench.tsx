"use client"

import Link from "next/link"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { cn } from "@/lib/utils"

/**
 * 작업대 — 운영자가 하루에 여는 단 하나의 화면.
 * 위에서 아래로 "돌고 있나 → 내가 할 일 → 돈이 새나" 순서. 이 순서는 사용자가
 * 지정한 우선순위(크롤링 이상 / 신고·문의 / AI 콘텐츠 동작)를 그대로 따른다.
 */

type Status = "ok" | "warn" | "down"

interface Pipeline {
  key: string
  label: string
  status: Status
  lastAt: string | null
  detail: string
  hint?: string
}
interface QueueItem {
  key: string
  label: string
  count: number
  href: string
  severity: "high" | "normal"
  note?: string
}
interface MoneyItem {
  key: string
  label: string
  count: number
  detail: string
}
interface Dashboard {
  generatedAt: string
  overall: Status
  pipelines: Pipeline[]
  queues: QueueItem[]
  money: MoneyItem[]
  today: { publishedArticles: number; newDrafts: number }
}

const STATUS_STYLE: Record<Status, { dot: string; text: string; label: string }> = {
  ok: { dot: "bg-emerald-500", text: "text-emerald-700", label: "정상" },
  warn: { dot: "bg-amber-500", text: "text-amber-700", label: "지연" },
  down: { dot: "bg-red-500", text: "text-red-700", label: "중단" },
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("bg-background rounded-xl border p-4 shadow-sm", className)}>
      {children}
    </section>
  )
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-sm font-semibold">{children}</h2>
      {right}
    </div>
  )
}

export function Workbench() {
  // 30초 폴링 — 사이드바가 60초마다 같은 API 를 3곳에서 때리던 구조를 하나로 합쳤다
  const { data, error, isLoading } = useSWR<Dashboard>("/api/admin2/dashboard", fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  })

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <p className="text-sm text-red-700">대시보드를 불러오지 못했습니다.</p>
      </Card>
    )
  }
  if (isLoading || !data) {
    return <Card className="text-muted-foreground animate-pulse text-sm">불러오는 중…</Card>
  }

  const problems = data.pipelines.filter((p) => p.status !== "ok")
  const actionable = data.queues.filter((q) => q.count > 0)
  const allClear = problems.length === 0 && actionable.length === 0 && data.money.length === 0

  return (
    <div className="space-y-4">
      {/* ── 한 줄 요약: 오늘 들어와야 하나? ───────────────────────────── */}
      {allClear ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <p className="text-sm font-medium text-emerald-800">
            오늘 처리할 일이 없습니다. 파이프라인 4종 모두 정상입니다.
          </p>
        </Card>
      ) : (
        <Card
          className={cn(
            problems.some((p) => p.status === "down") || data.money.length > 0
              ? "border-red-200 bg-red-50"
              : "border-amber-200 bg-amber-50"
          )}
        >
          <p className="text-sm font-medium">
            {problems.length > 0 && (
              <span className="text-red-800">
                파이프라인 {problems.length}건 이상
                {actionable.length > 0 && " · "}
              </span>
            )}
            {actionable.length > 0 && (
              <span className="text-amber-900">
                처리 대기 {actionable.reduce((s, q) => s + q.count, 0)}건
              </span>
            )}
          </p>
        </Card>
      )}

      {/* ── 1. 파이프라인이 돌고 있나 ─────────────────────────────────── */}
      <Card>
        <SectionTitle
          right={
            <span className="text-muted-foreground text-[11px]">
              {new Date(data.generatedAt).toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              기준 · 30초마다 갱신
            </span>
          }
        >
          자동으로 도는 것
        </SectionTitle>
        <ul className="divide-y">
          {data.pipelines.map((p) => {
            const s = STATUS_STYLE[p.status]
            return (
              <li key={p.key} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", s.dot)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{p.label}</span>
                    <span className={cn("text-[11px] font-medium", s.text)}>{s.label}</span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs">{p.detail}</p>
                  {p.status !== "ok" && p.hint && (
                    <p className="bg-muted text-muted-foreground mt-1 rounded px-2 py-1 text-[11px]">
                      {p.hint}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </Card>

      {/* ── 2. 내가 처리할 것 ─────────────────────────────────────────── */}
      <Card>
        <SectionTitle>내가 처리할 것</SectionTitle>
        {actionable.length === 0 ? (
          <p className="text-muted-foreground text-sm">비어 있습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {actionable
              .sort((a, b) =>
                a.severity === b.severity ? b.count - a.count : a.severity === "high" ? -1 : 1
              )
              .map((q) => (
                <li key={q.key}>
                  <Link
                    href={q.href}
                    className={cn(
                      "hover:bg-muted/60 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition",
                      q.severity === "high" && "border-red-200 bg-red-50/50"
                    )}
                  >
                    <span
                      className={cn(
                        "min-w-[2.5rem] rounded-md px-2 py-0.5 text-center text-sm font-bold tabular-nums",
                        q.severity === "high"
                          ? "bg-red-600 text-white"
                          : "bg-foreground/85 text-background"
                      )}
                    >
                      {q.count}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{q.label}</span>
                      {q.note && (
                        <span className="text-muted-foreground block text-[11px]">{q.note}</span>
                      )}
                    </span>
                    <span className="text-muted-foreground text-xs">처리 →</span>
                  </Link>
                </li>
              ))}
          </ul>
        )}
        {/* 0건인 큐는 접어서 한 줄로 — 없는 일을 화면에서 지운다 */}
        {data.queues.some((q) => q.count === 0) && (
          <p className="text-muted-foreground mt-3 text-[11px]">
            비어 있음:{" "}
            {data.queues
              .filter((q) => q.count === 0)
              .map((q) => q.label)
              .join(" · ")}
          </p>
        )}
      </Card>

      {/* ── 3. 돈이 새고 있나 ─────────────────────────────────────────── */}
      {data.money.length > 0 && (
        <Card className="border-red-300 bg-red-50">
          <SectionTitle>돈 정합성 경고</SectionTitle>
          <ul className="space-y-2">
            {data.money.map((m) => (
              <li key={m.key} className="text-sm">
                <span className="font-semibold text-red-800">
                  {m.label} {m.count}건
                </span>
                <p className="text-xs text-red-700/80">{m.detail}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── 오늘의 산출 ───────────────────────────────────────────────── */}
      <Card className="bg-muted/40">
        <p className="text-muted-foreground text-xs">
          24시간: 기사 발행{" "}
          <strong className="text-foreground tabular-nums">{data.today.publishedArticles}</strong>건
          · 신규 초안 유입{" "}
          <strong className="text-foreground tabular-nums">{data.today.newDrafts}</strong>건
        </p>
      </Card>

      <nav className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 px-1 pt-1 text-xs">
        <span className="text-foreground/70 font-medium">가끔 여는 곳:</span>
        <Link href="/admin/users" className="hover:underline">
          사용자
        </Link>
        <Link href="/admin/settlements" className="hover:underline">
          정산
        </Link>
        <Link href="/admin/matches" className="hover:underline">
          경기
        </Link>
        <Link href="/admin/content/posts" className="hover:underline">
          게시글
        </Link>
        <Link href="/admin/content/polls" className="hover:underline">
          설문
        </Link>
        <Link href="/admin/system" className="hover:underline">
          시스템
        </Link>
        <Link href="/admin/stats" className="hover:underline">
          통계
        </Link>
      </nav>
    </div>
  )
}
