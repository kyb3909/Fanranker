import { BackButton } from "@/components/back-button"
import { Card } from "@/components/ui/card"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "게시물 운영정책",
  alternates: { canonical: "/content-policy" },
}

export default function ContentPolicyPage() {
  return (
    <main id="main-content" className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-6" tabIndex={-1}>
      <BackButton />
      <Card className="border-border bg-card mt-4 border p-6">
        <h1 className="text-foreground mb-4 text-2xl font-bold">게시물 운영정책</h1>
        <p className="text-muted-foreground leading-relaxed">
          게시물 운영정책 내용이 여기에 표시됩니다.
        </p>
      </Card>
    </main>
  )
}
