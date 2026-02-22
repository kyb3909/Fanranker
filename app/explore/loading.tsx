import { Header } from "@/components/header"

export default function ExploreLoading() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto px-4 sm:px-6 py-5 sm:py-6 max-w-full sm:max-w-[600px] lg:max-w-[1280px]">
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          <div className="col-span-12 lg:col-span-9 space-y-4">
            {/* 게시판 그리드 스켈레톤 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 animate-pulse">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <div className="h-8 w-8 bg-muted rounded" />
                  <div className="h-4 bg-muted rounded w-16" />
                  <div className="h-3 bg-muted rounded w-12" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
