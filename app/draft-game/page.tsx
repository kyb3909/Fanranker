import { Suspense } from "react"
import { Header } from "@/components/header"
import { CommunitySidebar } from "@/components/community-sidebar"
import { ActivitySidebar } from "@/components/activity-sidebar"
import { Gamepad2 } from "lucide-react"

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

export default function DraftGamePage() {
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

          <div className="col-span-12 lg:col-span-6 flex flex-col items-center justify-center min-h-[50vh] text-center">
            <Gamepad2 className="w-12 h-12 text-muted-foreground mb-4" aria-hidden />
            <h1 className="text-xl font-semibold text-foreground mb-2">드래프트 게임</h1>
            <p className="text-muted-foreground">준비 중입니다.</p>
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
