"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { ExternalLink, ArrowRightLeft } from "lucide-react"
import { fetcher } from "@/lib/swr"
import type { TransferItem, TransferTier } from "@/lib/transfer/feed"

/** 여름 이적시장 마감 (EPL 기준, KST) — 지나면 D-day 뱃지 자동 숨김 */
const WINDOW_DEADLINE_KST = "2026-09-01T18:00:00+09:00"

const TIER_META: Record<TransferTier, { label: string; className: string }> = {
  official: { label: "오피셜", className: "bg-emerald-600 text-white" },
  tier1: { label: "유력", className: "bg-sky-600 text-white" },
  rumor: { label: "찌라시", className: "bg-zinc-400/80 text-white dark:bg-zinc-600" },
}

const FILTERS: { key: "all" | TransferTier; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "official", label: "오피셜" },
  { key: "tier1", label: "유력" },
  { key: "rumor", label: "찌라시" },
]

function kstDateLabel(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000)
  const today = new Date(Date.now() + 9 * 3600 * 1000)
  const dayKey = (x: Date) => `${x.getUTCFullYear()}-${x.getUTCMonth()}-${x.getUTCDate()}`
  if (dayKey(d) === dayKey(today)) return "오늘"
  const yesterday = new Date(today.getTime() - 24 * 3600 * 1000)
  if (dayKey(d) === dayKey(yesterday)) return "어제"
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`
}

function kstTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000)
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
}

export function TransferBoardClient({ initialItems }: { initialItems: TransferItem[] }) {
  const [filter, setFilter] = useState<"all" | TransferTier>("all")

  const { data } = useSWR<{ items: TransferItem[] }>("/api/transfer/feed", fetcher, {
    fallbackData: { items: initialItems },
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  })
  const items = data?.items ?? initialItems

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((it) => it.tier === filter)),
    [items, filter]
  )

  // 날짜별 그룹 (KST)
  const groups = useMemo(() => {
    const out: { label: string; items: TransferItem[] }[] = []
    for (const it of filtered) {
      const label = kstDateLabel(it.postedAt)
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(it)
      else out.push({ label, items: [it] })
    }
    return out
  }, [filtered])

  const daysLeft = Math.ceil((Date.parse(WINDOW_DEADLINE_KST) - Date.now()) / (24 * 3600 * 1000))

  return (
    <div className="mx-auto max-w-[720px] px-4 py-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ArrowRightLeft className="h-5 w-5" style={{ color: "var(--wc-burgundy, #961e37)" }} />
          이적시장 상황판
        </h1>
        {daysLeft > 0 && (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
            style={{ background: "var(--wc-burgundy, #961e37)" }}
          >
            여름 이적시장 마감 D-{daysLeft}
          </span>
        )}
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        해외축구 이적 오피셜·루머를 한눈에. 10분마다 자동 수집되고, 출처 신뢰도에 따라{" "}
        <b>오피셜 / 유력 / 찌라시</b>로 분류됩니다.
      </p>

      <div className="mt-4 flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className="h-8 rounded-full px-3 text-[13px] font-semibold transition-colors"
            style={
              filter === f.key
                ? { background: "var(--wc-ink, #14161a)", color: "#fff" }
                : { background: "var(--wc-paper, #f1f1f3)", color: "var(--wc-mute, #5c6470)" }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <div className="text-muted-foreground mt-10 rounded-lg border border-dashed p-10 text-center text-sm">
          해당 등급의 소식이 아직 없습니다.
        </div>
      )}

      <div className="mt-4">
        {groups.map((group) => (
          <section key={group.label}>
            <h2 className="text-muted-foreground sticky top-0 z-10 bg-[var(--wc-bg,#fafafa)] py-1.5 text-[12px] font-bold tracking-wide">
              {group.label}
            </h2>
            <ul className="divide-y" style={{ borderColor: "var(--wc-line, #e2e5ea)" }}>
              {group.items.map((it) => {
                const tier = TIER_META[it.tier]
                return (
                  <li key={it.id} className="flex items-start gap-2.5 py-2.5">
                    <span className="text-muted-foreground w-[38px] shrink-0 pt-0.5 text-[12px] tabular-nums">
                      {kstTime(it.postedAt)}
                    </span>
                    <span
                      className={`mt-0.5 inline-flex h-[18px] shrink-0 items-center rounded px-1.5 text-[10.5px] font-bold ${tier.className}`}
                    >
                      {tier.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] leading-snug font-medium">{it.headline}</p>
                      <p className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[11.5px]">
                        <span className="truncate">{it.source}</span>
                        {it.sourceUrl && (
                          <a
                            href={it.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 items-center gap-0.5 underline"
                          >
                            원문 <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
