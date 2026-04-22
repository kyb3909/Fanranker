"use client"

/**
 * OnboardingHint — 메타버스 최초 진입 시 1회 표시되는 컨트롤 안내.
 *
 * localStorage 키 metaverse:onboarding:dismissed 로 영구 dismiss.
 * "다시 보지 않기" 버튼 또는 아무 키 누르면 fade out.
 */

import { useEffect, useState } from "react"

const STORAGE_KEY = "metaverse:onboarding:dismissed"
const AUTO_DISMISS_MS = 12_000

export function OnboardingHint() {
  // 초기값 false → SSR/hydration 안전. useEffect 에서 localStorage 확인 후 표시 결정.
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return
    } catch {
      /* localStorage 실패 시 표시 */
    }
    setVisible(true)

    // 타임아웃 자동 dismiss
    const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS)

    // 첫 키 입력 시 dismiss (WASD/화살표로 이동하면 자동으로 사라짐)
    const keyHandler = (e: KeyboardEvent) => {
      const relevant = ["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]
      if (relevant.includes(e.key)) setVisible(false)
    }
    window.addEventListener("keydown", keyHandler)

    return () => {
      clearTimeout(timer)
      window.removeEventListener("keydown", keyHandler)
    }
  }, [])

  const dismissForever = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1")
    } catch {
      /* noop */
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="pointer-events-auto absolute top-1/2 left-1/2 z-30 w-[min(90vw,340px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/15 bg-neutral-900/95 p-5 text-white shadow-2xl backdrop-blur-sm">
      <h2 className="text-sm font-bold">처음 오셨네요 👋</h2>
      <ul className="mt-3 space-y-2 text-xs text-white/75">
        <li className="flex items-center gap-2">
          <Keys keys={["W", "A", "S", "D"]} />
          <span>혹은 방향키로 이동</span>
        </li>
        <li className="flex items-center gap-2">
          <Keys keys={["Enter"]} />
          <span>채팅 열기 · 전송</span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="text-base leading-none">
            🪧
          </span>
          <span>빈 자리 위에 서면 방을 만들 수 있어요 (100P)</span>
        </li>
      </ul>
      <div className="mt-4 flex items-center justify-between text-[11px]">
        <span className="text-white/40">키 입력 시 자동 사라짐</span>
        <button
          onClick={dismissForever}
          className="rounded px-2 py-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          다시 보지 않기
        </button>
      </div>
    </div>
  )
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex gap-1">
      {keys.map((k) => (
        <kbd
          key={k}
          className="rounded border border-white/25 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-white/85"
        >
          {k}
        </kbd>
      ))}
    </span>
  )
}
