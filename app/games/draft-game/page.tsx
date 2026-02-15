import type { Metadata } from "next"
import { Gamepad2 } from "lucide-react"

export const metadata: Metadata = {
  title: "드래프트 게임",
}

export default function GamesDraftGamePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <Gamepad2 className="w-12 h-12 text-muted-foreground mb-4" aria-hidden />
      <h1 className="text-xl font-semibold text-foreground mb-2">드래프트 게임</h1>
      <p className="text-muted-foreground">준비 중입니다.</p>
    </div>
  )
}
