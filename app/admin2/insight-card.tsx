"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

/**
 * 인사이트 카드 — GA4 + 내부 지표를 LLM 이 읽고 "주목할 것 / 할 일"을 낸 결과.
 *
 * 숫자를 또 보여주지 않는다. 숫자는 위 파이프라인·큐 카드가 이미 보여준다.
 * 여기는 **판단**만 담는다 — 그게 없어서 GA4 리포트를 아무도 안 열었다.
 */

interface InsightItem {
  title: string
  detail: string
}
interface ActionItem {
  title: string
  why: string
  effort: "작음" | "보통" | "큼"
}
interface InsightBody {
  headline: string
  watch: InsightItem[]
  actions: ActionItem[]
  noise: string[]
}
interface InsightRow {
  id: string | null
  period_start?: string
  period_end?: string
  insight: InsightBody
  model: string
  created_at: string
}

const EFFORT_STYLE: Record<ActionItem["effort"], string> = {
  작음: "bg-emerald-100 text-emerald-700",
  보통: "bg-amber-100 text-amber-700",
  큼: "bg-red-100 text-red-700",
}

export function InsightCard() {
  const { data, mutate, isLoading } = useSWR<{ insight: InsightRow | null }>(
    "/api/admin2/insight",
    fetcher,
    { revalidateOnFocus: false }
  )
  const [generating, setGenerating] = useState(false)

  const row = data?.insight
  const body = row?.insight

  async function generate() {
    if (generating) return
    setGenerating(true)
    try {
      const res = await fetch("/api/admin2/insight", { method: "POST" })
      const d = (await res.json().catch(() => ({}))) as {
        error?: string
        warning?: string
        insight?: InsightRow
      }
      if (!res.ok) {
        toast({ variant: "destructive", title: "실패", description: d.error ?? "생성 실패" })
        return
      }
      await mutate({ insight: d.insight ?? null }, { revalidate: false })
      toast({ title: "인사이트 생성 완료", description: d.warning })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <section className="bg-background rounded-xl border p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          이번 주 인사이트
          <span className="text-muted-foreground ml-1.5 text-[11px] font-normal">
            GA4 + 내부 지표
          </span>
        </h2>
        <button
          onClick={generate}
          disabled={generating}
          className="text-muted-foreground hover:bg-muted shrink-0 rounded border px-2 py-1 text-[11px] disabled:opacity-50"
        >
          {generating ? "분석 중… (최대 1분)" : row ? "다시 분석" : "분석하기"}
        </button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">불러오는 중…</p>
      ) : !body ? (
        <p className="text-muted-foreground text-sm">
          아직 분석 결과가 없습니다. <b>분석하기</b>를 누르면 최근 3주 GA4 지표와 내부 활동
          (가입·글·댓글·예측·발행)을 함께 읽고 이번 주에 주목할 것과 할 일을 정리합니다.
        </p>
      ) : (
        <div className="space-y-3.5">
          <p className="text-sm leading-relaxed font-medium">{body.headline}</p>

          {body.watch.length > 0 && (
            <div>
              <h3 className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-wide uppercase">
                주목할 것
              </h3>
              <ul className="space-y-1.5">
                {body.watch.map((w, i) => (
                  <li key={i} className="border-l-2 border-amber-300 pl-2.5">
                    <p className="text-sm font-medium">{w.title}</p>
                    <p className="text-muted-foreground text-xs leading-relaxed">{w.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {body.actions.length > 0 && (
            <div>
              <h3 className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-wide uppercase">
                할 일
              </h3>
              <ul className="space-y-1.5">
                {body.actions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                        EFFORT_STYLE[a.effort]
                      )}
                    >
                      {a.effort}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-muted-foreground text-xs leading-relaxed">{a.why}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {body.noise.length > 0 && (
            <div className="bg-muted/50 rounded-lg px-2.5 py-2">
              <h3 className="text-muted-foreground mb-1 text-[11px] font-semibold">
                신경 안 써도 되는 것
              </h3>
              <ul className="text-muted-foreground space-y-0.5 text-[11px]">
                {body.noise.map((n, i) => (
                  <li key={i}>· {n}</li>
                ))}
              </ul>
            </div>
          )}

          {row && (
            <p className="text-muted-foreground text-[10px]">
              {row.period_start &&
                row.period_end &&
                `${row.period_start}~${row.period_end} 기준 · `}
              {new Date(row.created_at).toLocaleString("ko-KR", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              생성 · {row.model}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
