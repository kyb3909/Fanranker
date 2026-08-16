"use client"

/**
 * StadiumPip — 스타디움을 앱 전역 상주 컴포넌트로 승격 (미니 플레이어 패턴).
 *
 * - /metaverse/highbury 진입 → full (헤더 아래 풀스크린)
 * - 다른 페이지로 이동 → mini (우하단 미니 창, Phaser·Realtime 연결 유지)
 * - 미니 창의 ✕ → closed (스테이지 언마운트, 채널 disconnect)
 *
 * 스테이지가 라우트가 아니라 AppShell 에 마운트되므로 페이지를 옮겨도
 * 접속·채팅·presence 가 끊기지 않는다. 미니 모드에서는 씬 키보드 입력을
 * sceneBridge "pip:mode" 로 차단해 페이지 탐색을 방해하지 않는다.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import { HighburyStage } from "./highbury-stage"

const MINI_W = 360
const MINI_H = 240

type StadiumPipMode = "closed" | "full" | "mini"

interface StadiumPipValue {
  mode: StadiumPipMode
  /** 스타디움 페이지 진입 — 풀스크린 */
  enterFull: () => void
  /** 스타디움 페이지 이탈 — 풀이었다면 미니로 유지 */
  shrinkToMini: () => void
  /** 완전 종료 (연결 해제) */
  close: () => void
}

const StadiumPipContext = createContext<StadiumPipValue | null>(null)

function useStadiumPip(): StadiumPipValue {
  const ctx = useContext(StadiumPipContext)
  if (!ctx) throw new Error("useStadiumPip must be used within StadiumPipProvider")
  return ctx
}

export function StadiumPipProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<StadiumPipMode>("closed")

  const enterFull = useCallback(() => setMode("full"), [])
  const shrinkToMini = useCallback(() => setMode((m) => (m === "full" ? "mini" : m)), [])
  const close = useCallback(() => setMode("closed"), [])

  const value = useMemo(
    () => ({ mode, enterFull, shrinkToMini, close }),
    [mode, enterFull, shrinkToMini, close]
  )

  return (
    <StadiumPipContext.Provider value={value}>
      {children}
      <GlobalStadium />
    </StadiumPipContext.Provider>
  )
}

/** mode 에 따라 풀스크린/미니 창으로 스테이지를 렌더 — closed 면 언마운트 */
function GlobalStadium() {
  const { mode, close } = useStadiumPip()
  const router = useRouter()

  // 풀 모드 상단 = 헤더 실측 (GNB 가 헤더 아래 별도 행이라 3.5rem 보다 큼)
  const [topOffset, setTopOffset] = useState(56)
  useEffect(() => {
    if (mode !== "full") return
    const measure = () => {
      const h = document.querySelector("header")
      if (h) setTopOffset(Math.ceil(h.getBoundingClientRect().bottom))
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [mode])

  // 미니 창 드래그 — null 이면 기본 위치(우하단). 드래그 시작 시 실측 좌표로 전환.
  const [miniPos, setMiniPos] = useState<{ x: number; y: number } | null>(null)
  // 미니 활성 상태 — 클릭(드래그 아닌)하면 활성: 씬 키보드가 살아나 좌우 이동/점프 가능.
  // 창 밖을 클릭하면 비활성 → 키보드가 페이지로 돌아감 (스크롤/타이핑 안전).
  const [miniActive, setMiniActive] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    dx: number
    dy: number
    sx: number
    sy: number
    moved: boolean
  } | null>(null)

  // 모드 전환 시 활성 초기화 + 미니 동안 바깥 클릭 감지
  useEffect(() => {
    setMiniActive(false)
    if (mode !== "mini") return
    const onDocPointerDown = (e: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setMiniActive(false)
      }
    }
    document.addEventListener("pointerdown", onDocPointerDown)
    return () => document.removeEventListener("pointerdown", onDocPointerDown)
  }, [mode])

  const clampPos = useCallback((x: number, y: number) => {
    const w = Math.min(MINI_W, window.innerWidth - 32)
    return {
      x: Math.min(Math.max(x, 4), window.innerWidth - w - 4),
      y: Math.min(Math.max(y, 4), window.innerHeight - MINI_H - 4),
    }
  }, [])

  const onMiniPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // 채팅 입력창 클릭 = 곧바로 조작 활성 (입력 blur 후 방향키가 게임으로 가도록)
    if ((e.target as HTMLElement).closest("input")) {
      setMiniActive(true)
      return
    }
    // 버튼 클릭은 드래그/활성 취급하지 않음
    if ((e.target as HTMLElement).closest("button")) return
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = {
      pointerId: e.pointerId,
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
    }
    wrapperRef.current?.setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [])

  const onMiniPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      // 4px 이상 움직여야 드래그 — 미만이면 클릭(활성화)으로 처리
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return
      drag.moved = true
      setMiniPos(clampPos(e.clientX - drag.dx, e.clientY - drag.dy))
    },
    [clampPos]
  )

  const onMiniPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag?.pointerId === e.pointerId) {
      if (!drag.moved) setMiniActive(true) // 제자리 클릭 = 조작 활성화
      dragRef.current = null
      wrapperRef.current?.releasePointerCapture(e.pointerId)
    }
  }, [])

  if (mode === "closed") return null
  const isFull = mode === "full"

  return (
    <div
      ref={wrapperRef}
      className={
        isFull
          ? "fixed inset-x-0 z-40 mx-auto max-w-[1280px]"
          : "fixed z-50 h-[240px] w-[min(360px,calc(100vw-2rem))] cursor-move touch-none overflow-hidden rounded-xl border shadow-2xl " +
            (miniActive ? "border-amber-400 ring-2 ring-amber-400/60" : "border-white/20")
      }
      style={
        isFull
          ? { top: topOffset, bottom: 0 }
          : miniPos
            ? { left: miniPos.x, top: miniPos.y }
            : { right: 16, bottom: 16 }
      }
      onPointerDown={isFull ? undefined : onMiniPointerDown}
      onPointerMove={isFull ? undefined : onMiniPointerMove}
      onPointerUp={isFull ? undefined : onMiniPointerUp}
      onPointerCancel={isFull ? undefined : onMiniPointerUp}
    >
      <HighburyStage
        allowGuest
        pip={{
          mode,
          active: miniActive,
          onExpand: () => router.push("/metaverse/highbury"),
          onClose: close,
        }}
      />
    </div>
  )
}

/**
 * /metaverse/highbury 페이지 바인딩 — 스테이지 자체는 전역(GlobalStadium)이 렌더하고,
 * 이 컴포넌트는 라우트 진입/이탈을 모드 전환으로 변환만 한다.
 */
export function StadiumPageBinding() {
  const { enterFull, shrinkToMini } = useStadiumPip()
  useEffect(() => {
    enterFull()
    return () => shrinkToMini()
  }, [enterFull, shrinkToMini])
  // 전역 스테이지가 fixed 오버레이로 덮으므로 여기는 배경 자리만 확보
  return <div className="min-h-[calc(100svh-3.5rem)] bg-neutral-950" />
}
