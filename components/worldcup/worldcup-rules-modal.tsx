"use client"

import { useEffect, useState } from "react"
import { Info } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

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
          <div
            className="space-y-3.5 text-[14px] leading-relaxed"
            style={{ color: "var(--wc-ink-2, #494d56)", wordBreak: "keep-all" }}
          >
            <p>
              예측에 사용되는 <b style={{ color: "var(--wc-ink)" }}>기회(볼)</b>는 매일{" "}
              <b style={{ color: "var(--wc-ink)" }}>10개씩</b> 충전되고, 소진되지 않은 볼은 그대로
              사라집니다.
            </p>
            <p>
              예측할 수 있는 경기는 <b style={{ color: "var(--wc-ink)" }}>하루 24시간 분량</b>으로
              정해져 있고, 경기 목록은 <b style={{ color: "var(--wc-ink)" }}>매일 밤 11시</b>에 새로
              바뀝니다.
            </p>
            <p>
              국내 체육진흥투표권(스포츠토토) 발매가 밤 11시에 멈췄다가, 아침 8시에 다시 시작되기
              때문입니다.
            </p>
            <p>
              새로 바뀐 목록에는 발매가 다시 열리는{" "}
              <b style={{ color: "var(--wc-ink)" }}>
                오전 8시 이후 경기부터 그 다음날 오전 8시까지
              </b>{" "}
              총 24시간의 경기가 담깁니다.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
