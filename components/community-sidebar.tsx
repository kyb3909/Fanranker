"use client"

import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@clerk/nextjs"
import Link from "next/link"
import { Star, Search, BookOpen, Loader2, LayoutGrid } from "lucide-react"
import { ALL_COMMUNITIES } from "@/lib/constants/communities"
import { toast } from "@/hooks/use-toast"
import { AdPlaceholder } from "@/components/ad-placeholder"


export function CommunitySidebar() {
  const { isSignedIn } = useAuth()
  const [followedCommunities, setFollowedCommunities] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [loadingFollows, setLoadingFollows] = useState(true)
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null)

  // 서버에서 팔로우한 커뮤니티 목록 로드
  useEffect(() => {
    if (!isSignedIn) {
      setLoadingFollows(false)
      return
    }
    let cancelled = false
    setLoadingFollows(true)
    fetch("/api/community/follows")
      .then((res) => {
        if (!res.ok) return { communities: [] }
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        const slugs = new Set<string>((data.communities || []).map((c: { community_slug: string }) => c.community_slug))
        setFollowedCommunities(slugs)
      })
      .catch(() => {
        if (!cancelled) setFollowedCommunities(new Set())
      })
      .finally(() => {
        if (!cancelled) setLoadingFollows(false)
      })
    return () => { cancelled = true }
  }, [isSignedIn])

  const toggleFollow = async (communitySlug: string) => {
    const isFollowed = followedCommunities.has(communitySlug)
    setTogglingSlug(communitySlug)
    try {
      const res = await fetch(`/api/community/${communitySlug}/follow`, {
        method: isFollowed ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 401) {
          toast({ variant: "destructive", title: "로그인 필요", description: "로그인 후 즐겨찾기를 사용할 수 있습니다." })
        } else {
          toast({ variant: "destructive", title: "오류", description: data.error || "처리에 실패했습니다." })
        }
        return
      }
      setFollowedCommunities((prev) => {
        const next = new Set(prev)
        if (data.following) {
          next.add(communitySlug)
        } else {
          next.delete(communitySlug)
        }
        // 홈 피드 등 다른 컴포넌트에 팔로우 변경 알림
        window.dispatchEvent(new CustomEvent('communityFollowChanged', {
          detail: { slug: communitySlug, following: data.following, allSlugs: Array.from(next) }
        }))
        return next
      })
    } catch {
      toast({ variant: "destructive", title: "오류", description: "처리 중 오류가 발생했습니다." })
    } finally {
      setTogglingSlug(null)
    }
  }

  const toggleSearch = () => {
    setIsSearchOpen(!isSearchOpen)
    if (isSearchOpen) {
      setSearchQuery("") // 검색 닫을 때 검색어 초기화
    }
  }

  // 검색어로 커뮤니티 필터링
  const filteredCommunities = useMemo(
    () => ALL_COMMUNITIES.filter((community) =>
      community.name.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [searchQuery]
  )

  return (
    <div className="flex flex-col gap-4 sticky top-[6.5rem] lg:min-h-[calc(100vh-6.5rem)]">
      {/* ===== 게시판 (왼쪽 사이드바) ===== */}
      <Card className="bg-card border border-border rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2.5 bg-primary/10 border-b border-border shrink-0">
          <h3 className="text-[13px] font-bold text-primary flex items-center gap-2">
            <LayoutGrid className="w-4 h-4" />
            게시판
          </h3>
          <button
            onClick={toggleSearch}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            aria-label="게시판 검색"
          >
            <Search className={`w-4 h-4 ${isSearchOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"}`} />
          </button>
        </div>
        {isSearchOpen && (
          <div className="px-4 py-2 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="게시판 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-[13px]"
                autoFocus
              />
            </div>
          </div>
        )}
        <div className="py-1 overflow-y-auto scrollbar-hide flex-1 min-h-0 max-h-[400px]">
          {filteredCommunities.length > 0 ? (
            filteredCommunities.map((community) => {
              const isFollowed = followedCommunities.has(community.slug)
              return (
                <div
                  key={community.slug}
                  className="flex items-center justify-between px-4 py-2 hover:bg-muted/40 transition-colors group"
                >
                  <Link href={`/community/${community.slug}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className="w-6 h-6 rounded bg-secondary flex items-center justify-center text-sm shrink-0">
                      {community.emoji}
                    </span>
                    <span className="text-[13px] font-medium text-foreground group-hover:text-primary truncate">
                      {community.name}
                    </span>
                  </Link>
                  <button
                    onClick={(e) => { e.preventDefault(); toggleFollow(community.slug) }}
                    disabled={togglingSlug === community.slug}
                    className="p-1.5 rounded-lg hover:bg-muted flex-shrink-0 disabled:opacity-50"
                    aria-label={isFollowed ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                  >
                    {togglingSlug === community.slug ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Star className={`w-4 h-4 ${isFollowed ? "fill-primary text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                    )}
                  </button>
                </div>
              )
            })
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-[13px] text-muted-foreground">검색 결과가 없습니다</p>
            </div>
          )}
        </div>
      </Card>

      {/* 광고 플레이스홀더 */}
      <AdPlaceholder variant="sidebar" />

      {/* 3. 리소스 (사이트맵 하단) */}
      <nav className="mt-auto shrink-0">
        <Card className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-primary/10 border-b border-border">
            <h3 className="text-[13px] font-bold text-primary flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              리소스
            </h3>
          </div>
          <div className="py-1">
            <Link href="/about" className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/40 transition-colors group text-[13px] font-medium text-foreground group-hover:text-primary">
              회사 소개
            </Link>
            <Link href="/terms" className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/40 transition-colors group text-[13px] font-medium text-foreground group-hover:text-primary">
              이용약관
            </Link>
            <Link href="/content-policy" className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/40 transition-colors group text-[13px] font-medium text-foreground group-hover:text-primary">
              게시물 운영정책
            </Link>
            <Link href="/privacy" className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/40 transition-colors group text-[13px] font-medium text-foreground group-hover:text-primary">
              개인정보처리방침
            </Link>
          </div>
        </Card>
      </nav>
    </div>
  )
}
