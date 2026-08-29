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
  Megaphone,
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
  UserCog,
  Coins,
  Target,
  RotateCcw,
  Activity,
  StickyNote,
  ChevronRight,
  LineChart,
  Sparkles,
  GraduationCap,
  Bot,
  BookOpen,
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
  badge?:
    | "reports"
    | "stickers"
    | "matches"
    | "metaverseReports"
    | "refunds"
    | "newsReview"
    | "aggReview"
    | "sagaReview"
}

interface NavGroup {
  label: string
  collapsible?: boolean
  collapsibleLabel?: string
  icon?: React.ComponentType<{ className?: string }>
  items: NavItem[]
}

/**
 * 메뉴 재편 (2026-08-30, 운영자: "메뉴들이 너무 난잡해. 뭐가 뭔지 잘 모르겠어").
 *
 * 종전 문제: "콘텐츠 관리" 접이식 하나에 16개 항목(모더레이션·뉴스·설문·배너·AI가
 * 한 통), 그룹명 영한 혼용(User Ops/개요), 휴면 페이지가 핵심 옆에 같은 무게,
 * 사가 검수는 메뉴에 아예 없음.
 *
 * 재편 원칙 (33개 페이지 전수조사 2026-08-30 기준):
 *  · 그룹 = **하는 일** 단위, 전부 한국어
 *  · 매일 하는 일(뉴스·사전)은 펼친 채, 가끔 하는 일(커뮤니티·베트맨)은 접이식,
 *    휴면 8종은 "보관함" 접이식에 격리 — 지우지 않는다(기능은 살아 있다)
 *  · 접힌 그룹의 대기 건수는 트리거에 합산 뱃지로 — 접혀 있다고 안 보이면 안 된다
 */
const navGroups: NavGroup[] = [
  {
    label: "홈",
    items: [{ title: "대시보드", href: "/admin", icon: LayoutDashboard }],
  },
  {
    // 매일 도는 파이프라인 — 항상 펼침
    label: "뉴스",
    items: [
      { title: "AI 뉴스 검수", href: "/admin/news-review", icon: Sparkles, badge: "newsReview" },
      { title: "뉴스룸 큐", href: "/admin/content/newsroom", icon: Inbox },
      { title: "사가 검수", href: "/admin/saga-review", icon: BookOpen, badge: "sagaReview" },
      { title: "뉴스 티커", href: "/admin/content/ticker", icon: Newspaper },
    ],
  },
  {
    // 표기 정본 관리 — 뉴스와 한 몸이지만 대상이 사전이라 분리
    label: "표기 사전",
    items: [
      { title: "선수단 사전", href: "/admin/team-squads", icon: BookOpen },
      { title: "팀 사전·경기 매핑", href: "/admin/team-dictionary", icon: BookOpen },
    ],
  },
  {
    label: "커뮤니티",
    collapsible: true,
    collapsibleLabel: "커뮤니티",
    icon: MessageSquare,
    items: [
      { title: "신고", href: "/admin/content/reports", icon: Flag, badge: "reports" },
      { title: "게시글", href: "/admin/content/posts", icon: FileText },
      { title: "댓글", href: "/admin/content/comments", icon: MessageSquare },
      { title: "전체 공지", href: "/admin/content/notices", icon: Megaphone },
      { title: "설문조사", href: "/admin/content/polls", icon: BarChart3 },
      { title: "게시판 노출", href: "/admin/content/boards", icon: FolderOpen },
      { title: "배너", href: "/admin/content/banners", icon: Image },
      { title: "사용자 관리", href: "/admin/users", icon: Users },
    ],
  },
  {
    label: "베트맨·경제",
    collapsible: true,
    collapsibleLabel: "베트맨·경제",
    icon: Trophy,
    items: [
      { title: "경기 관리", href: "/admin/matches", icon: Trophy, badge: "matches" },
      { title: "정산 처리", href: "/admin/settlements", icon: Coins },
      { title: "환불 큐", href: "/admin/refunds", icon: RotateCcw, badge: "refunds" },
      { title: "토큰 모니터링", href: "/admin/tokens", icon: Target },
    ],
  },
  {
    label: "모니터링",
    items: [
      { title: "운영 모니터링", href: "/admin/operations", icon: MonitorCheck },
      { title: "시스템 상태", href: "/admin/system", icon: Activity },
      { title: "통계", href: "/admin/stats", icon: LineChart },
      { title: "분석 리포트", href: "/admin/analytics", icon: BarChart3 },
    ],
  },
  {
    /**
     * 휴면 격리 (전수조사 실측 근거):
     * 애그리게이터 전 소스 비활성(검수·학습), 인터뷰 카드 총 1건, 메타버스 GNB 숨김
     * 상태(신고 0), 검열 워커 미배선(MOD), 기자 도입 전(전문가), 스티커·메모장 방치.
     * 다시 살리면 원래 그룹으로 되돌릴 것.
     */
    label: "보관함",
    collapsible: true,
    collapsibleLabel: "보관함 (휴면)",
    icon: FolderOpen,
    items: [
      { title: "AI 커뮤글 검수", href: "/admin/agg-review", icon: Bot, badge: "aggReview" },
      { title: "AI 글 학습", href: "/admin/agg-training", icon: GraduationCap },
      { title: "인터뷰 카드 검수", href: "/admin/interviews", icon: Sparkles },
      {
        title: "메타버스 신고",
        href: "/admin/content/metaverse-reports",
        icon: ShieldAlert,
        badge: "metaverseReports",
      },
      { title: "MOD 관리", href: "/admin/content/moderators", icon: UserCog },
      { title: "전문가 승인", href: "/admin/experts", icon: Shield },
      { title: "스티커 승인", href: "/admin/content/stickers", icon: Smile, badge: "stickers" },
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
      pendingNewsReview: number
      pendingAggReview: number
      pendingSagaReview: number
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
    newsReview: data?.alerts?.pendingNewsReview ?? 0,
    aggReview: data?.alerts?.pendingAggReview ?? 0,
    sagaReview: data?.alerts?.pendingSagaReview ?? 0,
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
