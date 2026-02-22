import { Loader2 } from "lucide-react"
import { Header } from "@/components/header"

export default function CommunityLoading() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto px-4 sm:px-6 py-5 sm:py-6 max-w-full sm:max-w-[600px] lg:max-w-[1280px]">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </main>
    </div>
  )
}
