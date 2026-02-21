import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/supabase/admin'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { AdminSidebar } from './_components/admin-sidebar'
import { Separator } from '@/components/ui/separator'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  try {
    await requireAdmin()
  } catch {
    redirect('/')
  }

  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm text-muted-foreground">관리자</span>
        </header>
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
