import { Suspense } from "react"
import { Header } from "@/components/header"
import { CommunitySidebar } from "@/components/community-sidebar"
import { ActivitySidebar } from "@/components/activity-sidebar"
import { PredictionPageClient } from "@/components/prediction-page-client"

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

export default function PredictionPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main id="main-content" className="mx-auto px-4 sm:px-6 py-5 sm:py-6 max-w-full sm:max-w-[600px] lg:max-w-[1280px]" tabIndex={-1}>
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          <aside className="hidden lg:block col-span-3">
            <Suspense fallback={<SidebarSkeleton />}>
              <CommunitySidebar />
            </Suspense>
          </aside>

          <div className="col-span-12 lg:col-span-6">
            <PredictionPageClient />
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
