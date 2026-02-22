import { Header } from "@/components/header"

export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto px-4 sm:px-6 py-5 sm:py-6 max-w-full sm:max-w-[600px] lg:max-w-[1280px]">
        <div className="bg-card border border-border rounded-xl p-6 animate-pulse">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-20 w-20 bg-muted rounded-full" />
            <div className="space-y-2">
              <div className="h-6 bg-muted rounded w-32" />
              <div className="h-4 bg-muted rounded w-48" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-3/4" />
          </div>
        </div>
      </main>
    </div>
  )
}
