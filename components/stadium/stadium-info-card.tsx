"use client"

import { useEffect, useState } from "react"
import { LogIn, Landmark, Lock } from "lucide-react"
import type { MapPin } from "@/types/stadium"

interface StadiumInfoCardProps {
  pin: MapPin
  screenX: number
  screenY: number
  onClose: () => void
  onEnter: () => void
  onInvest: () => void
}

export function StadiumInfoCard({
  pin,
  screenX,
  screenY,
  onClose,
  onEnter,
  onInvest,
}: StadiumInfoCardProps) {
  const [barWidth, setBarWidth] = useState(0)
  const canEnter = pin.level >= 10

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setBarWidth(pin.progress_pct)
    })
    return () => cancelAnimationFrame(raf)
  }, [pin.progress_pct])

  return (
    <>
      <div className="absolute inset-0 z-10" onClick={onClose} />

      <div
        className="animate-in fade-in zoom-in-95 absolute z-20 w-[220px] duration-200"
        style={{
          left: screenX,
          top: screenY - 14,
          transform: "translate(-50%, -100%)",
        }}
      >
        {/* Card body */}
        <div
          className="overflow-hidden rounded-2xl border-2 p-[3px]"
          style={{
            borderColor: pin.color + "40",
            background: `linear-gradient(135deg, ${pin.color}15, transparent 60%)`,
          }}
        >
          <div className="bg-card rounded-xl p-3.5">
            {/* Header */}
            <div className="flex items-start gap-2.5">
              <div
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: pin.color + "18" }}
              >
                {canEnter ? (
                  <Landmark className="h-4 w-4" style={{ color: pin.color }} />
                ) : (
                  <Lock className="text-muted-foreground h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-foreground text-[13px] leading-tight font-bold">{pin.name}</p>
                <p className="text-muted-foreground mt-0.5 text-[11px]">{pin.team_name}</p>
              </div>
            </div>

            {/* Progress section */}
            <div className="mt-3 rounded-lg bg-[#f5f5f5] px-3 py-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-foreground font-bold">Lv.{pin.level}</span>
                <span className="text-muted-foreground">
                  {pin.level === 0 ? "미착공" : `${Math.round(pin.progress_pct)}%`}
                </span>
              </div>
              <div className="mt-1.5 h-[6px] overflow-hidden rounded-full bg-[#e5e5e5]">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: pin.color,
                  }}
                />
              </div>
            </div>

            {/* Action */}
            <div className="mt-3">
              {canEnter ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onEnter()
                  }}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold transition-colors"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  경기장 입장
                </button>
              ) : (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onInvest()
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold text-white transition-colors"
                    style={{ backgroundColor: pin.color }}
                  >
                    <Landmark className="h-3.5 w-3.5" />
                    부지 매입
                  </button>
                  <p className="text-muted-foreground mt-1.5 text-center text-[10px]">
                    투자하여 경기장 건설에 참여하세요
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex justify-center">
          <div className="border-t-card h-0 w-0 border-x-[7px] border-t-[7px] border-x-transparent" />
        </div>
      </div>
    </>
  )
}
