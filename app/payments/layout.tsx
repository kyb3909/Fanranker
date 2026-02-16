import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "결제",
  robots: { index: false, follow: false },
}

export default function PaymentsLayout({ children }: { children: React.ReactNode }) {
  return children
}
