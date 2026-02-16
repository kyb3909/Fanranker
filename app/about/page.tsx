import { Header } from "@/components/header"
import { BackButton } from "@/components/back-button"
import { Card } from "@/components/ui/card"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "회사 소개",
  description: "FanRanker 소개 - 스포츠 예측 커뮤니티 플랫폼",
  alternates: { canonical: '/about' },
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main id="main-content" className="mx-auto px-4 sm:px-6 py-5 sm:py-6 max-w-2xl" tabIndex={-1}>
        <BackButton />
        <Card className="border border-border bg-card p-6 mt-4">
          <h1 className="text-2xl font-bold text-foreground mb-4">회사 소개</h1>
          <p className="text-muted-foreground leading-relaxed">
            스포츠 예측 커뮤니티 플랫폼입니다.
          </p>
        </Card>
      </main>
    </div>
  )
}
