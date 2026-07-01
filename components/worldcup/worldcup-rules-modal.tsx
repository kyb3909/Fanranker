"use client"

import { useEffect, useState } from "react"
import { Info } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { WorldcupRulesContent } from "./worldcup-rules-content"

// 운영 공지(볼 충전 오류 안내) — 하루 1회 강제 확인.
// localStorage 값에 "마지막으로 확인한 날짜(KST, YYYY-MM-DD)"를 저장하고,
// 오늘 날짜와 다르면 다시 띄운다. 기존에 "1"이 저장돼 있던 사용자도 날짜 불일치로 재노출된다.
// 새 공지로 교체할 때는 키 버전을 올린다.
const NOTICE_SEEN_KEY = "wc-notice-ball-bug-2026-06-30"

/** KST 기준 오늘 날짜 (YYYY-MM-DD) */
function todayKST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

/**
 * 월드컵 이벤트 모달.
 * - 첫 방문 시 운영 공지를 1회 강제 노출("확인했음"을 눌러야만 닫힘 — ESC/바깥 클릭/X 불가).
 * - "승부 예측 규칙" 버튼으로 규칙은 언제든 재열람(일반 닫기 가능).
 */
export function WorldcupRulesModal() {
  const [rulesOpen, setRulesOpen] = useState(false)
  const [noticeOpen, setNoticeOpen] = useState(false)

  useEffect(() => {
    try {
      // 오늘(KST) 확인 기록이 없으면 노출 → 하루 1회.
      if (localStorage.getItem(NOTICE_SEEN_KEY) !== todayKST()) {
        setNoticeOpen(true)
      }
    } catch {
      /* localStorage 접근 불가 — 무시 */
    }
  }, [])

  const acknowledgeNotice = () => {
    try {
      localStorage.setItem(NOTICE_SEEN_KEY, todayKST())
    } catch {
      /* 무시 */
    }
    setNoticeOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setRulesOpen(true)}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
        style={{ color: "var(--wc-mute)" }}
      >
        <Info className="h-4 w-4" aria-hidden />
        승부 예측 규칙
      </button>

      {/* 규칙 모달 — 일반(닫기 가능) */}
      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle>승부 예측 규칙</DialogTitle>
          </DialogHeader>
          <WorldcupRulesContent />
        </DialogContent>
      </Dialog>

      {/* 운영 공지 — 강제 확인("확인했음" 버튼으로만 닫힘) */}
      <Dialog open={noticeOpen} onOpenChange={setNoticeOpen}>
        <DialogContent
          className="max-w-[460px]"
          showCloseButton={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>안내</DialogTitle>
          </DialogHeader>
          <div
            className="space-y-3 text-[14px] leading-relaxed"
            style={{ color: "var(--wc-ink-2, #494d56)", wordBreak: "keep-all" }}
          >
            <p>볼 충전에 오류가 있어 바로 수정했습니다.</p>
            <p>
              일일 볼은 하루 한 번만 충전되어야 하지만, 특정 상황에서 같은 날 한 번 더 충전되는
              오류가 있었습니다.
            </p>
            <p>
              이 오류로 추가 충전된 볼을 사용해 진행된 베팅 1건을 공정성을 위해 취소 처리했습니다.
              정상적으로 충전된 볼로 하신 베팅에는 영향이 없습니다.
            </p>
            <p>미리 대응하지 못한 점 사과드립니다. 더 꼼꼼히 점검하고 운영하겠습니다.</p>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={acknowledgeNotice}
              className="mt-1 w-full rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--wc-burgundy, #961e37)" }}
            >
              확인했음
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
