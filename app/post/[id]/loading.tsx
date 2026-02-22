import { Loader2 } from "lucide-react"
import { Header } from "@/components/header"

export default function PostLoading() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto px-4 sm:px-6 py-5 sm:py-6 max-w-full sm:max-w-[600px] lg:max-w-[1280px]">
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          <div className="col-span-12 lg:col-span-9 space-y-4">
            {/* 게시글 스켈레톤 */}
            <div className="bg-card border border-border rounded-xl p-6 space-y-4 animate-pulse">
              <div className="h-7 bg-muted rounded w-3/4" />
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 bg-muted rounded-full" />
                <div className="h-4 bg-muted rounded w-24" />
                <div className="h-4 bg-muted rounded w-16" />
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-muted rounded w-full" />
                <div className="h-4 bg-muted rounded w-full" />
                <div className="h-4 bg-muted rounded w-2/3" />
              </div>
            </div>
            {/* 댓글 스켈레톤 */}
            <div className="bg-card border border-border rounded-xl p-6 space-y-4 animate-pulse">
              <div className="h-5 bg-muted rounded w-20" />
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-8 w-8 bg-muted rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-24" />
                      <div className="h-4 bg-muted rounded w-full" />
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
