"use client"

import dynamic from "next/dynamic"

function WorldcupSkeleton() {
  return (
    <div className="w-full animate-pulse space-y-4">
      <div className="bg-muted h-16 rounded-xl" />
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-muted h-8 w-16 rounded-full" />
        ))}
      </div>
      <div className="bg-muted/50 h-12 rounded-xl" />
      <div className="bg-muted h-32 rounded-xl" />
      <div className="bg-muted h-32 rounded-xl" />
    </div>
  )
}

const WorldcupPage = dynamic(() => import("@/components/worldcup/worldcup-page"), {
  loading: () => <WorldcupSkeleton />,
  ssr: false,
})

export function WorldcupPageClient() {
  return <WorldcupPage />
}
