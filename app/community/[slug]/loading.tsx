import { Loader2 } from "lucide-react"

export default function CommunityLoading() {
  return (
    <div className="bg-background min-h-screen">
      <main className="mx-auto max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      </main>
    </div>
  )
}
