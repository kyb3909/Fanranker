"use client"

import { useEffect, useState } from "react"
import Link from "@/components/ui/app-link"
import { useAuth, useClerk } from "@clerk/nextjs"
import useSWR, { useSWRConfig } from "swr"
import { Loader2, Star } from "lucide-react"
import { fetcher } from "@/lib/swr"
import { toast } from "@/hooks/use-toast"

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

function CategoryRow({
  cat,
  active,
  isFollowed,
  isToggling,
  onToggleFollow,
}: {
  cat: SidebarCategory
  active: boolean
  isFollowed: boolean
  isToggling: boolean
  onToggleFollow: (slug: string, currentlyFollowed: boolean) => void
}) {
  const baseClass =
    "group flex h-9 items-center gap-1.5 rounded-[10px] pl-2 pr-1 text-[13px] font-medium transition-colors"
  const stateClass = active
    ? "bg-[var(--ms-brand-soft)] text-[var(--ms-brand)] font-semibold"
    : "text-[var(--ms-ink-2)] hover:bg-[var(--ms-bg-hover)]"

  return (
    <div className={`${baseClass} ${stateClass}`}>
      <Link href={`/community/${cat.slug}`} className="flex min-w-0 flex-1 items-center gap-2">
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
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleFollow(cat.slug, isFollowed)
        }}
        disabled={isToggling}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/50 disabled:opacity-50"
        aria-label={isFollowed ? "즐겨찾기 해제" : "즐겨찾기 추가"}
        aria-pressed={isFollowed}
      >
        {isToggling ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--ms-ink-3)" }} />
        ) : (
          <Star
            className="h-3.5 w-3.5"
            fill={isFollowed ? "var(--ms-brand)" : "none"}
            style={{ color: isFollowed ? "var(--ms-brand)" : "var(--ms-ink-3)" }}
          />
        )}
      </button>
    </div>
  )
}

/**
 * Minimal Sport Sidebar — 220px 너비, 카테고리 row 리스트.
 *
 * - 섹션: 스포츠 / 라이프
 * - row: icon + name + count + ★ 즐겨찾기 토글
 * - 즐겨찾기: /api/community/follows GET + /api/community/[slug]/follow POST/DELETE
 * - 비로그인 시 클릭하면 Clerk sign-in 모달
 */
export function MinimalSidebar({ sports, life, activeSlug }: MinimalSidebarProps) {
  const { isSignedIn } = useAuth()
  const { openSignIn } = useClerk()
  const { mutate: globalMutate } = useSWRConfig()
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null)

  const { data: followsData } = useSWR<{ communities: { community_slug: string }[] }>(
    isSignedIn ? "/api/community/follows" : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  )

  const followedSet = new Set<string>((followsData?.communities ?? []).map((c) => c.community_slug))

  // 다른 곳(예: MinimalFollowButton)에서 follow 변경 시 SWR 캐시 다시 받기
  useEffect(() => {
    const handler = () => globalMutate("/api/community/follows")
    window.addEventListener("communityFollowChanged", handler)
    return () => window.removeEventListener("communityFollowChanged", handler)
  }, [globalMutate])

  const handleToggleFollow = async (slug: string, currentlyFollowed: boolean) => {
    if (!isSignedIn) {
      openSignIn()
      return
    }
    setTogglingSlug(slug)
    try {
      const res = await fetch(`/api/community/${slug}/follow`, {
        method: currentlyFollowed ? "DELETE" : "POST",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast({
          variant: "destructive",
          title: "오류",
          description: data.error || "즐겨찾기 처리에 실패했습니다.",
        })
        return
      }
      globalMutate("/api/community/follows")
      window.dispatchEvent(new CustomEvent("communityFollowChanged"))
    } catch {
      toast({ variant: "destructive", title: "오류", description: "네트워크 오류가 발생했습니다." })
    } finally {
      setTogglingSlug(null)
    }
  }

  const renderRows = (items: SidebarCategory[]) =>
    items.map((c) => (
      <CategoryRow
        key={c.slug}
        cat={c}
        active={c.slug === activeSlug}
        isFollowed={followedSet.has(c.slug)}
        isToggling={togglingSlug === c.slug}
        onToggleFollow={handleToggleFollow}
      />
    ))

  return (
    <nav aria-label="카테고리 탐색">
      <SectionHeader>스포츠</SectionHeader>
      <div className="mb-6 flex flex-col gap-0.5">{renderRows(sports)}</div>

      <SectionHeader>라이프</SectionHeader>
      <div className="mb-6 flex flex-col gap-0.5">{renderRows(life)}</div>

      {/* Footer 링크 — 서비스 소개 / 약관 / 개인정보처리방침 */}
      <div
        className="mt-2 flex flex-col gap-1 border-t pt-4 text-[11px] font-medium"
        style={{ borderColor: "var(--ms-line)", color: "var(--ms-ink-3)" }}
      >
        <Link href="/about" className="px-2 py-1 transition-colors hover:text-[var(--ms-ink)]">
          서비스 소개
        </Link>
        <Link
          href="/content-policy"
          className="px-2 py-1 transition-colors hover:text-[var(--ms-ink)]"
        >
          콘텐츠 정책
        </Link>
        <Link href="/terms" className="px-2 py-1 transition-colors hover:text-[var(--ms-ink)]">
          이용약관
        </Link>
        <Link href="/privacy" className="px-2 py-1 transition-colors hover:text-[var(--ms-ink)]">
          개인정보처리방침
        </Link>
      </div>
    </nav>
  )
}
