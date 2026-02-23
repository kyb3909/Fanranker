"use client"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export interface CommentReplyFormProps {
  replyText: string
  isSubmitting: boolean
  onReplyTextChange: (text: string) => void
  onSubmit: () => void
  onCancel: () => void
}

export function CommentReplyForm({
  replyText,
  isSubmitting,
  onReplyTextChange,
  onSubmit,
  onCancel,
}: CommentReplyFormProps) {
  return (
    <div className="mt-3 space-y-2">
      <Textarea
        placeholder="답글을 입력하세요..."
        className="min-h-[80px] resize-none"
        value={replyText}
        onChange={(e) => onReplyTextChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit()
        }}
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>취소</Button>
        <Button size="sm" onClick={onSubmit} disabled={!replyText.trim() || isSubmitting}>
          {isSubmitting ? '작성 중...' : '답글 작성'}
        </Button>
      </div>
    </div>
  )
}
