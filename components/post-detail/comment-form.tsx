"use client"

import { useState, useRef, useCallback } from "react"
import Image from "next/image"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { StickerPicker } from "@/components/sticker/sticker-picker"
import { useMentionAutocomplete, MentionDropdown } from "./mention-autocomplete"

interface Sticker {
  id: string
  name: string
  image_url: string
}

interface CommentFormProps {
  onSubmit: (text: string, sticker: Sticker | null) => Promise<void>
  isSubmitting: boolean
}

export function CommentForm({ onSubmit, isSubmitting }: CommentFormProps) {
  const [commentText, setCommentText] = useState("")
  const [showStickerPicker, setShowStickerPicker] = useState(false)
  const [selectedSticker, setSelectedSticker] = useState<Sticker | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleMentionSelect = useCallback(
    (sticker: Sticker) => {
      setSelectedSticker(sticker)
      // @키워드 부분을 텍스트에서 제거
      const textarea = textareaRef.current
      if (textarea) {
        const cursorPos = textarea.selectionStart
        const textBeforeCursor = commentText.slice(0, cursorPos)
        const match = textBeforeCursor.match(/(^|[\s])@[^\s@]*$/)
        if (match) {
          const start = textBeforeCursor.lastIndexOf("@")
          const newText = commentText.slice(0, start) + commentText.slice(cursorPos)
          setCommentText(newText.trimStart())
        }
      }
    },
    [commentText]
  )

  const mention = useMentionAutocomplete(handleMentionSelect)

  const handleTextChange = useCallback(
    (value: string) => {
      setCommentText(value)
      const textarea = textareaRef.current
      if (!textarea) return
      mention.detectMention(value, textarea.selectionStart)
    },
    [mention]
  )

  const handleSubmit = async () => {
    if (!commentText.trim() && !selectedSticker) return
    if (isSubmitting) return

    const text = commentText.trim()
    const sticker = selectedSticker
    setCommentText("")
    setSelectedSticker(null)
    setShowStickerPicker(false)

    try {
      await onSubmit(text, sticker)
    } catch {
      // 실패 시 복원
      setCommentText(text)
      setSelectedSticker(sticker)
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          placeholder="댓글을 입력하세요... (@스티커이름으로 스티커 검색)"
          className="min-h-[100px] resize-none"
          style={{
            padding: "11px 13px",
            fontSize: 13.5,
            lineHeight: 1.55,
            border: "1px solid var(--wc-line-2)",
            borderRadius: 10,
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
          value={commentText}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (mention.isActive) {
              if (mention.handleKeyDown(e)) return
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleSubmit()
            }
          }}
        />
        {mention.isActive && (
          <MentionDropdown
            mentionRef={mention.mentionRef}
            mentionResults={mention.mentionResults}
            mentionLoading={mention.mentionLoading}
            mentionIndex={mention.mentionIndex}
            onSelect={mention.selectSticker}
          />
        )}
      </div>
      {/* 선택된 스티커 미리보기 */}
      {selectedSticker && (
        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-2"
          style={{ borderColor: "var(--wc-line-2)", background: "var(--wc-soft)" }}
        >
          <Image
            src={selectedSticker.image_url}
            alt={selectedSticker.name}
            width={48}
            height={48}
            className="h-12 w-12 object-contain"
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
            onClick={() => setShowStickerPicker(!showStickerPicker)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              showStickerPicker
                ? "bg-[var(--wc-soft)] text-[var(--wc-mute)]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            스티커
          </button>
          {showStickerPicker && (
            <StickerPicker
              onSelect={(sticker) => {
                setSelectedSticker(sticker)
                setShowStickerPicker(false)
              }}
              onClose={() => setShowStickerPicker(false)}
            />
          )}
        </div>
        <Button
          onClick={handleSubmit}
          disabled={(!commentText.trim() && !selectedSticker) || isSubmitting}
          style={{
            background: "var(--wc-burgundy, #961E37)",
            color: "white",
          }}
        >
          {isSubmitting ? "작성 중..." : "댓글 작성"}
        </Button>
      </div>
    </div>
  )
}
