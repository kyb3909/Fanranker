"use client"

import { useRouter } from "next/navigation"
import Image from "next/image"
import { ArrowLeft, Lock, MapPin } from "lucide-react"
import Link from "@/components/ui/app-link"
import { REGIONS, type Region } from "@/lib/stadium/regions"
import { cn } from "@/lib/utils"

function RegionCard({ region }: { region: Region }) {
  const router = useRouter()

  if (region.comingSoon) {
    return (
      <div className="border-border bg-card overflow-hidden rounded-xl border opacity-60">
        <div className="bg-muted flex aspect-[3/2] items-center justify-center">
          <Lock className="text-muted-foreground/30 h-6 w-6" />
        </div>
        <div className="p-3">
          <p className="text-muted-foreground text-sm font-bold">{region.name}</p>
          <p className="text-muted-foreground/60 text-[11px]">{region.league}</p>
          <span className="bg-muted text-muted-foreground/50 mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px]">
            Coming Soon
          </span>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => router.push(`/stadium/map/${region.id}`)}
      className={cn(
        "border-border bg-card group overflow-hidden rounded-xl border text-left",
        "hover:border-primary/40 hover:shadow-primary/5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
      )}
    >
      <div className="relative aspect-[3/2] overflow-hidden">
        <Image
          src={region.thumbnailImage}
          alt={region.nameEn}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 480px) 50vw, (max-width: 768px) 33vw, 25vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        <div className="absolute bottom-2 left-2">
          <p className="text-sm font-bold text-white drop-shadow-sm">{region.name}</p>
          <p className="text-[11px] text-white/70">{region.league}</p>
        </div>
      </div>
    </button>
  )
}

export function RegionGrid() {
  return (
    <div className="bg-background flex min-h-[100dvh] flex-col">
      {/* Header */}
      <div className="border-border flex items-center gap-2 border-b px-4 py-3">
        <Link href="/" className="text-muted-foreground hover:text-foreground p-1">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-1.5">
          <MapPin className="text-primary h-4 w-4" />
          <h1 className="text-foreground text-base font-bold">Stadium Map</h1>
        </div>
      </div>

      {/* Subtitle */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-muted-foreground text-xs">지역을 선택하세요</p>
      </div>

      {/* Grid */}
      <div className="mx-auto w-full max-w-2xl px-4 pb-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {REGIONS.map((region) => (
            <RegionCard key={region.id} region={region} />
          ))}
        </div>
      </div>
    </div>
  )
}
