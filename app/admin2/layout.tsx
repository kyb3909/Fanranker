import { redirect } from "next/navigation"
import Link from "next/link"
import { requireAdmin } from "@/lib/supabase/admin"

/**
 * /admin2 — 새 관리자 작업대 (검토용 병렬 버전).
 *
 * 기존 /admin 은 그대로 둔다. 여기서 확인한 뒤 교체할지 정한다.
 * 사이드바 27개 메뉴 대신 단일 화면 — 매일 하는 일은 스크롤 없이 끝나야 한다.
 */
export default async function Admin2Layout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdmin()
  } catch {
    redirect("/")
  }

  return (
    <div className="bg-muted/30 min-h-screen">
      <header className="bg-background/95 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">공놀이 운영</span>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              새 버전
            </span>
          </div>
          <Link
            href="/admin"
            className="text-muted-foreground text-xs underline-offset-2 hover:underline"
          >
            기존 관리자 →
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
    </div>
  )
}
