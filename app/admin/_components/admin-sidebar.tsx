"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
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
  Inbox,
  ShieldAlert,
  Smile,
  Trophy,
  Shield,
  Coins,
  Target,
  RotateCcw,
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

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: "reports" | "stickers" | "matches" | "metaverseReports" | "refunds"
}

interface NavGroup {
  label: string
  collapsible?: boolean
  collapsibleLabel?: string
  icon?: React.ComponentType<{ className?: string }>
  items: NavItem[]
}

const navGroups: NavGroup[] = [
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
    collapsibleLabel: "콘텐츠 관리",
    icon: FileText,
    items: [
      { title: "게시글", href: "/admin/content/posts", icon: FileText },
      { title: "댓글", href: "/admin/content/comments", icon: MessageSquare },
      { title: "뉴스 티커", href: "/admin/content/ticker", icon: Newspaper },
      { title: "카테고리", href: "/admin/content/boards", icon: FolderOpen },
      { title: "배너 관리", href: "/admin/content/banners", icon: Image },
      { title: "스티커 승인", href: "/admin/content/stickers", icon: Smile, badge: "stickers" },
      { title: "신고 관리", href: "/admin/content/reports", icon: Flag, badge: "reports" },
      {
        title: "메타버스 신고",
        href: "/admin/content/metaverse-reports",
        icon: ShieldAlert,
        badge: "metaverseReports",
      },
      { title: "뉴스룸 큐", href: "/admin/content/newsroom", icon: Inbox },
    ],
  },
  {
    label: "Game Economy",
    collapsible: true,
    collapsibleLabel: "게임 경제",
    icon: Trophy,
    items: [
      { title: "경기 관리", href: "/admin/matches", icon: Trophy, badge: "matches" },
      { title: "전문가 승인", href: "/admin/experts", icon: Shield },
      { title: "정산 처리", href: "/admin/settlements", icon: Coins },
      { title: "토큰 모니터링", href: "/admin/tokens", icon: Target },
      { title: "환불 큐", href: "/admin/refunds", icon: RotateCcw, badge: "refunds" },
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
  const { data } = useSWR<{
    alerts: {
      pendingReports: number
      pendingStickers: number
      unsettledGames: number
      pendingMetaverseReports: number
      pendingRefunds: number
    }
  }>("/api/admin/operations/dashboard", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  })
  const badgeCounts: Record<string, number> = {
    reports: data?.alerts?.pendingReports ?? 0,
    stickers: data?.alerts?.pendingStickers ?? 0,
    matches: data?.alerts?.unsettledGames ?? 0,
    metaverseReports: data?.alerts?.pendingMetaverseReports ?? 0,
    refunds: data?.alerts?.pendingRefunds ?? 0,
  }

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
                <CollapsibleNavGroup
                  items={group.items}
                  pathname={pathname}
                  label={group.collapsibleLabel ?? group.label}
                  icon={group.icon}
                  badgeCounts={badgeCounts}
                />
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

function CollapsibleNavGroup({
  items,
  pathname,
  label,
  icon: GroupIcon,
  badgeCounts,
}: {
  items: NavItem[]
  pathname: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  badgeCounts: Record<string, number>
}) {
  const isAnyActive = items.some((item) => pathname.startsWith(item.href))
  const TriggerIcon = GroupIcon ?? items[0]?.icon

  return (
    <SidebarMenu>
      <Collapsible defaultOpen={isAnyActive} className="group/collapsible">
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton>
              {TriggerIcon && <TriggerIcon className="h-4 w-4" />}
              <span>{label}</span>
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
                      {item.badge && (badgeCounts[item.badge] ?? 0) > 0 && (
                        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                          {badgeCounts[item.badge] > 99 ? "99+" : badgeCounts[item.badge]}
                        </span>
                      )}
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
