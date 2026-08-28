import type { Metadata } from "next"
import { AvatarLab } from "@/components/metaverse/avatar3d/avatar-lab"

export const metadata: Metadata = {
  title: "치비 캐릭터·유니폼 랩",
  description: "3D 치비 캐릭터의 유니폼 미리보기·구매·착용 흐름을 검수하는 개발용 공간입니다.",
  robots: { index: false, follow: false },
}

export default function AvatarLabPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 lg:px-8 dark:bg-slate-900 dark:text-slate-50">
      <link
        rel="preload"
        href="/metaverse/avatar3d/colin-avatar-v1.glb"
        as="fetch"
        type="model/gltf-binary"
        crossOrigin="anonymous"
      />
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <p className="mb-2 text-xs font-bold tracking-[0.22em] text-indigo-600 uppercase dark:text-indigo-400">
            Avatar R&amp;D · Phase 2
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">치비 캐릭터 유니폼 랩</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Stadium과 분리된 캐릭터 전용 실험실입니다. 저폴리 GLB에 오리지널 축구 유니폼을 미리 입혀
            보고, 구매·보유·착용 흐름을 검수합니다.
          </p>
        </header>

        <AvatarLab />
      </div>
    </main>
  )
}
