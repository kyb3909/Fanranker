"use client"

import { useState, useRef, useCallback, useEffect } from "react"

interface Sticker {
  id: string
  name: string
  image_url: string
}

interface MentionAutocompleteProps {
  onSelect: (sticker: Sticker) => void
}

export function useMentionAutocomplete(onSelect: (sticker: Sticker) => void) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionResults, setMentionResults] = useState<Sticker[]>([])
  const [mentionLoading, setMentionLoading] = useState(false)
  const [mentionIndex, setMentionIndex] = useState(0)
  const mentionRef = useRef<HTMLDivElement>(null)
  const mentionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const searchStickers = useCallback(async (query: string) => {
    if (!query) {
      setMentionResults([])
      return
    }
    setMentionLoading(true)
    try {
      const res = await fetch(`/api/stickers/my?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (data.stickers) {
        setMentionResults(
          data.stickers.map((s: Sticker) => ({
            id: s.id,
            name: s.name,
            image_url: s.image_url,
          }))
        )
      }
    } catch {
      setMentionResults([])
    } finally {
      setMentionLoading(false)
    }
  }, [])

  const detectMention = useCallback(
    (text: string, cursorPos: number) => {
      const textBeforeCursor = text.slice(0, cursorPos)
      const mentionMatch = textBeforeCursor.match(/(^|[\s])@([^\s@]*)$/)
      if (mentionMatch) {
        const query = mentionMatch[2]
        setMentionQuery(query)
        setMentionIndex(0)
        if (mentionDebounceRef.current) clearTimeout(mentionDebounceRef.current)
        if (query.length >= 1) {
          mentionDebounceRef.current = setTimeout(() => searchStickers(query), 200)
        } else {
          setMentionResults([])
        }
      } else {
        setMentionQuery(null)
        setMentionResults([])
      }
    },
    [searchStickers]
  )

  const selectSticker = useCallback(
    (sticker: Sticker) => {
      onSelect(sticker)
      setMentionQuery(null)
      setMentionResults([])
    },
    [onSelect]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (mentionQuery === null || mentionResults.length === 0) return false

      if (e.key === "ArrowDown") {
        e.preventDefault()
        setMentionIndex((prev) => (prev + 1) % mentionResults.length)
        return true
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setMentionIndex((prev) => (prev - 1 + mentionResults.length) % mentionResults.length)
        return true
      } else if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        selectSticker(mentionResults[mentionIndex])
        return true
      } else if (e.key === "Escape") {
        setMentionQuery(null)
        setMentionResults([])
        return true
      }
      return false
    },
    [mentionQuery, mentionResults, mentionIndex, selectSticker]
  )

  useEffect(() => {
    return () => {
      if (mentionDebounceRef.current) clearTimeout(mentionDebounceRef.current)
    }
  }, [])

  const isActive = mentionQuery !== null && (mentionLoading || mentionResults.length > 0)

  return {
    mentionRef,
    mentionQuery,
    mentionResults,
    mentionLoading,
    mentionIndex,
    isActive,
    detectMention,
    selectSticker,
    handleKeyDown,
  }
}

export function MentionDropdown({
  mentionRef,
  mentionResults,
  mentionLoading,
  mentionIndex,
  onSelect,
}: {
  mentionRef: React.RefObject<HTMLDivElement | null>
  mentionResults: Sticker[]
  mentionLoading: boolean
  mentionIndex: number
  onSelect: (sticker: Sticker) => void
}) {
  if (mentionLoading) {
    return (
      <div
        ref={mentionRef}
        className="border-border bg-card absolute right-0 bottom-0 left-0 z-50 translate-y-full rounded-lg border shadow-xl"
      >
        <div className="text-muted-foreground px-3 py-3 text-center text-xs">검색 중...</div>
      </div>
    )
  }

  return (
    <div
      ref={mentionRef}
      className="border-border bg-card absolute right-0 bottom-0 left-0 z-50 translate-y-full rounded-lg border shadow-xl"
    >
      <div className="max-h-48 overflow-y-auto py-1">
        {mentionResults.map((sticker, i) => (
          <button
            key={sticker.id}
            onClick={() => onSelect(sticker)}
            className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
              i === mentionIndex ? "bg-amber-500/10" : "hover:bg-muted/60"
            }`}
          >
            <img
              src={sticker.image_url}
              alt={sticker.name}
              className="h-10 w-10 rounded object-contain"
            />
            <span className="text-foreground text-sm font-medium">{sticker.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
