export default function ExploreLoading() {
  return (
    <div className="bg-background min-h-screen">
      <main className="mx-auto max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]">
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          <div className="col-span-12 space-y-4 lg:col-span-9">
            {/* 게시판 그리드 스켈레톤 */}
            <div className="grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-card border-border space-y-2 rounded-xl border p-4">
                  <div className="bg-muted h-8 w-8 rounded" />
                  <div className="bg-muted h-4 w-16 rounded" />
                  <div className="bg-muted h-3 w-12 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
