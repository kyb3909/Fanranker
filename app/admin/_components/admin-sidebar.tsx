"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import {
  BarChart3,
  BookOpen,
  Bot,
  ChevronRight,
  Coins,
  Flag,
  FolderOpen,
  GraduationCap,
  Image,
  Inbox,
  LayoutDashboard,
  LineChart,
  Megaphone,
  MessageSquare,
  MonitorCheck,
  Newspaper,
  RotateCcw,
  Shield,
  ShieldAlert,
  Smile,
  Sparkles,
  SquareKanban,
  StickyNote,
  Target,
  Trophy,
  UserCog,
  Users,
  Activity,
  FileText,
  Gift,
  Images,
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
import { isVisibleForRole, type PanelRole } from "@/lib/admin/route-access"
import type { ControlCenterResponse } from "../_control-center/types"

/**
 * 관리자 내비게이션 (2026-09-08 `/admin2` 통합 재편).
 *
 * ## 왜 다시 짰나
 * 1. 진입점이 둘이었다. `/admin` 27개 메뉴와 `/admin2` 4개 탭 중 어느 쪽을 믿을지 운영자가
 *    매번 골라야 했다. 이제 `/admin` 하나이고, 최상위는 **업무 단위 5개**다.
 * 2. **대기 건수 배지가 실제로는 거의 안 보였다.** 접이식 그룹 트리거에는 합산 배지가 없었고
 *    (그룹을 접으면 숫자가 사라진다), 항상 펼친 그룹의 렌더 분기에는 `item.badge` 처리가
 *    아예 없어 뉴스 검수 배지는 어떤 상태에서도 표시되지 않았다. 둘 다 고쳤다.
 * 3. **숫자를 못 읽었을 때 0 을 그리지 않는다.** 조회 실패·미연결이면 `?` 를 보여준다 —
 *    "0건이라 조용한 것"과 "못 물어봐서 조용한 것"은 다른 상태다.
 *
 * 건수는 관제 센터와 **같은 엔드포인트**를 쓴다(SWR 캐시 공유). 두 곳이 다른 API 를 보면
 * 사이드바 숫자와 본문 숫자가 갈린다.
 */

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  /** 관제 센터 업무 키 — 여러 개면 합산한다 */
  badgeKeys?: string[]
}

interface NavGroup {
  label: string
  collapsible?: boolean
  icon?: React.ComponentType<{ className?: string }>
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: "관제 센터",
    items: [
      { title: "대시보드", href: "/admin", icon: LayoutDashboard },
      { title: "할 일 보드", href: "/admin/board", icon: SquareKanban },
    ],
  },
  {
    // 매일 도는 편집 업무 — 항상 펼침
    label: "검수",
    items: [
      {
        title: "AI 뉴스 검수",
        href: "/admin/news-review",
        icon: Sparkles,
        badgeKeys: ["news-review", "saga-blocked"],
      },
      { title: "뉴스룸 큐", href: "/admin/content/newsroom", icon: Inbox },
      {
        title: "사가 검수",
        href: "/admin/saga-review",
        icon: BookOpen,
        badgeKeys: ["saga-review"],
      },
      { title: "AI 커뮤글 검수", href: "/admin/agg-review", icon: Bot, badgeKeys: ["agg-review"] },
      { title: "뉴스 티커", href: "/admin/content/ticker", icon: Newspaper },
    ],
  },
  {
    label: "신고·문의",
    items: [
      {
        title: "신고",
        href: "/admin/content/reports",
        icon: Flag,
        badgeKeys: ["reports-pending", "reports-reviewing"],
      },
      {
        title: "메타버스 신고",
        href: "/admin/content/metaverse-reports",
        icon: ShieldAlert,
        badgeKeys: ["metaverse-reports"],
      },
    ],
  },
  {
    /**
     * 재화는 접이식에 묻지 않는다 — 감사에서 가장 위험한 공백이 여기였고(미지급·환불),
     * 보조 메뉴 안에 있으면 매일 열어보지 않게 된다.
     */
    label: "재화·정산",
    items: [
      {
        title: "환불 큐",
        href: "/admin/refunds",
        icon: RotateCcw,
        badgeKeys: ["refunds-pending", "refunds-failed"],
      },
      {
        title: "정산 처리",
        href: "/admin/settlements",
        icon: Coins,
        badgeKeys: ["orphan-settlement"],
      },
      {
        title: "경기 관리",
        href: "/admin/matches",
        icon: Trophy,
        badgeKeys: ["matches-unsettled"],
      },
      { title: "토큰 모니터링", href: "/admin/tokens", icon: Target },
    ],
  },
  {
    label: "운영 도구",
    collapsible: true,
    icon: MessageSquare,
    items: [
      { title: "게시글", href: "/admin/content/posts", icon: FileText },
      { title: "댓글", href: "/admin/content/comments", icon: MessageSquare },
      { title: "전체 공지", href: "/admin/content/notices", icon: Megaphone },
      { title: "설문조사", href: "/admin/content/polls", icon: BarChart3 },
      { title: "게시판 노출", href: "/admin/content/boards", icon: FolderOpen },
      { title: "배너", href: "/admin/content/banners", icon: Image },
      { title: "갤러리", href: "/admin/gallery", icon: Images },
      { title: "이벤트", href: "/admin/event", icon: Gift },
      { title: "사용자 관리", href: "/admin/users", icon: Users },
      {
        title: "스티커 승인",
        href: "/admin/content/stickers",
        icon: Smile,
        badgeKeys: ["stickers"],
      },
    ],
  },
  {
    label: "데이터·사전",
    collapsible: true,
    icon: BookOpen,
    items: [
      {
        title: "선수단 사전",
        href: "/admin/team-squads",
        icon: BookOpen,
        badgeKeys: ["squad-backlog"],
      },
      { title: "팀 사전·경기 매핑", href: "/admin/team-dictionary", icon: BookOpen },
    ],
  },
  {
    label: "시스템·분석",
    collapsible: true,
    icon: MonitorCheck,
    items: [
      {
        title: "운영 모니터링",
        href: "/admin/operations",
        icon: MonitorCheck,
        badgeKeys: ["invariants", "cron-fails", "crawler-fails"],
      },
      { title: "시스템 상태", href: "/admin/system", icon: Activity },
      { title: "통계", href: "/admin/stats", icon: LineChart },
      { title: "분석 리포트", href: "/admin/analytics", icon: BarChart3 },
      { title: "메모장", href: "/admin/notes", icon: StickyNote },
    ],
  },
  {
    /**
     * 휴면 격리 (전수조사 실측 근거): 애그리게이터 학습, 인터뷰 카드 1건, 검열 워커 미배선,
     * 기자 도입 전. 지우지 않는다 — 다시 살리면 원래 그룹으로 되돌릴 것.
     */
    label: "보관함",
    collapsible: true,
    icon: FolderOpen,
    items: [
      { title: "AI 글 학습", href: "/admin/agg-training", icon: GraduationCap },
      { title: "인터뷰 카드 검수", href: "/admin/interviews", icon: Sparkles },
      { title: "MOD 관리", href: "/admin/content/moderators", icon: UserCog },
      { title: "전문가 승인", href: "/admin/experts", icon: Shield },
    ],
  },
]

/** 배지에 그릴 값. 숫자를 못 믿는 상태면 `?` — 0 으로 그리면 조용한 실패가 된다 */
type BadgeValue = { text: string; unknown: boolean } | null

function badgeFor(data: ControlCenterResponse | undefined, keys?: string[]): BadgeValue {
  if (!keys || keys.length === 0) return null
  if (!data) return null
  const items = data.items.filter((i) => keys.includes(i.key))
  if (items.length === 0) return null
  if (items.some((i) => i.observation !== "ok")) return { text: "?", unknown: true }
  const total = items.reduce((sum, i) => sum + i.count, 0)
  if (total === 0) return null
  return { text: total > 99 ? "99+" : String(total), unknown: false }
}

function Badge({ value }: { value: BadgeValue }) {
  if (!value) return null
  return (
    <span
      title={value.unknown ? "건수를 확인하지 못했습니다" : undefined}
      className={
        value.unknown
          ? "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white"
          : "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white"
      }
    >
      {value.text}
    </span>
  )
}

export function AdminSidebar({ role = "admin" }: { role?: PanelRole }) {
  const pathname = usePathname()
  // 관제 센터와 같은 키 — 홈에서는 요청이 하나로 합쳐진다
  const { data } = useSWR<ControlCenterResponse>("/api/admin/control-center", fetcher, {
    refreshInterval: 120_000,
    revalidateOnFocus: false,
  })

  // 못 누르는 메뉴를 보여주지 않는다. 서버 게이트(route-access)와 같은 규칙을 쓴다.
  const groups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => isVisibleForRole(role, i.href)) }))
    .filter((g) => g.items.length > 0)

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <Shield className="text-primary h-5 w-5" />
          <span>관리자 패널</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              {group.collapsible ? (
                <CollapsibleNavGroup
                  items={group.items}
                  pathname={pathname}
                  label={group.label}
                  icon={group.icon}
                  data={data}
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
                          {/* 종전에는 이 분기에 배지 렌더가 아예 없었다 — 뉴스 검수 대기가
                              어떤 상태에서도 사이드바에 안 보이던 원인 */}
                          <Badge value={badgeFor(data, item.badgeKeys)} />
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
  data,
}: {
  items: NavItem[]
  pathname: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  data: ControlCenterResponse | undefined
}) {
  const isAnyActive = items.some((item) => pathname.startsWith(item.href))
  const TriggerIcon = GroupIcon ?? items[0]?.icon

  // 접었을 때도 안에 일이 남았는지 보여준다 — 종전에는 접으면 숫자가 사라졌다
  const groupBadge = badgeFor(
    data,
    items.flatMap((i) => i.badgeKeys ?? [])
  )

  return (
    <SidebarMenu>
      <Collapsible defaultOpen={isAnyActive} className="group/collapsible">
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton>
              {TriggerIcon && <TriggerIcon className="h-4 w-4" />}
              <span>{label}</span>
              {/* 배지와 화살표가 각자 ml-auto 를 가지면 서로 밀어낸다 — 한 묶음으로 오른쪽에 붙인다 */}
              <span className="ml-auto flex items-center gap-1">
                <Badge value={groupBadge} />
                <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
              </span>
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
                      <Badge value={badgeFor(data, item.badgeKeys)} />
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
