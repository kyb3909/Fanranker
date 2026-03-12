import type { Metadata } from "next"
import { GamesTabNav } from "@/components/games-tab-nav"

export const metadata: Metadata = {
  title: "게임",
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
