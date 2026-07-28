"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { cn } from "@/lib/utils"

/**
 * 작업대 네비게이션.
 *
 * 기존 /admin 은 27개 메뉴를 접이식 그룹에 넣어놓고 대기 건수 뱃지가 그 안에 갇혀
 * 있었다 — "지금 처리할 게 있나"를 사이드바에서 알 수 없었던 게 가장 큰 결함이다.
 * 여기서는 메뉴가 4개뿐이므로 **항상 펼쳐두고 건수를 그 자리에 붙인다.**
 *
 * 건수는 작업대와 같은 엔드포인트를 쓴다(SWR 캐시 공유 — 추가 요청 없음).
 */

interface QueueItem {
  key: string
  count: number
}
interface Dashboard {
  role: "admin" | "editor"
  queues: QueueItem[]
}

/** 탭 ↔ 대시보드 큐 키 매핑. adminOnly 인 큐는 editor 응답에 아예 없어서 자동으로 0 이 된다 */
const TABS = [
  { href: "/admin2", label: "작업대", queueKey: null as string | null, exact: true },
  { href: "/admin2/news", label: "뉴스 검수", queueKey: "news-review", exact: false },
  { href: "/admin2/agg", label: "커뮤글 검수", queueKey: "agg-review", exact: false },
  { href: "/admin2/reports", label: "신고", queueKey: "reports", exact: false },
]

export function Admin2Nav() {
  const pathname = usePathname()
  const { data } = useSWR<Dashboard>("/api/admin2/dashboard", fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  })

  const countOf = (key: string | null) =>
    key ? (data?.queues.find((q) => q.key === key)?.count ?? 0) : 0

  // editor 에게는 신고 큐가 응답에 없다 → 탭도 숨긴다 (눌러도 막힌다)
  const visible = TABS.filter((t) => !(t.queueKey === "reports" && data && data.role !== "admin"))

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {visible.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
        const count = countOf(tab.queueKey)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {tab.label}
            {count > 0 && (
              <span
                className={cn(
                  "rounded px-1 text-[10px] tabular-nums",
                  active ? "bg-background/25" : "bg-foreground/10"
                )}
              >
                {count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
