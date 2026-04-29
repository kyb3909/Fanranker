import Link from "@/components/ui/app-link"
import { MinimalSideCard } from "./minimal-right-aside"

export interface TalkItem {
  id: string
  title: string
  community_slug: string | null
  comment_count: number | null
}

interface MinimalTalkListProps {
  items: TalkItem[]
  /** 표시 개수 (기본 7) */
  limit?: number
  title?: string
}

/**
 * 최근 댓글 달린 게시물 카드.
 * row: [제목 truncate] [코멘트수 brand] [카테고리 칩]
 */
export function MinimalTalkList({
  items,
  limit = 7,
  title = "최근 댓글 달린 게시물",
}: MinimalTalkListProps) {
  const list = items.slice(0, limit)

  if (list.length === 0) {
    return (
      <MinimalSideCard title={title}>
        <p className="py-2 text-[12px]" style={{ color: "var(--ms-ink-3)" }}>
          아직 댓글이 달린 글이 없어요.
        </p>
      </MinimalSideCard>
    )
  }

  return (
    <MinimalSideCard title={title}>
      <ul className="flex flex-col">
        {list.map((t, i) => (
          <li
            key={t.id}
            className="flex items-center gap-2 py-2 text-[12.5px]"
            style={{
              borderTop: i === 0 ? "none" : "1px solid var(--ms-line)",
            }}
          >
            <Link
              href={`/post/${t.id}`}
              className="min-w-0 flex-1 truncate font-medium hover:underline"
              style={{ color: "var(--ms-ink)" }}
              title={t.title}
            >
              {t.title}
            </Link>
            <span
              className="font-archivo shrink-0 text-[12px] font-extrabold tabular-nums"
              style={{ color: "var(--ms-brand)" }}
            >
              {t.comment_count ?? 0}
            </span>
            {t.community_slug && (
              <span
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                style={{
                  backgroundColor: "var(--ms-bg)",
                  color: "var(--ms-ink-3)",
                }}
              >
                {t.community_slug}
              </span>
            )}
          </li>
        ))}
      </ul>
    </MinimalSideCard>
  )
}
