"use client"

import dynamic from "next/dynamic"

function GalcupSkeleton() {
  return (
    <div className="w-full animate-pulse space-y-4">
      <div className="bg-muted h-16 rounded-xl" />
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-muted h-8 w-16 rounded-full" />
        ))}
      </div>
      <div className="bg-muted h-40 rounded-xl" />
      <div className="bg-muted h-40 rounded-xl" />
    </div>
  )
}

const GalcupPage = dynamic(() => import("@/components/galcup/galcup-page"), {
  loading: () => <GalcupSkeleton />,
  ssr: false,
})

export function GalcupPageClient() {
  return <GalcupPage />
}
