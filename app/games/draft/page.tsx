import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "드래프트 게임",
  description: "스네이크 드래프트로 나만의 드림팀을 만들어보세요.",
}

export default function GamesDraftPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <div className="flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-[#0a1a2a] via-[#0f2b1a] to-[#0a1a2a] p-16 text-center shadow-xl">
        <div className="text-5xl">📋</div>
        <h1 className="mt-4 text-xl font-black text-white">드래프트 게임</h1>
        <p className="mt-2 text-sm text-white/50">
          곧 출시됩니다! 스네이크 드래프트로 나만의 드림팀을 만들어보세요.
        </p>
        <span className="mt-4 inline-block rounded-full bg-emerald-500/20 px-4 py-1.5 text-xs font-bold text-emerald-400">
          COMING SOON
        </span>
      </div>
    </main>
  )
}
