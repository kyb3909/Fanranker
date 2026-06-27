import Link from "next/link"
import { Megaphone } from "lucide-react"

export interface GlobalNotice {
  id: string
  title: string
}

/**
 * 담벼락(홈) 최상단 전체 공지 — 관리자가 is_global_notice 로 고정한 사이트 공지글.
 * 정렬(최신/온도/랜덤) 무관하게 항상 상단에 노출. 클릭 시 글 상세로 이동.
 */
export function GlobalNoticeBanner({ notices }: { notices: GlobalNotice[] }) {
  if (!notices?.length) return null
  return (
    <div className="space-y-2">
      {notices.map((n) => (
        <Link
          key={n.id}
          href={`/post/${n.id}`}
          className="flex items-center gap-2.5 rounded-xl px-4 py-3 no-underline transition-opacity hover:opacity-90"
          style={{
            background: "var(--wc-soft, #FBF1E7)",
            border: "1px solid var(--wc-gold, #E7C66B)",
            boxShadow: "var(--wc-shadow-1)",
          }}
        >
          <Megaphone className="h-4 w-4 shrink-0" style={{ color: "#B5841E" }} aria-hidden />
          <span
            className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-extrabold"
            style={{ background: "#B5841E", color: "#fff" }}
          >
            공지
          </span>
          <span
            className="min-w-0 flex-1 truncate text-[14px] font-bold"
            style={{ color: "var(--wc-ink, #2A1A1F)" }}
          >
            {n.title}
          </span>
        </Link>
      ))}
    </div>
  )
}
