import { BackButton } from "@/components/back-button"
import { Card } from "@/components/ui/card"
import { PrivacyContent } from "@/components/legal/privacy-content"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "개인정보처리방침",
  alternates: { canonical: "/privacy" },
}

export default function PrivacyPage() {
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
          개인정보처리방침
        </h1>
        <PrivacyContent />
      </Card>
    </main>
  )
}
