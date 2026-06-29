"use client"

import { useEffect, useState } from "react"
import { Info } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { WorldcupRulesContent } from "./worldcup-rules-content"

const SEEN_KEY = "wc-rules-seen-v1"

/**
 * 월드컵 승부예측 규칙 안내 모달.
 * 첫 방문 시 1회 자동 노출(공지), 이후엔 "승부 예측 규칙" 버튼으로 재열람.
 */
export function WorldcupRulesModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        setOpen(true)
        localStorage.setItem(SEEN_KEY, "1")
      }
    } catch {
      /* localStorage 접근 불가 — 무시 */
    }
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
        style={{ color: "var(--wc-mute)" }}
      >
        <Info className="h-4 w-4" aria-hidden />
        승부 예측 규칙
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle>승부 예측 규칙</DialogTitle>
          </DialogHeader>
          <WorldcupRulesContent />
        </DialogContent>
      </Dialog>
    </>
  )
}
