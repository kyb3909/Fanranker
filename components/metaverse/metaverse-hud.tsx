"use client"

/**
 * MetaverseHud — Phaser 캔버스 위에 그리는 React HUD 오버레이.
 *
 * 좌상단: 위치 라벨 + 키맵
 * 우상단: 온라인 인원 + 활동 포인트 (현재 stub) + 액션 버튼들 (parent 가 children 으로 주입)
 * 중앙상단: 킥 충전 게이지 (sceneBridge `charge:progress` 구독)
 *
 * 모두 `pointer-events-none` 기본, 버튼/링크만 `pointer-events-auto`.
 * Phaser 캔버스를 가리지 않게 좌우 양 끝 + 상단 일부에만 배치.
 */

import { useEffect, useState, type ReactNode } from "react"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"

interface KeyMapItem {
  keys: string[]
  action: string
}

const KEY_MAP: KeyMapItem[] = [
  { keys: ["←", "→"], action: "이동" },
  { keys: ["↑", "W"], action: "뒤보기" },
  { keys: ["↓", "S"], action: "앞보기" },
  { keys: ["Space"], action: "점프" },
  { keys: ["R"], action: "킥(충전)" },
  { keys: ["Enter"], action: "채팅" },
]

interface Props {
  /** 우상단 액션 영역에 들어갈 버튼들 (상점/월드맵 등). parent 가 직접 주입. */
  actions?: ReactNode
  /** 위치 표시 라벨 — "🏟️ 웸블리 · 런던 광장" 같은 식 */
  locationLabel?: string
  /** 우상단에 표시할 추가 통계 (현재 미사용 — 향후 온라인 인원 등) */
  stats?: ReactNode
}

export function MetaverseHud({ actions, locationLabel = "🏟️ 웸블리 광장", stats }: Props) {
  const [keyMapOpen, setKeyMapOpen] = useState(false)

  return (
    <>
      {/* 좌상단 — 위치 + 키맵 */}
      <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-2">
        <HudLocation label={locationLabel} />
        <HudKeyMap open={keyMapOpen} onToggle={() => setKeyMapOpen((o) => !o)} />
      </div>

      {/* 우상단 — 통계 + 액션 */}
      <div className="pointer-events-none absolute top-3 right-3 flex flex-col items-end gap-2">
        {stats ? <div className="pointer-events-auto">{stats}</div> : null}
        <div className="pointer-events-auto flex items-center gap-2">{actions}</div>
      </div>

      {/* 중앙 상단 — 충전 게이지 */}
      <HudChargeBar />
    </>
  )
}

function HudLocation({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg backdrop-blur-sm">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
      {label}
    </div>
  )
}

function HudKeyMap({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black/60 shadow-lg backdrop-blur-sm">
      <button
        onClick={onToggle}
        className="pointer-events-auto flex w-full items-center justify-between gap-3 px-3 py-1.5 text-[11px] font-semibold text-white/90 hover:bg-white/5"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden>⌨️</span>
          <span>조작</span>
        </span>
        <span className="text-white/40">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <ul className="border-t border-white/10 px-3 py-2 text-[11px] text-white/80">
          {KEY_MAP.map((item) => (
            <li key={item.action} className="flex items-center gap-2 py-0.5">
              <span className="flex gap-1">
                {item.keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-white/20 bg-white/10 px-1.5 font-mono text-[10px] text-white"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
              <span className="text-white/70">{item.action}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function HudChargeBar() {
  const [state, setState] = useState<{ active: boolean; progress: number }>({
    active: false,
    progress: 0,
  })

  useEffect(() => {
    const unsub = sceneBridge.on("charge:progress", (payload) => {
      if (payload) setState(payload)
    })
    return () => unsub()
  }, [])

  if (!state.active) return null

  const t = state.progress
  // 색상: 약 (에메랄드) → 중 (앰버) → 강 (적색) — 풀차지 시 펄스
  const fillColor = t < 0.4 ? "bg-emerald-400" : t < 0.75 ? "bg-amber-400" : "bg-red-500"
  const isMaxed = t >= 0.99

  return (
    <div className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
      <div className="flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-[10px] font-bold tracking-wide text-white shadow-lg backdrop-blur-sm">
        <span aria-hidden>⚡</span>
        <span>킥 충전</span>
        <span className="text-white/60">{Math.round(t * 100)}%</span>
      </div>
      <div className="relative h-2 w-60 overflow-hidden rounded-full bg-black/70 ring-1 ring-white/20">
        <div
          className={`h-full transition-[width] duration-75 ease-out ${fillColor} ${
            isMaxed ? "animate-pulse" : ""
          }`}
          style={{ width: `${t * 100}%` }}
        />
      </div>
    </div>
  )
}
