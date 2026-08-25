"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { toast } from "@/hooks/use-toast"

/**
 * 표기 사전 후보 — 자동발행을 막은 미등재 선수명을 1클릭으로 등재한다.
 * 실측 병목 1위(게이트 반려의 48%)를 푸는 화면 (2026-08-04).
 *
 * 실측상 후보의 상당수는 신규 선수가 아니라 **기존 항목의 음차 흔들림**이라,
 * 유사 항목을 함께 보여주고 세 갈래로 처리하게 한다:
 *   · 이 표기가 틀림 → 기존 항목의 별칭으로 흡수 (앞으로 대표 표기를 쓰도록 학습)
 *   · 이 표기가 맞음 → 대표 표기로 승격 (사전이 틀린 값을 갖고 있던 경우)
 *   · 새 선수 → 신규 등재
 */

interface Candidate {
  name: string
  hits: number
  samples: string[]
  suggestions: { id: string; preferred_ko: string; score: number }[]
}

export function PlayerDictionaryCandidates() {
  const { data, mutate } = useSWR<{ candidates: Candidate[]; dictionarySize: number }>(
    "/api/admin/player-dictionary",
    fetcher
  )
  const candidates = data?.candidates ?? []
  const [busy, setBusy] = useState(false)
  const [romanized, setRomanized] = useState<Record<string, string>>({})

  const send = async (body: Record<string, unknown>, ok: string) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/player-dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; merged_into?: string }
      if (!res.ok) {
        toast({ variant: "destructive", title: "실패", description: d.error ?? "등재 실패" })
        return
      }
      toast({
        title: ok,
        description: d.merged_into ? `"${d.merged_into}" 항목에 흡수했습니다.` : undefined,
      })
      void mutate()
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="bg-background mt-3 rounded-xl border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold select-none">
        표기 사전 후보{" "}
        <span className="text-muted-foreground font-normal">
          {candidates.length}건 · 자동발행을 막은 이름
        </span>
      </summary>
      <div className="border-t p-3">
        <p className="text-muted-foreground mb-2 text-xs">
          이 이름들 때문에 기사가 자동발행되지 못했습니다. 등재하면 다음 기사부터 통과합니다. 사전{" "}
          {data?.dictionarySize ?? 0}건 등재됨.
        </p>
        <ul className="space-y-1.5">
          {candidates.length === 0 && (
            <li className="text-muted-foreground py-2 text-center text-xs">
              막힌 이름이 없습니다.
            </li>
          )}
          {candidates.map((c) => (
            <li key={c.name} className="rounded-lg border p-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-semibold">{c.name}</span>
                <span className="text-muted-foreground text-[12px]">{c.hits}회 차단</span>
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-[12px]">
                  {c.samples[0]}
                </span>
              </div>

              {c.suggestions.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {c.suggestions.map((s) => (
                    <div
                      key={s.id}
                      className="bg-muted/50 flex flex-wrap items-center gap-1.5 rounded px-2 py-1.5 text-[12px]"
                    >
                      <span className="text-muted-foreground">기존</span>
                      <span className="font-semibold">{s.preferred_ko}</span>
                      <span className="text-muted-foreground tabular-nums">
                        유사 {(s.score * 100).toFixed(0)}%
                      </span>
                      <span className="ml-auto flex gap-1.5">
                        <button
                          onClick={() =>
                            void send(
                              { mode: "alias", target_id: s.id, hangul: c.name },
                              "별칭으로 흡수"
                            )
                          }
                          disabled={busy}
                          title={`"${c.name}"을(를) "${s.preferred_ko}"의 다른 표기로 등재 — 앞으로 대표 표기를 씁니다`}
                          className="rounded border px-2 py-1 disabled:opacity-50"
                        >
                          &ldquo;{s.preferred_ko}&rdquo;가 맞음
                        </button>
                        <button
                          onClick={() =>
                            void send(
                              { mode: "promote", target_id: s.id, hangul: c.name },
                              "대표 표기 승격"
                            )
                          }
                          disabled={busy}
                          title={`사전 대표값을 "${c.name}"으로 바꾸고 "${s.preferred_ko}"를 옛 표기로 내립니다`}
                          className="rounded border px-2 py-1 disabled:opacity-50"
                        >
                          &ldquo;{c.name}&rdquo;가 맞음
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="text-muted-foreground">또는 새 선수로</span>
                <input
                  value={romanized[c.name] ?? ""}
                  onChange={(e) => setRomanized((p) => ({ ...p, [c.name]: e.target.value }))}
                  placeholder="영문/로마자 (선택)"
                  className="w-[150px] rounded border px-2 py-1"
                />
                <button
                  onClick={() =>
                    void send(
                      {
                        mode: "new",
                        preferred_ko: c.name,
                        romanized: romanized[c.name]?.trim() || undefined,
                      },
                      "새 선수 등재"
                    )
                  }
                  disabled={busy}
                  className="rounded bg-emerald-600 px-2.5 py-1 font-medium text-white disabled:opacity-50"
                >
                  등재
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
