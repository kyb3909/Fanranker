"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { toast } from "@/hooks/use-toast"

/**
 * 인터뷰 카드 검수 (발췌 조직 최종 단계 — HITL)
 *
 * 발췌관이 원문 대조까지 마친 카드(ready)를 사람이 확인하고 시즌 사가 연대기에
 * 싣는다. 원문(en)과 번역(ko)을 나란히 보여줘 검수자가 대조 없이 판단할 수 있게.
 * 헤드라인·발언자 표기는 여기서 수정 가능 (표기 오류의 최종 방어선).
 */

interface CardRow {
  id: string
  team_id: string
  subreddit: string
  source_url: string | null
  source_title: string
  speaker: string | null
  quotes: { en: string; ko: string }[]
  headline_ko: string | null
  hold_reason: string | null
  occurred_at: string
}

interface ApiData {
  cards: CardRow[]
  counts: Record<string, number>
}

const TEAM_LABEL: Record<string, string> = {
  arsenal: "아스널",
  liverpool: "리버풀",
  chelsea: "첼시",
}

export function InterviewReviewManager() {
  const { data, mutate } = useSWR<ApiData>("/api/admin/interviews", fetcher)
  const [busy, setBusy] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})

  const act = async (id: string, action: "approve" | "reject") => {
    setBusy(id)
    try {
      const res = await fetch("/api/admin/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, headline_ko: edits[id] || undefined }),
      })
      const json = (await res.json()) as { error?: string; saga_slug?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      toast({
        title: action === "approve" ? "연대기에 실렸습니다" : "반려했습니다",
        description: json.saga_slug ? `/saga/${json.saga_slug}` : undefined,
      })
      mutate()
    } catch (e) {
      toast({
        title: "실패",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  }

  const counts = data?.counts ?? {}
  const cards = data?.cards ?? []

  return (
    <div className="space-y-6">
      <div className="text-muted-foreground flex gap-4 text-sm">
        {["pending", "ready", "published", "skipped", "rejected", "dead_letter"].map((s) => (
          <span key={s}>
            {s}: <b className="text-foreground">{counts[s] ?? 0}</b>
          </span>
        ))}
      </div>

      {cards.length === 0 && (
        <p className="text-muted-foreground py-10 text-center text-sm">
          검수 대기 카드가 없습니다 — 발췌관이 카드를 만들면 여기 쌓입니다.
        </p>
      )}

      {cards.map((card) => (
        <div key={card.id} className="border-border rounded-lg border p-4">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className="bg-muted rounded px-2 py-0.5 font-bold">
              {TEAM_LABEL[card.team_id] ?? card.team_id}
            </span>
            <span className="text-muted-foreground">
              r/{card.subreddit} · {new Date(card.occurred_at).toLocaleDateString("ko-KR")}
            </span>
            {card.source_url && (
              <a
                href={card.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground underline"
              >
                원문
              </a>
            )}
            {card.hold_reason && (
              <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                {card.hold_reason}
              </span>
            )}
          </div>

          <p className="text-muted-foreground mb-2 text-xs">{card.source_title}</p>

          <label className="mb-2 block">
            <span className="text-muted-foreground text-xs">
              헤드라인 (발언자: {card.speaker ?? "미상"})
            </span>
            <input
              className="border-border bg-background mt-1 w-full rounded border px-2 py-1 text-sm"
              defaultValue={card.headline_ko ?? ""}
              onChange={(e) => setEdits((p) => ({ ...p, [card.id]: e.target.value }))}
            />
          </label>

          <ul className="mb-3 space-y-2">
            {card.quotes.map((q, i) => (
              <li key={i} className="text-sm">
                <p className="text-foreground">“{q.ko}”</p>
                <p className="text-muted-foreground text-xs">{q.en}</p>
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <button
              onClick={() => act(card.id, "approve")}
              disabled={busy === card.id}
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
            >
              승인 → 연대기 게재
            </button>
            <button
              onClick={() => act(card.id, "reject")}
              disabled={busy === card.id}
              className="border-border text-muted-foreground rounded border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              반려
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
