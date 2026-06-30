"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface PollRow {
  id: string
  question: string
  is_active: boolean
  options: { label: string }[]
}

export function PollList({ polls }: { polls: PollRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function toggle(id: string, next: boolean) {
    setBusy(id)
    try {
      await fetch(`/api/admin/polls/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      })
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    if (!window.confirm("이 설문을 삭제할까요? 투표 기록도 함께 삭제됩니다.")) return
    setBusy(id)
    try {
      await fetch(`/api/admin/polls/${id}`, { method: "DELETE" })
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  if (polls.length === 0) {
    return <p className="text-muted-foreground text-sm">아직 설문이 없습니다.</p>
  }

  return (
    <div className="space-y-2">
      {polls.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {p.is_active && (
                <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-bold text-green-700">
                  활성
                </span>
              )}
              <span className="truncate font-medium">{p.question}</span>
            </div>
            <p className="text-muted-foreground mt-1 truncate text-xs">
              {(p.options ?? []).map((o) => o.label).join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={busy === p.id}
              onClick={() => toggle(p.id, !p.is_active)}
              className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {p.is_active ? "내리기" : "노출"}
            </button>
            <button
              type="button"
              disabled={busy === p.id}
              onClick={() => remove(p.id)}
              className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 disabled:opacity-50"
            >
              삭제
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
