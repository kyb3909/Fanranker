import { BackButton } from "@/components/back-button"
import { Card } from "@/components/ui/card"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "회사 소개",
  description: "FanRanker 소개 - 스포츠 예측 커뮤니티 플랫폼",
  alternates: { canonical: "/about" },
}

export default function AboutPage() {
  return (
    <main id="main-content" className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-6" tabIndex={-1}>
      <BackButton />
      <Card className="border-border bg-card mt-4 border p-6">
        <h1 className="text-foreground mb-4 text-2xl font-bold">회사 소개</h1>
        <p className="text-muted-foreground leading-relaxed">스포츠 예측 커뮤니티 플랫폼입니다.</p>
      </Card>
    </main>
  )
}
