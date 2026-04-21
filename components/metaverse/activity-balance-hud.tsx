"use client"

/**
 * ActivityBalanceHud — 현재 소모 가능한 활동 포인트 잔액 표시.
 * 채팅방 개설(100점 차감) 시 외부에서 refetch 트리거.
 */

import { useCallback, useEffect, useState } from "react"
import { METAVERSE_GUEST_HEADER } from "@/lib/metaverse/auth"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"

interface BalanceResponse {
  spendablePoints: number
  lifetimeEarned: number
  isGuest: boolean
}

/** 외부에서 강제 재조회 트리거 (CustomEvent 기반) */
export function refreshActivityBalance() {
  window.dispatchEvent(new CustomEvent("metaverse:balance:refresh"))
}

export function ActivityBalanceHud({ identity }: { identity: MetaversePlayerIdentity }) {
  const [balance, setBalance] = useState<BalanceResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchBalance = useCallback(async () => {
    try {
      const headers: HeadersInit = {}
      if (identity.userId.startsWith("guest-")) {
        headers[METAVERSE_GUEST_HEADER] = identity.userId
      }
      const res = await fetch("/api/metaverse/activity-balance/me", { headers })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = (await res.json()) as BalanceResponse
      setBalance(data)
    } catch (err) {
      console.warn("[metaverse] balance fetch failed", err)
    } finally {
      setLoading(false)
    }
  }, [identity.userId])

  useEffect(() => {
    void fetchBalance()
    const handler = () => void fetchBalance()
    window.addEventListener("metaverse:balance:refresh", handler)
    return () => window.removeEventListener("metaverse:balance:refresh", handler)
  }, [fetchBalance])

  return (
    <div className="pointer-events-none absolute top-2 right-2 rounded-md border border-white/10 bg-black/60 px-3 py-1.5 text-right text-[11px] text-white backdrop-blur-sm">
      <div className="text-[9px] tracking-wider text-white/40 uppercase">활동 포인트</div>
      <div className="mt-0.5 flex items-baseline justify-end gap-1">
        {loading ? (
          <span className="text-white/40">…</span>
        ) : (
          <>
            <span className="text-sm font-bold tabular-nums">{balance?.spendablePoints ?? 0}</span>
            <span className="text-[9px] text-white/40">P</span>
          </>
        )}
      </div>
      {balance && balance.lifetimeEarned > balance.spendablePoints && (
        <div className="mt-0.5 text-[9px] text-white/35">
          누적 {balance.lifetimeEarned.toLocaleString()}
        </div>
      )}
    </div>
  )
}
