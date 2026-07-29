"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Sparkles,
  Image,
  Award,
  Upload,
  ShoppingBag,
  Star,
  TrendingUp,
  Search,
  Coins,
} from "lucide-react"
import { StickerUploadDialog } from "./sticker-upload-dialog"
import { StickerCard } from "./sticker-card"
import { TitleCard, type TitleItem } from "./title-card"

interface Sticker {
  id: string
  name: string
  image_url: string
  media_type: string
  creator_id: string
  price: number
  vote_count: number
  purchase_count: number
  use_count: number
  status: string
  board_slug: string | null
  tags: string[] | null
  created_at: string
}

interface StickerPack {
  id: string
  name: string
  icon_url: string
  board_slug: string | null
}

type ShopTab = "stickers" | "titles" | "pixel-art" | "gold"

const SHOP_TABS = [
  { id: "stickers" as ShopTab, label: "밈 스티커", icon: Sparkles, color: "text-amber-400" },
  { id: "titles" as ShopTab, label: "칭호", icon: Award, color: "text-violet-400" },
  { id: "pixel-art" as ShopTab, label: "픽셀아트", icon: Image, color: "text-emerald-400" },
  // 골드 충전 탭 숨김 (2026-06-18 골드 경제 숨김 정책 + 2026-07-29 카카오 심사 대비).
  // 구매 버튼은 핸들러 없는 준비 화면이었으나 KRW 가격표 노출 자체가 "포인트 구매
  // 경로 없음" 방어 논리와 어긋난다. 골드 오픈 시 이 줄 복원.
  // { id: "gold" as ShopTab, label: "골드 충전", icon: Coins, color: "text-yellow-400" },
]

const MOCK_TITLES: TitleItem[] = [
  {
    id: "t1",
    name: "구너 칭호",
    adjTitle: "아스날",
    nounTitle: "구너",
    rarity: "common",
    price: 2_000,
    description: "아스날 팬덤 입문 칭호",
  },
  {
    id: "t2",
    name: "앙리의 후예",
    adjTitle: "앙리의",
    nounTitle: "후예",
    rarity: "rare",
    price: 10_000,
    description: "레전드 선수 헌정 칭호",
    owned: true,
  },
  {
    id: "t3",
    name: "인빈서블",
    adjTitle: "무패의",
    nounTitle: "인빈서블",
    rarity: "epic",
    price: 50_000,
    description: "무패우승 시그니처 칭호",
  },
  {
    id: "t4",
    name: "레드 데빌",
    adjTitle: "레드",
    nounTitle: "데빌",
    rarity: "common",
    price: 2_000,
    description: "맨체스터 유나이티드 팬덤 칭호",
  },
  {
    id: "t5",
    name: "퍼기의 계승자",
    adjTitle: "퍼기의",
    nounTitle: "계승자",
    rarity: "rare",
    price: 10_000,
    description: "레전드 감독 헌정 칭호",
  },
  {
    id: "t6",
    name: "트레블러",
    adjTitle: "역대급",
    nounTitle: "트레블러",
    rarity: "epic",
    price: 50_000,
    description: "3관왕 시그니처 칭호",
  },
]

const GOLD_PACKAGES = [
  { id: "g1", gold: 1_000, krw: 1_000, bonus: null },
  { id: "g2", gold: 5_000, krw: 4_500, bonus: "+10% 보너스" },
  { id: "g3", gold: 10_000, krw: 8_000, bonus: "+25% 보너스" },
  { id: "g4", gold: 50_000, krw: 35_000, bonus: "+40% 보너스" },
]

export default function ShopPage() {
  const [activeTab, setActiveTab] = useState<ShopTab>("stickers")
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [ownedIds, setOwnedIds] = useState<string[]>([])
  const [packs, setPacks] = useState<StickerPack[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"popular" | "newest">("popular")
  const [selectedPack, setSelectedPack] = useState<string | null>(null)

  const loadStickers = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ sort: sortBy })
      if (searchQuery) params.set("q", searchQuery)
      if (selectedPack) params.set("pack_id", selectedPack)
      const res = await fetch(`/api/stickers?${params}`)
      const data = await res.json()
      if (data.stickers) setStickers(data.stickers)
      if (data.ownedIds) setOwnedIds(data.ownedIds)
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }, [sortBy, searchQuery, selectedPack])

  const loadPacks = useCallback(async () => {
    try {
      const res = await fetch("/api/stickers/packs")
      const data = await res.json()
      if (data.packs) setPacks(data.packs)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (activeTab === "stickers") {
      loadStickers()
      loadPacks()
    }
  }, [activeTab, loadStickers, loadPacks])

  const handlePurchase = async (stickerId: string) => {
    try {
      const res = await fetch(`/api/stickers/${stickerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purchase" }),
      })
      const data = await res.json()
      if (data.success) {
        setOwnedIds((prev) => [...prev, stickerId])
        loadStickers()
      }
      return data
    } catch {
      return { success: false, error: "network_error" }
    }
  }

  return (
    <div className="space-y-5">
      {/* ====== 상점 헤더 ====== */}
      <div
        className="rounded-xl px-5 py-4"
        style={{
          background: "var(--wc-card)",
          border: "1px solid var(--wc-line)",
          boxShadow: "var(--wc-shadow-1)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--wc-soft)" }}
          >
            <ShoppingBag className="h-4 w-4" style={{ color: "var(--wc-burgundy)" }} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--wc-ink)" }}>
              아이템 상점
            </h1>
            <p className="text-[12px]" style={{ color: "var(--wc-mute)" }}>
              스티커 · 칭호 · 픽셀아트를 활동 포인트로 구매하세요
            </p>
          </div>
        </div>
      </div>

      {/* ====== 탭 네비게이션 ====== */}
      <div className="flex gap-1" style={{ borderBottom: "1px solid var(--wc-line)" }}>
        {SHOP_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="relative flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors"
            style={
              activeTab === tab.id
                ? { color: "var(--wc-burgundy)", fontWeight: 600 }
                : { color: "var(--wc-mute)" }
            }
          >
            {activeTab === tab.id && (
              <span
                className="absolute right-0 bottom-0 left-0 h-[2px]"
                style={{ background: "var(--wc-burgundy)" }}
              />
            )}
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ====== 스티커 탭 ====== */}
      {activeTab === "stickers" && (
        <div className="space-y-4">
          {/* 도구 바 */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search
                className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                style={{ color: "var(--wc-mute)" }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="스티커 검색..."
                className="w-full rounded-lg py-2 pr-3 pl-10 text-sm outline-none"
                style={{
                  border: "1px solid var(--wc-line-2)",
                  background: "var(--wc-paper)",
                  color: "var(--wc-ink)",
                }}
              />
            </div>
            <div className="flex gap-2">
              <div
                className="flex overflow-hidden rounded-lg"
                style={{ border: "1px solid var(--wc-line)" }}
              >
                <button
                  onClick={() => setSortBy("popular")}
                  className="flex min-h-11 items-center gap-1 px-3 py-2 text-xs font-medium sm:min-h-0"
                  style={
                    sortBy === "popular"
                      ? {
                          background: "var(--wc-soft)",
                          color: "var(--wc-burgundy)",
                          fontWeight: 600,
                        }
                      : { background: "var(--wc-paper)", color: "var(--wc-mute)" }
                  }
                >
                  <TrendingUp className="h-3 w-3" />
                  인기순
                </button>
                <button
                  onClick={() => setSortBy("newest")}
                  className="flex min-h-11 items-center gap-1 px-3 py-2 text-xs font-medium sm:min-h-0"
                  style={
                    sortBy === "newest"
                      ? {
                          background: "var(--wc-soft)",
                          color: "var(--wc-burgundy)",
                          fontWeight: 600,
                        }
                      : { background: "var(--wc-paper)", color: "var(--wc-mute)" }
                  }
                >
                  <Star className="h-3 w-3" />
                  최신순
                </button>
              </div>
              <button
                onClick={() => setShowUpload(true)}
                className="flex min-h-11 items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white transition-all hover:opacity-90 sm:min-h-0"
                style={{ background: "var(--wc-burgundy)" }}
              >
                <Upload className="h-3.5 w-3.5" />
                스티커 만들기
              </button>
            </div>
          </div>

          {/* 팩 필터 */}
          {packs.length > 0 && (
            <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
              <button
                onClick={() => setSelectedPack(null)}
                className="wc-pill-tab min-h-11 shrink-0 sm:min-h-0"
                style={
                  !selectedPack
                    ? { background: "var(--wc-soft)", color: "var(--wc-burgundy)", fontWeight: 600 }
                    : undefined
                }
              >
                전체
              </button>
              {packs.map((pack) => (
                <button
                  key={pack.id}
                  onClick={() => setSelectedPack(pack.id)}
                  className="wc-pill-tab flex min-h-11 shrink-0 items-center gap-1 sm:min-h-0"
                  style={
                    selectedPack === pack.id
                      ? {
                          background: "var(--wc-soft)",
                          color: "var(--wc-burgundy)",
                          fontWeight: 600,
                        }
                      : undefined
                  }
                >
                  <span>{pack.icon_url}</span>
                  {pack.name}
                </button>
              ))}
            </div>
          )}

          {/* 스티커 그리드 */}
          {isLoading ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square animate-pulse rounded-xl"
                  style={{ background: "var(--wc-line)" }}
                />
              ))}
            </div>
          ) : stickers.length === 0 ? (
            <div className="rounded-2xl p-12 text-center" style={{ background: "var(--wc-paper)" }}>
              <div className="text-5xl">🎨</div>
              <p className="mt-3 text-sm font-medium" style={{ color: "var(--wc-mute)" }}>
                아직 스티커가 없습니다
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--wc-mute-2)" }}>
                첫 번째 스티커를 만들어보세요!
              </p>
              <button
                onClick={() => setShowUpload(true)}
                className="mt-4 rounded-lg px-5 py-2 text-sm font-bold text-white hover:opacity-90"
                style={{ background: "var(--wc-burgundy)" }}
              >
                스티커 만들기
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {stickers.map((sticker) => (
                <StickerCard
                  key={sticker.id}
                  sticker={sticker}
                  isOwned={ownedIds.includes(sticker.id)}
                  onPurchase={handlePurchase}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ====== 칭호 탭 ====== */}
      {activeTab === "titles" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {MOCK_TITLES.map((item) => (
            <TitleCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* ====== 픽셀아트 탭 ====== */}
      {activeTab === "pixel-art" && (
        <div className="rounded-2xl p-12 text-center" style={{ background: "var(--wc-paper)" }}>
          <div className="text-5xl">🎮</div>
          <p className="mt-3 text-sm font-medium" style={{ color: "var(--wc-mute)" }}>
            픽셀아트 상점은 준비 중입니다
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--wc-mute-2)" }}>
            나만의 픽셀아트 아이템을 수집하세요
          </p>
        </div>
      )}

      {/* ====== 골드 충전 탭 ====== */}
      {activeTab === "gold" && (
        <div className="space-y-4">
          <div
            className="rounded-xl p-4"
            style={{ background: "var(--wc-soft)", border: "1px solid var(--wc-line)" }}
          >
            <p style={{ fontSize: 13, color: "var(--wc-mute)" }}>
              골드는 스티커, 칭호 등 꾸미기 아이템 구매에 사용됩니다. 결제 후 즉시 지급됩니다.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {GOLD_PACKAGES.map((pkg) => (
              <div
                key={pkg.id}
                className="gn-card-lift"
                style={{
                  border: "1px solid var(--wc-line)",
                  borderRadius: 12,
                  padding: 16,
                  background: "var(--wc-card)",
                }}
              >
                <Coins style={{ width: 22, height: 22, color: "#D97706", marginBottom: 10 }} />
                <p
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: "var(--wc-ink)",
                    fontVariantNumeric: "tabular-nums",
                    marginBottom: 2,
                  }}
                >
                  {pkg.gold.toLocaleString()} 골드
                </p>
                {pkg.bonus && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--wc-burgundy)" }}>
                    {pkg.bonus}
                  </span>
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 14,
                  }}
                >
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: "var(--wc-ink)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    ₩{pkg.krw.toLocaleString()}
                  </span>
                  <button
                    style={{
                      height: 32,
                      padding: "0 14px",
                      display: "inline-flex",
                      alignItems: "center",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      background: "#fff",
                      border: "1px solid var(--wc-line-2)",
                      color: "var(--wc-ink)",
                      cursor: "pointer",
                    }}
                  >
                    구매
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 업로드 다이얼로그 */}
      {showUpload && (
        <StickerUploadDialog
          onClose={() => setShowUpload(false)}
          onCreated={() => {
            setShowUpload(false)
            loadStickers()
          }}
        />
      )}
    </div>
  )
}
