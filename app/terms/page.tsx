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
    <main
      id="main-content"
      className="worldcup-scope mx-auto max-w-[720px] px-4 py-5 sm:px-6 sm:py-6"
      tabIndex={-1}
    >
      <BackButton />
      <Card
        className="mt-4 p-6"
        style={{ border: "1px solid var(--wc-line)", background: "var(--wc-card)" }}
      >
        <h1 className="mb-6" style={{ fontSize: 22, fontWeight: 900, color: "var(--wc-ink)" }}>
          이용약관
        </h1>
        <TermsContent />
      </Card>
    </main>
  )
}
