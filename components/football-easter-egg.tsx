"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { FootballSprite } from "@/components/football-sprite"
import styles from "@/components/football-easter-egg.module.css"
import {
  EASTER_EGG_COOLDOWN_MS,
  EASTER_EGG_IDLE_MS,
  EASTER_EGG_RETRY_MS,
  EASTER_EGG_VISIBLE_MS,
  easterEggSlots,
  pickEasterEgg,
  type EasterEggSlot,
  type FootballSpriteId,
} from "@/lib/football-easter-eggs"

const STORAGE_KEY = "gongnori:football-visitor:last-seen"
const ACTIVITY_EVENTS = [
  "pointermove",
  "pointerdown",
  "keydown",
  "scroll",
  "wheel",
  "touchstart",
  "focusin",
] as const
let lastSeenInMemory = 0

function lastSeen() {
  try {
    const saved = Number(sessionStorage.getItem(STORAGE_KEY))
    return Math.max(lastSeenInMemory, Number.isFinite(saved) ? saved : 0)
  } catch {
    return lastSeenInMemory
  }
}

function isInteracting() {
  const focused = document.activeElement
  if (
    focused instanceof HTMLElement &&
    focused.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]'
    )
  )
    return true
  return Array.from(
    document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]')
  ).some((dialog) => dialog.getClientRects().length > 0)
}

type Plan = {
  path: string
  slot: EasterEggSlot
  character: FootballSpriteId
  element: HTMLElement
  playbackId: number
}
type VisibleSlot = { slot: EasterEggSlot; inView: boolean }
const EasterEggContext = createContext<{
  plan: Plan | null
  slots: EasterEggSlot[]
  updateSlot: (element: HTMLElement, state: VisibleSlot | null) => void
} | null>(null)

export function FootballEasterEggProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [plan, setPlan] = useState<Plan | null>(null)
  const active = useRef<Plan | null>(null)
  const registered = useRef(new Map<HTMLElement, VisibleSlot>())
  const hide = useCallback(() => {
    if (!active.current) return
    active.current = null
    setPlan(null)
  }, [])
  const updateSlot = useCallback(
    (element: HTMLElement, state: VisibleSlot | null) => {
      if (state) registered.current.set(element, state)
      else registered.current.delete(element)
      if (!state?.inView && active.current?.element === element) hide()
    },
    [hide]
  )

  useEffect(() => {
    hide()
    if (!easterEggSlots(pathname, true).length) return
    let lastActivity = Date.now()
    let retryAfter = 0
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    let leaveTimer: ReturnType<typeof setTimeout> | undefined

    const schedule = () => {
      clearTimeout(idleTimer)
      if (document.visibilityState !== "visible") return
      const next = Math.max(
        lastActivity + EASTER_EGG_IDLE_MS,
        lastSeen() + EASTER_EGG_COOLDOWN_MS,
        retryAfter
      )
      idleTimer = setTimeout(attempt, Math.max(0, next - Date.now()))
    }
    const attempt = () => {
      if (document.visibilityState !== "visible") return
      const now = Date.now()
      if (now < lastActivity + EASTER_EGG_IDLE_MS || now < lastSeen() + EASTER_EGG_COOLDOWN_MS) {
        schedule()
        return
      }
      const candidates = Array.from(registered.current).filter(
        ([element, state]) => element.isConnected && state.inView
      )
      const picked = isInteracting()
        ? null
        : pickEasterEgg(
            pathname,
            window.matchMedia("(min-width: 1024px)").matches,
            Math.random,
            candidates.map(([, state]) => state.slot)
          )
      const element = picked && candidates.find(([, state]) => state.slot === picked.slot)?.[0]
      if (picked && element) {
        active.current = { ...picked, path: pathname, element, playbackId: now }
        setPlan(active.current)
        lastSeenInMemory = now
        try {
          sessionStorage.setItem(STORAGE_KEY, String(now))
        } catch {
          // Storage disabled: the memory cooldown still covers navigation and remounts.
        }
        leaveTimer = setTimeout(hide, EASTER_EGG_VISIBLE_MS)
      }
      retryAfter = now + EASTER_EGG_RETRY_MS
      schedule()
    }
    const onActivity = () => {
      lastActivity = Date.now()
      retryAfter = 0
      clearTimeout(leaveTimer)
      hide()
      schedule()
    }
    const onVisibility = () => {
      // Returning to a tab starts a fresh quiet period; hidden time is never idle time.
      lastActivity = Date.now()
      retryAfter = 0
      clearTimeout(leaveTimer)
      hide()
      schedule()
    }
    for (const event of ACTIVITY_EVENTS)
      window.addEventListener(event, onActivity, { passive: true, capture: true })
    document.addEventListener("visibilitychange", onVisibility)
    schedule()
    return () => {
      clearTimeout(idleTimer)
      clearTimeout(leaveTimer)
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity, true)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [pathname, hide])

  return (
    <EasterEggContext.Provider
      value={{
        plan: plan?.path === pathname ? plan : null,
        slots: easterEggSlots(pathname, true),
        updateSlot,
      }}
    >
      {children}
    </EasterEggContext.Provider>
  )
}

/** Register empty corners; only the selected visible one loads an animated image. */
export function FootballEasterEgg({
  slot,
  className,
}: {
  slot: EasterEggSlot
  className?: string
}) {
  const context = useContext(EasterEggContext)
  const ref = useRef<HTMLSpanElement>(null)
  const updateSlot = context?.updateSlot
  const allowed = context?.slots.includes(slot) ?? false
  useEffect(() => {
    const target = ref.current
    if (!allowed || !updateSlot || !target || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      ([entry]) => {
        updateSlot(target, {
          slot,
          inView: entry.isIntersecting && entry.intersectionRatio >= 0.75,
        })
      },
      { threshold: 0.75 }
    )
    observer.observe(target)
    return () => {
      observer.disconnect()
      updateSlot(target, null)
    }
  }, [allowed, slot, updateSlot])
  if (!allowed) return null
  const chosen = context?.plan?.element === ref.current ? context.plan : null
  return (
    <span
      ref={ref}
      aria-hidden
      data-football-corner={slot}
      className={cn("pointer-events-none block h-32 w-32 select-none", className)}
    >
      {chosen && (
        <span
          data-football-visitor={chosen.character}
          className={cn("block h-full w-full", styles.appearance)}
          style={{ animationDuration: `${EASTER_EGG_VISIBLE_MS}ms` }}
        >
          <FootballSprite character={chosen.character} animated playbackId={chosen.playbackId} />
        </span>
      )}
    </span>
  )
}
