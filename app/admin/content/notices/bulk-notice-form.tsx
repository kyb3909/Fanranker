"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"

const TipTapEditor = dynamic(
  () => import("@/components/editor/tiptap-editor").then((mod) => ({ default: mod.TipTapEditor })),
  { ssr: false, loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" /> }
)

interface Board {
  slug: string
  name: string
}

export function BulkNoticeForm({ boards }: { boards: Board[] }) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [content, setContent] = useState<unknown>(null)
  const [embedLoading, setEmbedLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  const allSelected = selected.size === boards.length && boards.length > 0
  const toggle = (slug: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(boards.map((b) => b.slug)))

  const submit = async () => {
    if (!title.trim() || !content || selected.size === 0) {
      toast({
        variant: "destructive",
        title: "입력 확인",
        description: "제목·내용·게시판(1개 이상)을 채워주세요.",
      })
      return
    }
    if (!confirm(`선택한 ${selected.size}개 게시판에 공지를 등록할까요?`)) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/admin/content/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, community_slugs: [...selected] }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; count?: number }
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "오류",
          description: data.error || "등록에 실패했습니다.",
        })
        return
      }
      toast({ title: "공지 등록 완료", description: `${data.count}개 게시판에 공지를 올렸어요.` })
      setTitle("")
      setContent(null)
      setSelected(new Set())
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "오류", description: "등록 중 오류가 발생했습니다." })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="notice-title">제목</Label>
        <Input
          id="notice-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="공지 제목"
          maxLength={200}
        />
      </div>

      <div className="space-y-1.5">
        <Label>내용</Label>
        <TipTapEditor
          onChange={(json) => setContent(json)}
          onEmbedLoading={setEmbedLoading}
          placeholder="공지 내용을 입력하세요. 이미지 업로드, YouTube·Instagram·X 링크 임베드 모두 가능해요."
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>
            게시판 선택 ({selected.size}/{boards.length})
          </Label>
          <button
            type="button"
            onClick={toggleAll}
            className="text-primary text-sm font-medium hover:underline"
          >
            {allSelected ? "전체 해제" : "전체 선택"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {boards.map((b) => (
            <label
              key={b.slug}
              className="border-border hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm"
            >
              <input
                type="checkbox"
                checked={selected.has(b.slug)}
                onChange={() => toggle(b.slug)}
                className="accent-primary h-4 w-4"
              />
              <span className="text-foreground">{b.name}</span>
            </label>
          ))}
        </div>
      </div>

      <Button onClick={submit} disabled={submitting || embedLoading}>
        {submitting ? "등록 중..." : embedLoading ? "임베드 로딩 중..." : "공지 등록"}
      </Button>
    </div>
  )
}
