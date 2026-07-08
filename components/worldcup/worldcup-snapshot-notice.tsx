"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// 순위 공개 방식 변경 안내 — 리더보드 진입 시 1회 강제 확인.
// localStorage 에 "확인한 날짜(KST, YYYY-MM-DD)"를 저장하고, 오늘과 다르면 다시 띄운다(하루 1회).
// 새 공지로 교체할 때는 키 버전을 올린다.
const NOTICE_SEEN_KEY = "wc-lb-notice-snapshot-2026-07-08"

/** KST 기준 오늘 날짜 (YYYY-MM-DD) */
function todayKST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

/**
 * 리더보드 순위 스냅샷 공개 안내 모달.
 * "확인했음"을 눌러야만 닫힘 — ESC/바깥 클릭/X 불가. 하루 1회 노출.
 */
export function WorldcupSnapshotNotice() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(NOTICE_SEEN_KEY) !== todayKST()) {
        setOpen(true)
      }
    } catch {
      /* localStorage 접근 불가 — 무시 */
    }
  }, [])

  const acknowledge = () => {
    try {
      localStorage.setItem(NOTICE_SEEN_KEY, todayKST())
    } catch {
      /* 무시 */
    }
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-w-[460px]"
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>순위 공개 안내</DialogTitle>
        </DialogHeader>
        <div
          className="space-y-3 text-[14px] leading-relaxed"
          style={{ color: "var(--wc-ink-2, #494d56)", wordBreak: "keep-all" }}
        >
          <p>이벤트 막바지, 순위 공개 방식이 바뀝니다.</p>
          <p>
            지금부터 리더보드 순위는 실시간이 아니라 <b>16강까지 반영된 상태</b>로 고정됩니다. 8강
            경기의 순위 변동은 즉시 공개되지 않아요.
          </p>
          <p>
            이후 순위는 <b>4강 경기, 준결승 직전, 결승 종료</b> 시점에만 갱신해 공개합니다. 끝까지
            결과를 알 수 없으니, 마지막까지 예측에 참여해 주세요.
          </p>
          <p>내 예측 기록과 볼 잔액 등은 평소처럼 실시간으로 확인할 수 있습니다.</p>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={acknowledge}
            className="mt-1 w-full rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--wc-burgundy, #961e37)" }}
          >
            확인했음
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
