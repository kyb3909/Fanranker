export default function PostLoading() {
  return (
    <div className="bg-background min-h-screen">
      <main className="mx-auto max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]">
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          <div className="col-span-12 space-y-4 lg:col-span-9">
            {/* 게시글 스켈레톤 */}
            <div className="bg-card border-border animate-pulse space-y-4 rounded-xl border p-6">
              <div className="bg-muted h-7 w-3/4 rounded" />
              <div className="flex items-center gap-2">
                <div className="bg-muted h-8 w-8 rounded-full" />
                <div className="bg-muted h-4 w-24 rounded" />
                <div className="bg-muted h-4 w-16 rounded" />
              </div>
              <div className="space-y-2">
                <div className="bg-muted h-4 w-full rounded" />
                <div className="bg-muted h-4 w-full rounded" />
                <div className="bg-muted h-4 w-2/3 rounded" />
              </div>
            </div>
            {/* 댓글 스켈레톤 */}
            <div className="bg-card border-border animate-pulse space-y-4 rounded-xl border p-6">
              <div className="bg-muted h-5 w-20 rounded" />
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="bg-muted h-8 w-8 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="bg-muted h-4 w-24 rounded" />
                      <div className="bg-muted h-4 w-full rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
