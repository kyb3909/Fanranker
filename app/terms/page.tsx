import { BackButton } from "@/components/back-button"
import { Card } from "@/components/ui/card"
import { TermsContent } from "@/components/legal/terms-content"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "이용약관",
  alternates: { canonical: "/terms" },
}

export default function TermsPage() {
  return (
    <main id="main-content" className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-6" tabIndex={-1}>
      <BackButton />
      <Card className="border-border bg-card mt-4 border p-6">
        <h1 className="text-foreground mb-6 text-2xl font-bold">이용약관</h1>
        <TermsContent />
      </Card>
    </main>
  )
}
