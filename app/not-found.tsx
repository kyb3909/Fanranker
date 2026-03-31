import type { Metadata } from "next"
import Link from "@/components/ui/app-link"

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없습니다",
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-primary mb-4 text-6xl font-bold">404</h1>
        <h2 className="text-foreground mb-2 text-xl font-semibold">페이지를 찾을 수 없습니다</h2>
        <p className="text-muted-foreground mb-6">
          요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.
        </p>
        <Link
          href="/"
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow transition-colors"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  )
}
