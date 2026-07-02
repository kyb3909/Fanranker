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
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import { HighburyStage } from "./highbury-stage"

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

export function useStadiumPip(): StadiumPipValue {
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

  if (mode === "closed") return null
  const isFull = mode === "full"

  return (
    <div
      className={
        isFull
          ? "fixed inset-x-0 z-40 mx-auto max-w-[1280px]"
          : "fixed right-4 bottom-4 z-50 h-[220px] w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-white/20 shadow-2xl"
      }
      style={isFull ? { top: topOffset, bottom: 0 } : undefined}
    >
      <HighburyStage
        allowGuest
        pip={{
          mode,
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
