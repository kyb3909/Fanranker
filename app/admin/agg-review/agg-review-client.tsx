"use client"

import { useState } from "react"
import { Loader2, Check, X, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"

export interface AggReviewItem {
  id: string
  source: string
  sourceUrl: string
  sourceTitle: string
  category: string | null
  persona: string
  aiTitle: string
  aiBody: string
  images: string[]
  createdAt: string
}

interface Draft {
  title: string
  body: string
  rejectOpen: boolean
  rejectReason: string
}

const SOURCE_LABEL: Record<string, string> = {
  theqoo: "더쿠",
  instiz: "인스티즈",
  instiz_enter: "인스티즈 연예",
  fmkorea: "펨코",
  dcinside: "DC",
  reddit: "Reddit",
}

export function AggReviewClient({ items: initial }: { items: AggReviewItem[] }) {
  const [items, setItems] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      initial.map((it) => [
        it.id,
        { title: it.aiTitle, body: it.aiBody, rejectOpen: false, rejectReason: "" },
      ])
    )
  )

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))
  }

  async function act(
    id: string,
    action: "publish" | "reject",
    payload?: { title?: string; body?: string; reason?: string }
  ) {
    if (busy) return
    setBusy(id)
    try {
      const res = await fetch("/api/admin/agg-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, ...payload }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; edited?: boolean }
      if (!res.ok) {
        toast({ variant: "destructive", title: "오류", description: d.error || "처리 실패" })
        return
      }
      setItems((prev) => prev.filter((it) => it.id !== id))
      toast({
        title: action === "publish" ? "발행 완료" : "반려 완료",
        description:
          action === "publish"
            ? d.edited
              ? "페르소나 이름으로 게시됐고, 교정이 학습 큐에 적재됐습니다."
              : "페르소나 이름으로 게시됐습니다."
            : "반려 사유가 학습 큐에 적재됐습니다.",
      })
    } finally {
      setBusy(null)
    }
  }

  if (items.length === 0) {
    return (
      <div className="text-muted-foreground mt-10 rounded-lg border border-dashed p-10 text-center text-sm">
        검수할 초안이 없습니다. (크롤링 사이클이 돌면 여기 쌓입니다)
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-5">
      {items.map((it) => {
        const draft = drafts[it.id]
        const changed =
          draft.title.trim() !== it.aiTitle.trim() || draft.body.trim() !== it.aiBody.trim()
        return (
          <div key={it.id} className="bg-card rounded-xl border p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-bold">
                <span className="bg-muted text-muted-foreground mr-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold">
                  {SOURCE_LABEL[it.source] ?? it.source}
                </span>
                <span className="text-muted-foreground mr-1.5 font-medium">소재</span>
                {it.sourceTitle}
              </h2>
              <span className="text-muted-foreground shrink-0 text-xs">
                {new Date(it.createdAt).toLocaleString("ko-KR")}
              </span>
            </div>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>
                작성자 <b>{it.persona}</b>
              </span>
              {it.category && <span>{it.category}</span>}
              <a
                href={it.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                원문(내부용) <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            {it.images.length > 0 && (
              <div className="mt-2 flex gap-1.5">
                {it.images.map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={src}
                    src={src}
                    alt=""
                    loading="lazy"
                    className="h-20 w-20 rounded-md border object-cover"
                  />
                ))}
              </div>
            )}

            <div className="mt-3 space-y-2">
              <Input
                value={draft.title}
                onChange={(e) => setDraft(it.id, { title: e.target.value })}
                placeholder="제목"
                className="font-semibold"
              />
              <Textarea
                value={draft.body}
                onChange={(e) => setDraft(it.id, { body: e.target.value })}
                placeholder="본문 (문단은 빈 줄로 구분)"
                className="min-h-[120px] text-sm leading-relaxed"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                onClick={() =>
                  act(it.id, "publish", changed ? { title: draft.title, body: draft.body } : {})
                }
                disabled={busy !== null || !draft.title.trim() || !draft.body.trim()}
                size="sm"
              >
                {busy === it.id ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-4 w-4" />
                )}
                {changed ? "수정 발행 (교정 학습됨)" : "발행"}
              </Button>
              <Button
                onClick={() => setDraft(it.id, { rejectOpen: !draft.rejectOpen })}
                disabled={busy !== null}
                size="sm"
                variant="outline"
              >
                <X className="mr-1.5 h-4 w-4" />
                반려
              </Button>
              {draft.rejectOpen && (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Input
                    value={draft.rejectReason}
                    onChange={(e) => setDraft(it.id, { rejectReason: e.target.value })}
                    placeholder="반려 사유 (소재 회피 신호로 학습됨)"
                    className="h-8 text-xs"
                  />
                  <Button
                    onClick={() => act(it.id, "reject", { reason: draft.rejectReason })}
                    disabled={busy !== null}
                    size="sm"
                    variant="destructive"
                  >
                    확정
                  </Button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
