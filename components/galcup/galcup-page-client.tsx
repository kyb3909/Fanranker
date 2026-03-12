"use client"

import dynamic from "next/dynamic"

function GalcupSkeleton() {
  return (
    <div className="w-full animate-pulse space-y-4">
      <div className="h-52 rounded-2xl bg-[#1a2332]" />
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-muted h-8 w-16 rounded-full" />
        ))}
      </div>
      <div className="h-36 rounded-2xl bg-[#1a2332]" />
      <div className="h-36 rounded-2xl bg-[#1a2332]" />
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
