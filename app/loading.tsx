export default function HomeLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <div className="h-14 border-b border-border bg-card" />

      <main className="mx-auto px-4 sm:px-6 py-5 sm:py-6 max-w-full sm:max-w-[600px] lg:max-w-[1280px]">
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          {/* Left sidebar skeleton */}
          <aside className="hidden lg:block col-span-3">
            <div className="bg-card border border-border rounded-xl p-4 space-y-3 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/2" />
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-muted rounded" />
                  <div className="h-3 bg-muted rounded flex-1" />
                </div>
              ))}
            </div>
          </aside>

          {/* Main content skeleton */}
          <div className="col-span-12 lg:col-span-6 space-y-4">
            {/* Tab skeleton */}
            <div className="bg-card rounded-xl border border-border p-3 animate-pulse">
              <div className="flex gap-4 justify-center">
                <div className="h-8 bg-muted rounded w-20" />
                <div className="h-8 bg-muted rounded w-24" />
              </div>
            </div>

            {/* Post skeletons */}
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-muted rounded-full" />
                  <div className="h-3 bg-muted rounded w-24" />
                  <div className="h-3 bg-muted rounded w-16 ml-auto" />
                </div>
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            ))}
          </div>

          {/* Right sidebar skeleton */}
          <aside className="hidden lg:block col-span-3">
            <div className="bg-card border border-border rounded-xl p-4 space-y-3 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/2" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-2 bg-muted rounded w-1/3" />
                </div>
              ))}
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
