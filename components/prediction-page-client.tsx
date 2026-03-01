"use client"

import dynamic from "next/dynamic"

function PredictionSkeleton() {
  return (
    <div className="w-full animate-pulse">
      {/* Header tabs skeleton */}
      <div className="mb-4 space-y-3">
        <div className="bg-muted/50 flex gap-1 rounded-lg p-1">
          {["w-20", "w-16", "w-24"].map((w, i) => (
            <div key={i} className={`h-9 ${w} bg-muted rounded-md`} />
          ))}
        </div>
        {/* Sport filter pills */}
        <div className="flex gap-2">
          {["w-14", "w-12", "w-12", "w-12", "w-12"].map((w, i) => (
            <div key={i} className={`h-8 ${w} bg-muted rounded-full`} />
          ))}
        </div>
      </div>

      {/* Today's matches header */}
      <div className="border-accent/30 bg-accent/5 mb-2 rounded-lg border px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-muted h-7 w-7 rounded-full" />
            <div className="bg-muted h-4 w-24 rounded" />
          </div>
          <div className="bg-muted h-3 w-28 rounded" />
        </div>
      </div>

      {/* Match cards skeleton */}
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border-border overflow-hidden rounded-lg border shadow-sm">
            {/* Card header - league info */}
            <div className="bg-muted/40 flex items-center justify-between px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                <div className="bg-muted h-5 w-5 rounded-full" />
                <div className="bg-muted h-3 w-16 rounded" />
              </div>
              <div className="bg-muted h-3 w-20 rounded" />
            </div>
            {/* Teams */}
            <div className="flex items-center justify-center gap-3 px-3 py-2">
              <div className="bg-muted h-4 w-24 rounded" />
              <span className="text-muted-foreground text-xs">vs</span>
              <div className="bg-muted h-4 w-24 rounded" />
            </div>
            {/* Betting options */}
            <div className="space-y-1.5 px-2 pb-2">
              <div className="bg-muted/30 rounded-lg border p-1.5">
                <div className="bg-muted mb-1.5 h-3 w-12 rounded" />
                <div className="grid grid-cols-3 gap-1">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="bg-muted/60 h-12 rounded-md" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const BettingPage = dynamic(() => import("@/components/betting-page"), {
  loading: () => <PredictionSkeleton />,
  ssr: false,
})

export function PredictionPageClient() {
  return <BettingPage />
}
