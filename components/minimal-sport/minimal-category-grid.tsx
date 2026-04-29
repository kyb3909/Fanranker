import Link from "@/components/ui/app-link"

export interface MinimalCategoryGridItem {
  slug: string
  name: string
  icon?: string | null
}

interface MinimalCategoryGridProps {
  categories: MinimalCategoryGridItem[]
  /** 한 줄에 노출할 카드 수 (기본 5) */
  cols?: 4 | 5 | 6
}

const COLS_CLASS: Record<number, string> = {
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
}

/**
 * Minimal Sport 카테고리 그리드.
 * - rounded-2xl card + divide vertical lines
 * - icon(2xl) + name(13/700)
 * - hover: --ms-bg-hover
 */
export function MinimalCategoryGrid({ categories, cols = 5 }: MinimalCategoryGridProps) {
  if (categories.length === 0) return null
  return (
    <section
      className={`grid divide-x overflow-hidden rounded-2xl border bg-[var(--ms-surface)] ${COLS_CLASS[cols]}`}
      style={{ borderColor: "var(--ms-line)" }}
    >
      {categories.map((cat) => (
        <Link
          key={cat.slug}
          href={`/community/${cat.slug}`}
          className="flex flex-col items-center gap-1.5 py-5 transition-colors hover:bg-[var(--ms-bg-hover)]"
          style={{ borderColor: "var(--ms-line)" }}
        >
          <span className="text-2xl" aria-hidden>
            {cat.icon ?? "📋"}
          </span>
          <span className="text-[13px] font-bold" style={{ color: "var(--ms-ink)" }}>
            {cat.name}
          </span>
        </Link>
      ))}
    </section>
  )
}
