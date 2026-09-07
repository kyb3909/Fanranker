import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { getStaffRole } from "@/lib/admin/roles"
import { canOpenAdminPath, fallbackPathFor } from "@/lib/admin/route-access"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AdminSidebar } from "./_components/admin-sidebar"
import { Separator } from "@/components/ui/separator"

/**
 * 관리자 레이아웃 — 운영자의 **유일한** 관리자 진입점 (2026-09-08 `/admin2` 통합).
 *
 * ## 권한
 * 종전에는 `requireAdmin()`(전권)만 통과시켰고, 검수 담당(editor)은 `/admin2` 로만 들어왔다.
 * `/admin2` 를 없애면서 editor 가 갈 곳이 사라지면 안 되므로 여기서 staff 를 받되,
 * **경로 허용목록으로 범위를 자른다**(`lib/admin/route-access.ts`). 35개 `/admin` 페이지가
 * 전부 자체 권한 검사 없이 이 레이아웃에 기대고 있어, 그냥 열면 환불·정산·사용자 관리까지
 * 한꺼번에 열린다.
 *
 * 기본은 거부다. 경로를 알 수 없으면(미들웨어 헤더 유실) 통과시키지 않는다.
 * 각 API 는 이것과 별개로 자기 권한을 다시 검사한다.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const role = await getStaffRole()
  if (!role) redirect("/")

  const pathname = (await headers()).get("x-pathname")
  if (!canOpenAdminPath(role, pathname)) {
    redirect(fallbackPathFor(role, pathname))
  }

  return (
    <SidebarProvider>
      <AdminSidebar role={role} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-muted-foreground text-sm">
            관리자{role === "editor" && " · 검수 담당"}
          </span>
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
