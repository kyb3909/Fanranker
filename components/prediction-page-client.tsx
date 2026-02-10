"use client"

import dynamic from "next/dynamic"

const BettingPage = dynamic(
  () => import("@/components/betting-page"),
  {
    loading: () => (
      <div className="bg-card border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-1/3 mb-4" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted rounded" />
          ))}
        </div>
      </div>
    ),
    ssr: false,
  }
)

export function PredictionPageClient() {
  return <BettingPage />
}
