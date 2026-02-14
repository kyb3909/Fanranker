import Link from "next/link"
import { Header } from "@/components/header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main id="main-content" className="mx-auto px-4 sm:px-6 py-5 sm:py-6 max-w-2xl" tabIndex={-1}>
        <Card className="border border-border bg-card p-8 mt-4 text-center">
          <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
          <h2 className="text-xl font-semibold text-foreground mb-2">페이지를 찾을 수 없습니다</h2>
          <p className="text-muted-foreground mb-6">
            요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.
          </p>
          <Button asChild>
            <Link href="/">홈으로 돌아가기</Link>
          </Button>
        </Card>
      </main>
    </div>
  )
}
