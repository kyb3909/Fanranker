import type { Metadata } from "next"
import { Suspense } from "react"
import { Header } from "@/components/header"
import { GamesTabNav } from "@/components/games-tab-nav"
import { ActivitySidebar } from "@/components/activity-sidebar"

export const metadata: Metadata = {
  title: "게임",
}

function SidebarSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 animate-pulse">
      <div className="h-4 bg-muted rounded w-1/2 mb-4" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-6 h-6 bg-muted rounded" />
            <div className="h-3 bg-muted rounded flex-1" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <GamesTabNav />
      <main className="mx-auto max-w-[1280px] px-4 sm:px-6 py-5 sm:py-6">
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          <div className="col-span-12 lg:col-span-9">
            {children}
          </div>
          <aside className="hidden lg:block col-span-3">
            <Suspense fallback={<SidebarSkeleton />}>
              <ActivitySidebar />
            </Suspense>
          </aside>
        </div>
      </main>
    </div>
  )
}
