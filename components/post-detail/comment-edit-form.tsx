"use client"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { X, Check } from "lucide-react"

export interface CommentEditFormProps {
  editText: string
  isSaving: boolean
  onEditTextChange: (text: string) => void
  onSave: () => void
  onCancel: () => void
}

export function CommentEditForm({
  editText,
  isSaving,
  onEditTextChange,
  onSave,
  onCancel,
}: CommentEditFormProps) {
  return (
    <div className="space-y-2">
      <Textarea
        value={editText}
        onChange={(e) => onEditTextChange(e.target.value)}
        className="min-h-[60px] resize-none text-sm"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave()
        }}
      />
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onCancel}>
          <X className="h-3 w-3 mr-1" />취소
        </Button>
        <Button size="sm" className="h-7 px-2 text-xs" onClick={onSave} disabled={!editText.trim() || isSaving}>
          <Check className="h-3 w-3 mr-1" />{isSaving ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  )
}
