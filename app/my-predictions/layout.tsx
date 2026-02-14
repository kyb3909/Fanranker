import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "내 예측",
}

export default function MyPredictionsLayout({ children }: { children: React.ReactNode }) {
  return children
}
