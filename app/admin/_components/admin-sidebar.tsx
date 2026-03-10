"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  LayoutDashboard,
  MonitorCheck,
  Users,
  FileText,
  MessageSquare,
  Newspaper,
  FolderOpen,
  Flag,
  Image,
  Trophy,
  Shield,
  Coins,
  Target,
  Activity,
  StickyNote,
  ChevronRight,
  LineChart,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

const navGroups = [
  {
    label: "개요",
    items: [
      { title: "대시보드", href: "/admin", icon: LayoutDashboard },
      { title: "운영 모니터링", href: "/admin/operations", icon: MonitorCheck },
      { title: "분석 리포트", href: "/admin/analytics", icon: BarChart3 },
      { title: "통계", href: "/admin/stats", icon: LineChart },
    ],
  },
  {
    label: "User Ops",
    items: [{ title: "사용자 관리", href: "/admin/users", icon: Users }],
  },
  {
    label: "Content Ops",
    collapsible: true,
    icon: FileText,
    items: [
      { title: "게시글", href: "/admin/content/posts", icon: FileText },
      { title: "댓글", href: "/admin/content/comments", icon: MessageSquare },
      { title: "뉴스 티커", href: "/admin/content/ticker", icon: Newspaper },
      { title: "카테고리", href: "/admin/content/boards", icon: FolderOpen },
      { title: "배너 관리", href: "/admin/content/banners", icon: Image },
      { title: "신고 관리", href: "/admin/content/reports", icon: Flag },
    ],
  },
  {
    label: "Game Economy",
    collapsible: true,
    icon: Trophy,
    items: [
      { title: "경기 관리", href: "/admin/matches", icon: Trophy },
      { title: "전문가 승인", href: "/admin/experts", icon: Shield },
      { title: "정산 처리", href: "/admin/settlements", icon: Coins },
      { title: "토큰 모니터링", href: "/admin/tokens", icon: Target },
    ],
  },
  {
    label: "시스템",
    items: [
      { title: "시스템 상태", href: "/admin/system", icon: Activity },
      { title: "메모장", href: "/admin/notes", icon: StickyNote },
    ],
  },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <Shield className="text-primary h-5 w-5" />
          <span>관리자 패널</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              {group.collapsible ? (
                <CollapsibleNavGroup items={group.items} pathname={pathname} />
              ) : (
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={
                          item.href === "/admin"
                            ? pathname === "/admin"
                            : pathname.startsWith(item.href)
                        }
                        tooltip={item.title}
                      >
                        <Link href={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

function CollapsibleNavGroup({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const isAnyActive = items.some((item) => pathname.startsWith(item.href))
  const FirstIcon = items[0]?.icon

  return (
    <SidebarMenu>
      <Collapsible defaultOpen={isAnyActive} className="group/collapsible">
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton>
              {FirstIcon && <FirstIcon className="h-4 w-4" />}
              <span>전체 보기</span>
              <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {items.map((item) => (
                <SidebarMenuSubItem key={item.href}>
                  <SidebarMenuSubButton asChild isActive={pathname.startsWith(item.href)}>
                    <Link href={item.href}>
                      <item.icon className="h-3.5 w-3.5" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    </SidebarMenu>
  )
}
