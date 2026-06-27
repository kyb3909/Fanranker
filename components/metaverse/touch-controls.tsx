"use client"

/**
 * TouchControls — 모바일/터치 디바이스 전용 온스크린 조작 오버레이.
 *
 * 키보드(A/D·Space·W·1)가 없는 터치 환경에서 아바타가 가만히 서있는 문제 해결.
 * sceneBridge 로 IndoorMapScene 에 입력 전달 (hold=move, one-shot=jump/up/action).
 * pointer: coarse 디바이스에서만 렌더 (데스크톱에선 null).
 */

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, ChevronUp, ArrowUp, Zap } from "lucide-react"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"

const BTN =
  "flex items-center justify-center rounded-full border border-white/25 bg-black/45 text-white/90 shadow-lg backdrop-blur-sm select-none active:scale-95 active:bg-black/70 transition-transform"

export function TouchControls() {
  const [isTouch, setIsTouch] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    setIsTouch(window.matchMedia("(pointer: coarse)").matches)
  }, [])

  if (!isTouch) return null

  // hold 버튼 — pointerdown 에 active:true, pointer 종료 계열에 active:false
  const holdProps = (dir: "left" | "right") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      sceneBridge.emit("touch:move", { dir, active: true })
    },
    onPointerUp: () => sceneBridge.emit("touch:move", { dir, active: false }),
    onPointerCancel: () => sceneBridge.emit("touch:move", { dir, active: false }),
    onPointerLeave: () => sceneBridge.emit("touch:move", { dir, active: false }),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  })

  // one-shot 버튼 — pointerdown 한 번만 emit
  const tapProps = (type: "touch:jump" | "touch:up" | "touch:action") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      sceneBridge.emit(type)
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  })

  // 하단 패딩에 모바일 탭바 높이(h-14=3.5rem) + safe-area + 여백을 더해 버튼이 탭바
  // (담벼락/운동장/월드컵/마이) 위로 올라오게 한다. 안 그러면 겹쳐서 메뉴가 눌림.
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between p-4 pb-[calc(env(safe-area-inset-bottom)+4.5rem)] select-none"
      style={{ touchAction: "none" }}
      aria-hidden
    >
      {/* 좌하단 — 이동 D-pad */}
      <div className="pointer-events-auto flex gap-3">
        <button
          type="button"
          aria-label="왼쪽"
          className={`${BTN} h-16 w-16`}
          {...holdProps("left")}
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
        <button
          type="button"
          aria-label="오른쪽"
          className={`${BTN} h-16 w-16`}
          {...holdProps("right")}
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      </div>

      {/* 우하단 — 액션 / 위(도어) / 점프 */}
      <div className="pointer-events-auto flex items-end gap-3">
        <button
          type="button"
          aria-label="액션"
          className={`${BTN} h-14 w-14`}
          {...tapProps("touch:action")}
        >
          <Zap className="h-6 w-6" />
        </button>
        <button
          type="button"
          aria-label="문/위로"
          className={`${BTN} h-14 w-14`}
          {...tapProps("touch:up")}
        >
          <ChevronUp className="h-7 w-7" />
        </button>
        <button
          type="button"
          aria-label="점프"
          className={`${BTN} h-20 w-20`}
          {...tapProps("touch:jump")}
        >
          <ArrowUp className="h-9 w-9" />
        </button>
      </div>
    </div>
  )
}
