"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { X, Check, Sparkles } from "lucide-react"
import { StickerPicker } from "@/components/sticker/sticker-picker"

export interface EditSticker {
  id: string
  name: string
  image_url: string
}

export interface CommentEditFormProps {
  editText: string
  isSaving: boolean
  currentSticker?: EditSticker | null
  onEditTextChange: (text: string) => void
  onSave: (sticker?: EditSticker | null) => void
  onCancel: () => void
}

export function CommentEditForm({
  editText,
  isSaving,
  currentSticker,
  onEditTextChange,
  onSave,
  onCancel,
}: CommentEditFormProps) {
  const [selectedSticker, setSelectedSticker] = useState<EditSticker | null>(currentSticker ?? null)
  const [showPicker, setShowPicker] = useState(false)

  const canSave = editText.trim() || selectedSticker

  return (
    <div className="space-y-2">
      <Textarea
        value={editText}
        onChange={(e) => onEditTextChange(e.target.value)}
        className="min-h-[60px] resize-none text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSave) {
            onSave(selectedSticker)
          }
        }}
      />
      {/* 선택된 스티커 미리보기 */}
      {selectedSticker && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
          <img
            src={selectedSticker.image_url}
            alt={selectedSticker.name}
            className="h-8 w-8 object-contain"
          />
          <span className="text-foreground text-xs font-medium">{selectedSticker.name}</span>
          <button
            onClick={() => setSelectedSticker(null)}
            className="text-muted-foreground hover:text-foreground ml-auto text-xs"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="relative">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-all ${
              showPicker
                ? "bg-amber-500/10 text-amber-600"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Sparkles className="h-3 w-3" />
            스티커
          </button>
          {showPicker && (
            <StickerPicker
              onSelect={(sticker) => {
                setSelectedSticker(sticker)
                setShowPicker(false)
              }}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onCancel}>
            <X className="mr-1 h-3 w-3" />
            취소
          </Button>
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onSave(selectedSticker)}
            disabled={!canSave || isSaving}
          >
            <Check className="mr-1 h-3 w-3" />
            {isSaving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>
    </div>
  )
}
