"use client"

/**
 * AvatarShopModal — 유니폼 쇼핑 + 장착 통합 UI.
 *
 * 카탈로그 + 내 인벤토리 + 내 골드 를 로드해 카드 리스트로 표시.
 * 각 카드는 상태에 따라 "장착 중" / "장착" / "구매 (N G)" / "골드 부족" 버튼.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { DEFAULT_AVATAR_KEY } from "@/lib/metaverse/avatar/presets"
import { METAVERSE_GUEST_HEADER } from "@/lib/metaverse/constants"

interface AvatarShopItem {
  avatarKey: string
  name: string
  description: string | null
  priceGold: number
  isDefault: boolean
  sortOrder: number
}

interface AvatarMeState {
  equippedAvatarKey: string
  ownedAvatarKeys: string[]
  goldBalance: number | null
  isGuest: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  /** 장착 변경 성공 시 호출 — 씬 재부팅 트리거용 */
  onEquipped?: (avatarKey: string) => void
  /** 게스트 userId — 있으면 dev 환경 guest 헤더로 API 호출. Clerk 로그인 유저는 비워둠. */
  guestUserId?: string | null
  /** 실제 씬에서 지금 렌더되고 있는 프리셋 키 — 서버 /me 응답을 override 해 UI 싱크 유지용. */
  currentAvatarKey?: string
}

const LOCAL_STORAGE_KEY = "metaverse:avatar:equipped"

export function AvatarShopModal({
  open,
  onClose,
  onEquipped,
  guestUserId,
  currentAvatarKey,
}: Props) {
  const [catalog, setCatalog] = useState<AvatarShopItem[]>([])
  const [me, setMe] = useState<AvatarMeState | null>(null)
  const [loading, setLoading] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const authHeaders = useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = {}
    if (guestUserId) h[METAVERSE_GUEST_HEADER] = guestUserId
    return h
  }, [guestUserId])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [shopRes, meRes] = await Promise.all([
        fetch("/api/metaverse/avatar/shop", { cache: "no-store" }),
        fetch("/api/metaverse/avatar/me", { cache: "no-store", headers: authHeaders }),
      ])
      if (!shopRes.ok) throw new Error("카탈로그 로드 실패")
      if (!meRes.ok) throw new Error("내 정보 로드 실패")
      const shop = (await shopRes.json()) as { items: AvatarShopItem[] }
      const meData = (await meRes.json()) as AvatarMeState
      // 우선순위: 1) 부모가 넘겨준 currentAvatarKey (실제 씬 상태) 2) localStorage (게스트) 3) 서버값
      if (currentAvatarKey && shop.items.some((it) => it.avatarKey === currentAvatarKey)) {
        meData.equippedAvatarKey = currentAvatarKey
      } else if (meData.isGuest) {
        const ls =
          typeof window !== "undefined" ? window.localStorage.getItem(LOCAL_STORAGE_KEY) : null
        if (ls && shop.items.some((it) => it.avatarKey === ls)) {
          meData.equippedAvatarKey = ls
        }
      }
      setCatalog(shop.items)
      setMe(meData)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [authHeaders, currentAvatarKey])

  useEffect(() => {
    if (!open) return
    void refresh()
  }, [open, refresh])

  const jsonHeaders = useMemo<Record<string, string>>(
    () => ({ "content-type": "application/json", ...authHeaders }),
    [authHeaders]
  )

  const handlePurchase = async (avatarKey: string) => {
    setBusyKey(avatarKey)
    setError(null)
    try {
      const res = await fetch("/api/metaverse/avatar/purchase", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ avatarKey }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.message ?? data?.error ?? "구매 실패")
      }
      // 구매 직후 자동 장착
      await handleEquip(avatarKey, { silent: true })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyKey(null)
    }
  }

  const handleEquip = async (avatarKey: string, opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setBusyKey(avatarKey)
    setError(null)
    try {
      const res = await fetch("/api/metaverse/avatar/equip", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ avatarKey }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.message ?? data?.error ?? "장착 실패")
      }
      if (me?.isGuest && typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, avatarKey)
      }
      onEquipped?.(avatarKey)
      if (!opts.silent) {
        // 장착 성공 시 닫기 — 호출자가 씬 재부팅 진행
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (!opts.silent) setBusyKey(null)
    }
  }

  const items = useMemo(() => [...catalog].sort((a, b) => a.sortOrder - b.sortOrder), [catalog])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-xl bg-neutral-900 p-5 text-white shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">유니폼 상점</h2>
            <p className="mt-0.5 text-xs text-white/60">
              {me?.isGuest
                ? "게스트는 구매 불가 — 로그인 후 이용 가능합니다"
                : `보유 골드: ${me?.goldBalance?.toLocaleString() ?? "-"} G`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-white/60 hover:bg-white/10"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {error ? (
          <div className="mb-3 rounded-md bg-red-500/20 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="py-10 text-center text-sm text-white/60">불러오는 중…</div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const isEquipped = me?.equippedAvatarKey === item.avatarKey
              const isOwned = me?.ownedAvatarKeys.includes(item.avatarKey) ?? item.isDefault
              const canAfford = !me?.goldBalance ? false : me.goldBalance >= item.priceGold
              const busy = busyKey === item.avatarKey

              let actionLabel: string
              let actionHandler: (() => void) | null = null
              let disabled = busy

              if (isEquipped) {
                actionLabel = "장착 중"
                disabled = true
              } else if (isOwned) {
                actionLabel = "장착"
                actionHandler = () => handleEquip(item.avatarKey)
              } else if (me?.isGuest) {
                actionLabel = "로그인 필요"
                disabled = true
              } else if (!canAfford) {
                actionLabel = "골드 부족"
                disabled = true
              } else {
                actionLabel = `구매 · ${item.priceGold.toLocaleString()} G`
                actionHandler = () => handlePurchase(item.avatarKey)
              }

              return (
                <li
                  key={item.avatarKey}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                    isEquipped
                      ? "border-emerald-500/60 bg-emerald-500/10"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="text-sm font-semibold">{item.name}</p>
                    {item.description ? (
                      <p className="mt-0.5 text-xs text-white/60">{item.description}</p>
                    ) : null}
                    <p className="mt-1 text-[12px] text-white/40">
                      {item.isDefault ? "기본 제공" : `${item.priceGold.toLocaleString()} 골드`}
                    </p>
                  </div>
                  <button
                    onClick={actionHandler ?? undefined}
                    disabled={disabled}
                    className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      disabled
                        ? "cursor-not-allowed bg-white/5 text-white/40"
                        : "bg-emerald-500 text-white hover:bg-emerald-400"
                    }`}
                  >
                    {busy ? "…" : actionLabel}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <p className="mt-4 text-[12px] text-white/40">
          * 장착 변경 시 캐릭터 재생성을 위해 씬이 재시작됩니다.
        </p>
      </div>
    </div>
  )
}

export { LOCAL_STORAGE_KEY as AVATAR_EQUIP_LOCAL_KEY }
