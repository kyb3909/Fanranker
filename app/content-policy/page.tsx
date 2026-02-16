import { Header } from "@/components/header"
import { BackButton } from "@/components/back-button"
import { Card } from "@/components/ui/card"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "게시물 운영정책",
  alternates: { canonical: '/content-policy' },
}

export default function ContentPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main id="main-content" className="mx-auto px-4 sm:px-6 py-5 sm:py-6 max-w-2xl" tabIndex={-1}>
        <BackButton />
        <Card className="border border-border bg-card p-6 mt-4">
          <h1 className="text-2xl font-bold text-foreground mb-4">게시물 운영정책</h1>
          <p className="text-muted-foreground leading-relaxed">
            게시물 운영정책 내용이 여기에 표시됩니다.
          </p>
        </Card>
      </main>
    </div>
  )
}
