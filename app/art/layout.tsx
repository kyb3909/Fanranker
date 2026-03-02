import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "아트",
  description: "디지털 아트 갤러리 - 일러스트, 캐릭터 디자인, 컨셉 아트 작품을 탐색하세요",
  alternates: { canonical: "/art" },
}

export default function ArtLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="main-content"
      className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 sm:py-6"
      tabIndex={-1}
    >
      {children}
    </main>
  )
}
