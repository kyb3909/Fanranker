import { redirect } from "next/navigation"
import Link from "next/link"
import { requireStaff } from "@/lib/admin/roles"
import { Admin2Nav } from "./nav"

/**
 * /admin2 — 새 관리자 작업대 (검토용 병렬 버전).
 *
 * 기존 /admin 은 그대로 둔다. 여기서 확인한 뒤 교체할지 정한다.
 * 사이드바 27개 메뉴 대신 단일 화면 — 매일 하는 일은 스크롤 없이 끝나야 한다.
 */
export default async function Admin2Layout({ children }: { children: React.ReactNode }) {
  // admin 전권 또는 editor(검수 전용). editor 는 돈·권한 화면에 못 간다 — lib/admin/roles.ts
  let role: "admin" | "editor"
  try {
    role = await requireStaff()
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
            {role === "editor" && (
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                검수 담당
              </span>
            )}
          </div>
          {/* editor 는 기존 /admin 에 못 들어간다 — 막힌 링크를 보여주지 않는다 */}
          {role === "admin" && (
            <Link
              href="/admin"
              className="text-muted-foreground text-xs underline-offset-2 hover:underline"
            >
              기존 관리자 →
            </Link>
          )}
        </div>
        {/* 메뉴가 4개뿐이라 항상 펼쳐둔다 — 대기 건수를 그 자리에서 보여주는 게 핵심 */}
        <div className="mx-auto max-w-5xl px-4 pb-2">
          <Admin2Nav />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
    </div>
  )
}
