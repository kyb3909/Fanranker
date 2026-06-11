"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Sparkles } from "lucide-react"
import { StickerPicker } from "@/components/sticker/sticker-picker"

interface SelectedSticker {
  id: string
  name: string
  image_url: string
}

interface CommentReplyFormProps {
  replyText: string
  isSubmitting: boolean
  onReplyTextChange: (text: string) => void
  onSubmit: (sticker?: SelectedSticker | null) => void
  onCancel: () => void
}

export function CommentReplyForm({
  replyText,
  isSubmitting,
  onReplyTextChange,
  onSubmit,
  onCancel,
}: CommentReplyFormProps) {
  const [selectedSticker, setSelectedSticker] = useState<SelectedSticker | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  const canSubmit = replyText.trim() || selectedSticker

  return (
    <div className="mt-3 space-y-2">
      <Textarea
        placeholder="답글을 입력하세요..."
        className="min-h-[80px] resize-none"
        style={{
          padding: "10px 13px",
          fontSize: 13,
          lineHeight: 1.55,
          border: "1px solid var(--wc-line-2)",
          borderRadius: 9,
          background: "var(--wc-paper)",
          color: "var(--wc-ink)",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--wc-burgundy)"
          e.currentTarget.style.background = "var(--wc-card)"
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--wc-line-2)"
          e.currentTarget.style.background = "var(--wc-paper)"
        }}
        value={replyText}
        onChange={(e) => onReplyTextChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
            onSubmit(selectedSticker)
          }
        }}
      />
      {/* 선택된 스티커 미리보기 */}
      {selectedSticker && (
        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-2"
          style={{ borderColor: "var(--wc-line-2)", background: "var(--wc-soft)" }}
        >
          <Image
            src={selectedSticker.image_url}
            alt={selectedSticker.name}
            width={40}
            height={40}
            className="h-10 w-10 object-contain"
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
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
              showPicker
                ? "bg-[var(--wc-soft)] text-[var(--wc-mute)]"
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            취소
          </Button>
          <Button
            size="sm"
            onClick={() => onSubmit(selectedSticker)}
            disabled={!canSubmit || isSubmitting}
            style={{
              background: "var(--wc-burgundy, #961E37)",
              color: "white",
            }}
          >
            {isSubmitting ? "작성 중..." : "답글 작성"}
          </Button>
        </div>
      </div>
    </div>
  )
}
