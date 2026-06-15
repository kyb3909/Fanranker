import type { Metadata } from "next"
import { GamesTabNav } from "@/components/games-tab-nav"

export const metadata: Metadata = {
  title: "게임",
  description: "드래프트, 코너킥 히어로, 론도 등 여러 미니게임을 즐겨보세요.",
}

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="main-content"
      className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 sm:py-6"
      tabIndex={-1}
    >
      <GamesTabNav />
      {children}
    </main>
  )
}
