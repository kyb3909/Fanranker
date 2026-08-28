import type { Metadata } from "next"
import { StadiumWalk } from "@/components/metaverse/avatar3d/stadium-walk"

export const metadata: Metadata = {
  title: "경기장 워크 데모",
  description: "치비 아바타가 경기장을 돌아다니는 동작을 검수하는 개발용 공간입니다.",
  robots: { index: false, follow: false },
}

export default function StadiumWalkPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 lg:px-8 dark:bg-slate-900 dark:text-slate-50">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <p className="mb-2 text-xs font-bold tracking-[0.22em] text-indigo-600 uppercase dark:text-indigo-400">
            Avatar R&amp;D · Phase 3
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">경기장 워크 데모</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            아바타 랩에서 만든 캐릭터가 경기장 안을 실제로 걷고 뛰는지 검수합니다. 이동에 따라
            걷기·달리기 모션이 자동 전환되고, 슛·점프·환호는 액션 키로 재생됩니다.
          </p>
        </header>

        <StadiumWalk />
      </div>
    </main>
  )
}
