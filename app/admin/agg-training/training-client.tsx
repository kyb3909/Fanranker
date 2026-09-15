"use client"

import { useEffect, useState } from "react"
import { useSWRConfig } from "swr"
import { Loader2, Check, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"

export interface TrainingEntry {
  id: string
  round: number
  sourceTitle: string
  category: string | null
  bodyExcerpt: string | null
  images: string[]
  persona: string
  structure: string
  angle: string | null
  aiTitle: string
  aiBody: string
}

/** 항목별 편집 상태 — AI 초안이 초기값, 고치면 "교정 저장" 활성화 */
interface Draft {
  title: string
  body: string
  rejectOpen: boolean
  rejectReason: string
}

export function TrainingClient({ items: initial }: { items: TrainingEntry[] }) {
  const { mutate } = useSWRConfig()
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

  // Refresh after generation adds new drafts without losing edits already in progress.
  useEffect(() => {
    setItems(initial)
    setDrafts((current) =>
      Object.fromEntries(
        initial.map((it) => [
          it.id,
          current[it.id] ?? {
            title: it.aiTitle,
            body: it.aiBody,
            rejectOpen: false,
            rejectReason: "",
          },
        ])
      )
    )
  }, [initial])

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))
  }

  async function act(
    id: string,
    action: "pass" | "correct" | "reject",
    payload?: { title?: string; body?: string; reason?: string }
  ) {
    if (busy) return
    setBusy(id)
    try {
      const res = await fetch("/api/admin/agg-training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, ...payload }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; status?: string }
      if (!res.ok) {
        toast({ variant: "destructive", title: "오류", description: d.error || "처리 실패" })
        return
      }
      setItems((prev) => prev.filter((it) => it.id !== id))
      void mutate("/api/admin/news-training")
      toast({
        title:
          d.status === "corrected"
            ? "교정 저장됨"
            : d.status === "rejected"
              ? "반려됨"
              : "통과 처리됨",
        description:
          d.status === "corrected"
            ? "다음 생성의 교정 예시로 참고합니다."
            : d.status === "rejected"
              ? "다음 생성의 소재 회피 기준으로 참고합니다."
              : undefined,
      })
    } catch (e) {
      toast({
        variant: "destructive",
        title: "저장 실패",
        description: e instanceof Error ? e.message : "연결 상태를 확인해 주세요.",
      })
    } finally {
      setBusy(null)
    }
  }

  if (items.length === 0) {
    return (
      <div className="text-muted-foreground mt-10 rounded-lg border border-dashed p-10 text-center text-sm">
        검수 대기 중인 연습이 없습니다. 아래에서 소재를 선택하고 ‘연습 1건 생성’을 누르세요.
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
            {/* 원본 소재 — 검수 판단 재료 */}
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-bold">
                <span className="text-muted-foreground mr-1.5 font-medium">R{it.round} · 소재</span>
                {it.sourceTitle}
              </h2>
              {it.category && (
                <span className="text-muted-foreground shrink-0 text-xs">{it.category}</span>
              )}
            </div>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>페르소나 {it.persona}</span>
              <span>구조 {it.structure}</span>
              {it.angle && <span>각도 {it.angle}</span>}
            </div>
            {it.bodyExcerpt && (
              <p className="text-muted-foreground bg-muted/50 mt-2 line-clamp-3 rounded-md p-2 text-xs whitespace-pre-line">
                {it.bodyExcerpt}
              </p>
            )}
            {it.images.length > 0 && (
              <div className="mt-2 flex gap-1.5">
                {it.images.map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={src}
                    src={src}
                    alt=""
                    loading="lazy"
                    className="h-16 w-16 rounded-md border object-cover"
                  />
                ))}
              </div>
            )}

            {/* AI 초안 = 편집 폼 초기값. 고치면 "교정 저장" 활성화 */}
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
                className="min-h-[140px] text-sm leading-relaxed"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                onClick={() => act(it.id, "pass")}
                disabled={busy !== null || changed}
                size="sm"
                title={changed ? "수정 중에는 통과 불가 — 교정 저장을 쓰세요" : undefined}
              >
                {busy === it.id ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-4 w-4" />
                )}
                통과 (그대로 좋음)
              </Button>
              <Button
                onClick={() => act(it.id, "correct", { title: draft.title, body: draft.body })}
                disabled={busy !== null || !changed || !draft.title.trim() || !draft.body.trim()}
                size="sm"
                variant="secondary"
              >
                <Save className="mr-1.5 h-4 w-4" />
                교정 저장
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
                    placeholder="반려 사유 (예: 출처 불명 사진, 정치 소재)"
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
