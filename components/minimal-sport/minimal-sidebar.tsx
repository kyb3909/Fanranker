"use client"

import Link from "@/components/ui/app-link"

interface SidebarCategory {
  slug: string
  name: string
  icon?: string | null
  count?: number | null
}

interface MinimalSidebarProps {
  /** 스포츠 그룹 카테고리 */
  sports: SidebarCategory[]
  /** 라이프 그룹 카테고리 */
  life: SidebarCategory[]
  /** 현재 활성 카테고리 slug */
  activeSlug?: string
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h4
      className="mb-2 px-2 text-[11px] font-bold uppercase"
      style={{
        color: "var(--ms-ink-3)",
        letterSpacing: "0.08em",
      }}
    >
      {children}
    </h4>
  )
}

function CategoryRow({ cat, active }: { cat: SidebarCategory; active: boolean }) {
  const baseClass =
    "group flex h-9 items-center gap-2 rounded-[10px] px-2 text-[13px] font-medium transition-colors"
  const stateClass = active
    ? "bg-[var(--ms-brand-soft)] text-[var(--ms-brand)] font-semibold"
    : "text-[var(--ms-ink-2)] hover:bg-[var(--ms-bg-hover)]"

  return (
    <Link href={`/community/${cat.slug}`} className={`${baseClass} ${stateClass}`}>
      <span className="w-4 text-center text-[14px]" aria-hidden>
        {cat.icon ?? "•"}
      </span>
      <span className="min-w-0 flex-1 truncate">{cat.name}</span>
      {typeof cat.count === "number" && (
        <span
          className="font-archivo text-[11px] tabular-nums"
          style={{ color: "var(--ms-ink-3)" }}
        >
          {cat.count}
        </span>
      )}
    </Link>
  )
}

/**
 * Minimal Sport Sidebar — 220px 너비, 카테고리 row 리스트.
 *
 * - 섹션: 스포츠 / 라이프 (대분류 두 개)
 * - row: icon + name + count (우측 정렬)
 * - active: brand-soft 배경 + brand 텍스트
 * - hover: bg
 */
export function MinimalSidebar({ sports, life, activeSlug }: MinimalSidebarProps) {
  return (
    <nav aria-label="카테고리 탐색">
      <SectionHeader>스포츠</SectionHeader>
      <div className="mb-6 flex flex-col gap-0.5">
        {sports.map((c) => (
          <CategoryRow key={c.slug} cat={c} active={c.slug === activeSlug} />
        ))}
      </div>

      <SectionHeader>라이프</SectionHeader>
      <div className="flex flex-col gap-0.5">
        {life.map((c) => (
          <CategoryRow key={c.slug} cat={c} active={c.slug === activeSlug} />
        ))}
      </div>
    </nav>
  )
}
