import { fetchCardNews } from "@/lib/feed/cardnews"
import { CardNewsFeed } from "@/components/cardnews/card-news-feed"

export const dynamic = "force-dynamic"

// 홈 카드뉴스 피드 교체 전 테스트 페이지 — 검색 노출 차단
export const metadata = {
  title: "카드뉴스 (테스트)",
  robots: { index: false, follow: false },
}

export default async function CardNewsPage() {
  const { cards, nextCursor } = await fetchCardNews()

  return (
    <div className="min-h-[100dvh]" style={{ background: "#F3F4F6" }}>
      <main id="main-content" className="mx-auto max-w-[600px] px-3 py-3" tabIndex={-1}>
        <h1 className="sr-only">카드뉴스 피드 — gongnori.fan</h1>
        <CardNewsFeed initialCards={cards} initialCursor={nextCursor} />
      </main>
    </div>
  )
}
