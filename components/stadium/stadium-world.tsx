"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import useSWR from "swr"
import { useAuth, useClerk } from "@clerk/nextjs"
import { Lock, MapPin } from "lucide-react"
import { REGIONS, type Region } from "@/lib/stadium/regions"
import { STADIUM_LEVELS } from "@/lib/constants/stadium-levels"
import { RegionMap } from "./region-map"
import type { MapPin as MapPinType } from "@/types/stadium"
import { InvestDialog } from "./invest-dialog"
import { cn } from "@/lib/utils"
import { fetcher } from "@/lib/swr"

// ─── Types ──────────────────────────────────────────
type AnimState = "idle" | "expanding" | "open" | "collapsing"

interface TeamData {
  team_id: string
  team_name: string
  team_short_name: string
  city: string
  pin_x: number
  pin_y: number
  color: string
  stadium_name: string | null
  stadium: { level: number; total_points: number; fan_count: number }
}

// ─── Helpers ────────────────────────────────────────
function calcProgressPct(level: number, totalPoints: number): number {
  const current = STADIUM_LEVELS.find((l) => l.level === level)
  const next = STADIUM_LEVELS.find((l) => l.level === level + 1)
  if (!current || !next) return level >= 10 ? 100 : 0
  const range = next.requiredPoints - current.requiredPoints
  if (range <= 0) return 100
  return Math.min(100, ((totalPoints - current.requiredPoints) / range) * 100)
}

const ANIM_DURATION = 400
const MODAL_MARGIN = 16
const IMG_ASPECT = 2528 / 1684 // england.png aspect ratio

// 핀별 커스텀 이미지 (경기장 일러스트)
const PIN_IMAGES: Record<string, string> = {
  epl_wembley: "/map/pins/wembley.webp",
}

// ─── Region Card (Game Item Style) ──────────────────
function RegionCard({
  region,
  cardRef,
  onSelect,
}: {
  region: Region
  cardRef: (el: HTMLButtonElement | null) => void
  onSelect: () => void
}) {
  if (region.comingSoon) {
    return (
      <div className="flex flex-col items-center rounded-xl border-2 border-[#3a3a3a] bg-[#1a1a1a] p-2.5 opacity-40">
        <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-[#252525]">
          <Lock className="h-8 w-8 text-[#555]" />
        </div>
        <div className="mt-2 w-full text-center">
          <p className="text-xs font-bold text-[#888]">{region.name}</p>
          <p className="text-[10px] text-[#555]">{region.league}</p>
        </div>
      </div>
    )
  }

  return (
    <button
      ref={cardRef}
      onClick={onSelect}
      className={cn(
        "group flex flex-col items-center rounded-xl border-2 border-[#4a3a2a] bg-[#1c1814] p-2.5 text-left",
        "shadow-[0_0_12px_rgba(180,120,60,0.15)] transition-all duration-200",
        "hover:scale-[1.03] hover:border-[#c8944a] hover:shadow-[0_0_20px_rgba(200,148,74,0.3)]",
        "focus-visible:ring-2 focus-visible:ring-[#c8944a] focus-visible:outline-none"
      )}
    >
      {/* 이미지 — 안쪽 라운드, 꽉 채움 */}
      <div className="relative w-full overflow-hidden rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={region.thumbnailImage}
          alt={region.nameEn}
          className="block aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-110"
        />
        {/* 하단 그라디언트 */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-2 pt-6 pb-2">
          <p className="text-[13px] font-extrabold tracking-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            {region.name}
          </p>
        </div>
      </div>
      {/* 하단 라벨 */}
      <div className="mt-1.5 w-full text-center">
        <p className="text-[10px] font-semibold tracking-wide text-[#c8944a]">{region.league}</p>
      </div>
    </button>
  )
}

// ─── Map Data Hook ──────────────────────────────────
function useMapPins(leagueId: string | null) {
  const { data } = useSWR(leagueId ? `/api/stadiums/map?league=${leagueId}` : null, fetcher, {
    revalidateOnFocus: false,
  })

  const teams: TeamData[] = data?.teams ?? []

  return teams.map(
    (t): MapPinType => ({
      team_id: t.team_id,
      name: t.stadium_name || t.city,
      team_name: t.team_name,
      team_short_name: t.team_short_name,
      pin_x: t.pin_x,
      pin_y: t.pin_y,
      color: t.color,
      level: t.stadium.level,
      total_points: t.stadium.total_points,
      fan_count: t.stadium.fan_count,
      progress_pct: calcProgressPct(t.stadium.level, t.stadium.total_points),
      pinImage: PIN_IMAGES[t.team_id],
    })
  )
}

// ─── Main Component ─────────────────────────────────
export function StadiumWorld() {
  const { isSignedIn } = useAuth()
  const { openSignIn } = useClerk()
  const [activeRegion, setActiveRegion] = useState<Region | null>(null)
  const [animState, setAnimState] = useState<AnimState>("idle")
  const [overlayRect, setOverlayRect] = useState({ top: 0, left: 0, width: 0, height: 0 })
  const openRectRef = useRef({ top: 0, left: 0, width: 0, height: 0 })
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Invest dialog
  const [investTarget, setInvestTarget] = useState<MapPinType | null>(null)

  // Earnings for investment
  const { data: earningsData, mutate: mutateEarnings } = useSWR(
    isSignedIn ? "/api/stadiums/my-earnings" : null,
    fetcher,
    { revalidateOnFocus: false }
  )
  const availablePoints = earningsData?.available ?? 0

  // Fetch pins when a region is active
  const pins = useMapPins(activeRegion?.leagueId ?? null)

  // ─── Open Region ──────────────────────────
  const openRegion = useCallback((region: Region) => {
    const el = cardRefs.current[region.id]
    if (!el) return

    const rect = el.getBoundingClientRect()
    const startRect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    openRectRef.current = startRect
    setOverlayRect(startRect)
    setActiveRegion(region)
    setAnimState("expanding")

    // Calculate modal size to match image aspect ratio (no white gaps)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const m = MODAL_MARGIN
        const maxW = window.innerWidth - m * 2
        const maxH = window.innerHeight - m * 2
        let w: number, h: number
        if (maxW / maxH > IMG_ASPECT) {
          h = maxH
          w = maxH * IMG_ASPECT
        } else {
          w = maxW
          h = maxW / IMG_ASPECT
        }
        setOverlayRect({
          top: (window.innerHeight - h) / 2,
          left: (window.innerWidth - w) / 2,
          width: w,
          height: h,
        })
      })
    })

    timerRef.current = setTimeout(() => setAnimState("open"), ANIM_DURATION)
  }, [])

  // ─── Close Region ─────────────────────────
  const closeRegion = useCallback(() => {
    setAnimState("collapsing")
    setOverlayRect(openRectRef.current)

    timerRef.current = setTimeout(() => {
      setAnimState("idle")
      setActiveRegion(null)
    }, ANIM_DURATION)
  }, [])

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const isOverlayVisible = animState !== "idle"
  const isCanvasVisible = animState === "open"

  return (
    <div>
      {/* ── Grid ── */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-1.5">
          <MapPin className="text-primary h-4 w-4" />
          <h1 className="text-foreground text-base font-bold">Stadium Map</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">지역을 선택하세요</p>
      </div>

      {/* Cards */}
      <div className="mx-auto w-full max-w-2xl px-4 pb-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {REGIONS.map((region) => (
            <RegionCard
              key={region.id}
              region={region}
              cardRef={(el) => {
                cardRefs.current[region.id] = el
              }}
              onSelect={() => openRegion(region)}
            />
          ))}
        </div>
      </div>

      {/* ── Backdrop ── */}
      {isOverlayVisible && (
        <div
          className="fixed inset-0 z-[99] bg-black/50 transition-opacity"
          style={{
            opacity: animState === "collapsing" ? 0 : 1,
            transitionDuration: `${ANIM_DURATION}ms`,
            pointerEvents: animState === "open" ? "auto" : "none",
          }}
          onClick={closeRegion}
        />
      )}

      {/* ── Map Modal ── */}
      {isOverlayVisible && activeRegion && (
        <div
          className="border-border bg-card fixed z-[100] overflow-hidden border shadow-2xl"
          style={{
            top: overlayRect.top,
            left: overlayRect.left,
            width: overlayRect.width,
            height: overlayRect.height,
            borderRadius: 16,
            transition: `all ${ANIM_DURATION}ms cubic-bezier(0.33, 1, 0.68, 1)`,
          }}
        >
          {/* Map image — visible during expand/collapse animation */}
          {!isCanvasVisible && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={activeRegion.mapImage}
              alt={activeRegion.nameEn}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}

          {/* Canvas map — visible when fully open */}
          {isCanvasVisible && (
            <RegionMap
              regionName={activeRegion.nameEn}
              league={activeRegion.league}
              mapImage={activeRegion.mapImage}
              pins={pins}
              onBack={closeRegion}
              onInvest={(pin) => {
                if (!isSignedIn) {
                  openSignIn()
                  return
                }
                setInvestTarget(pin)
              }}
            />
          )}

          {/* Title during expand animation */}
          {animState === "expanding" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-card/90 rounded-2xl px-8 py-5 text-center shadow-lg backdrop-blur-sm">
                <h1 className="text-foreground text-2xl font-bold">{activeRegion.nameEn}</h1>
                <p className="text-muted-foreground mt-1 text-sm">{activeRegion.league}</p>
              </div>
            </div>
          )}
        </div>
      )}
      {/* ── Invest Dialog ── */}
      {investTarget && (
        <InvestDialog
          open={!!investTarget}
          onOpenChange={(open) => {
            if (!open) setInvestTarget(null)
          }}
          teamId={investTarget.team_id}
          teamName={investTarget.team_name}
          availablePoints={availablePoints}
          onSuccess={() => {
            setInvestTarget(null)
            mutateEarnings()
          }}
        />
      )}
    </div>
  )
}
