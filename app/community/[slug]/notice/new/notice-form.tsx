"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"

export function NoticeForm({ slug }: { slug: string }) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!title.trim() || !body.trim()) {
      toast({
        variant: "destructive",
        title: "입력 확인",
        description: "제목과 내용을 입력해주세요.",
      })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/community/${slug}/notice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "오류",
          description: d.error || "등록에 실패했습니다.",
        })
        setSubmitting(false)
        return
      }
      toast({ title: "공지 등록 완료", description: "게시판 상단에 고정됐어요." })
      router.push(`/community/${slug}`)
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "오류", description: "등록 중 오류가 발생했습니다." })
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="notice-title">제목</Label>
        <Input
          id="notice-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="공지 제목"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notice-body">내용</Label>
        <textarea
          id="notice-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          maxLength={5000}
          placeholder="공지 내용 (줄바꿈 가능)"
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
      </div>
      <Button onClick={submit} disabled={submitting}>
        {submitting ? "등록 중..." : "공지 등록"}
      </Button>
    </div>
  )
}
