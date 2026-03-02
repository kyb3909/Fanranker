import type { Metadata } from "next"
import { Suspense } from "react"
import { GamesTabNav } from "@/components/games-tab-nav"
import { ActivitySidebar } from "@/components/activity-sidebar"

export const metadata: Metadata = {
  title: "게임",
}

function SidebarSkeleton() {
  return (
    <div className="bg-card border-border animate-pulse rounded-xl border p-4">
      <div className="bg-muted mb-4 h-4 w-1/2 rounded" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="bg-muted h-6 w-6 rounded" />
            <div className="bg-muted h-3 flex-1 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="main-content"
      className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 sm:py-6"
      tabIndex={-1}
    >
      <GamesTabNav />
      <div className="grid grid-cols-12 gap-5 lg:gap-6">
        <div className="col-span-12 min-w-0 overflow-hidden lg:col-span-9">{children}</div>
        <aside className="col-span-3 hidden lg:block">
          <Suspense fallback={<SidebarSkeleton />}>
            <ActivitySidebar />
          </Suspense>
        </aside>
      </div>
    </main>
  )
}
