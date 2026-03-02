export default function ProfileLoading() {
  return (
    <div className="bg-background min-h-screen">
      <main className="mx-auto max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]">
        <div className="bg-card border-border animate-pulse rounded-xl border p-6">
          <div className="mb-6 flex items-center gap-4">
            <div className="bg-muted h-20 w-20 rounded-full" />
            <div className="space-y-2">
              <div className="bg-muted h-6 w-32 rounded" />
              <div className="bg-muted h-4 w-48 rounded" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="bg-muted h-4 w-full rounded" />
            <div className="bg-muted h-4 w-3/4 rounded" />
          </div>
        </div>
      </main>
    </div>
  )
}
