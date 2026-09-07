"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { canRequest, parseWanted, type Wanted } from "./fixtures"

const STORAGE_KEY = "goods-lab:interests:v1"

interface Interests {
  wanted: Wanted
  hydrated: boolean
  persistent: boolean
  toggle: (pieceId: string, itemId: string) => void
}

const InterestContext = createContext<Interests | null>(null)

/** 시연 전용. 실제 사용자/주문 데이터와 연결하지 않는다. */
export function InterestProvider({ children }: { children: React.ReactNode }) {
  const [wanted, setWanted] = useState<Wanted>({})
  const [hydrated, setHydrated] = useState(false)
  const [persistent, setPersistent] = useState(true)

  useEffect(() => {
    try {
      setWanted(parseWanted(window.localStorage.getItem(STORAGE_KEY)))
    } catch {
      setPersistent(false)
    }
    setHydrated(true)
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        setWanted(parseWanted(event.newValue))
      }
    }
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      // 쓰기 전에 복원을 마쳐 새로고침 시 기존 선택을 덮어쓰지 않는다.
      const serialized = JSON.stringify(wanted)
      if (window.localStorage.getItem(STORAGE_KEY) !== serialized) {
        window.localStorage.setItem(STORAGE_KEY, serialized)
      }
    } catch {
      setPersistent(false)
    }
  }, [wanted, hydrated])

  const toggle = useCallback((pieceId: string, itemId: string) => {
    if (!canRequest(pieceId, itemId)) return
    const key = `${pieceId}:${itemId}`
    setWanted((previous) => {
      const next = { ...previous }
      if (next[key]) delete next[key]
      else next[key] = true
      return next
    })
  }, [])

  return (
    <InterestContext.Provider value={{ wanted, hydrated, persistent, toggle }}>
      {children}
    </InterestContext.Provider>
  )
}

export function useInterests() {
  const value = useContext(InterestContext)
  if (!value) throw new Error("useInterests requires InterestProvider")
  return value
}
