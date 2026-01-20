"use client"

import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useState } from "react"
import Link from "next/link"
import { Star, Search } from "lucide-react"

// 커뮤니티 타입 정의
interface Community {
  slug: string
  name: string
  memberCount: number
  icon: string
  emoji?: string
  todayPosts?: number
}

// 멤버 수 포맷팅 함수
function formatMemberCount(count: number): string {
  if (count >= 10000) {
    const wan = count / 10000
    const formatted = wan % 1 === 0 ? wan.toFixed(0) : wan.toFixed(1)
    return `${formatted}만`
  }
  return count.toLocaleString()
}

// 전체 커뮤니티 메뉴
const ALL_COMMUNITIES: Community[] = [
  { slug: "overseas-football", name: "해외축구", memberCount: 1245000, icon: "", emoji: "⚽" },
  { slug: "domestic-football", name: "국내축구", memberCount: 453000, icon: "", emoji: "🏟️" },
  { slug: "baseball", name: "야구", memberCount: 982000, icon: "", emoji: "⚾" },
  { slug: "basketball", name: "농구", memberCount: 387000, icon: "", emoji: "🏀" },
  { slug: "volleyball", name: "배구", memberCount: 221000, icon: "", emoji: "🏐" },
  { slug: "esports", name: "e스포츠", memberCount: 671000, icon: "", emoji: "🎮" },
  { slug: "free-board", name: "자유게시판", memberCount: 894000, icon: "", emoji: "💬" },
  { slug: "tips", name: "정보게시판", memberCount: 342000, icon: "", emoji: "📊" },
]

// 최근 방문 커뮤니티
const RECENT_COMMUNITIES: Community[] = [
  { slug: "overseas-football", name: "해외축구", memberCount: 1245000, icon: "", emoji: "⚽" },
  { slug: "free-board", name: "자유게시판", memberCount: 894000, icon: "", emoji: "💬" },
  { slug: "baseball", name: "야구", memberCount: 982000, icon: "", emoji: "⚾" },
]


export function CommunitySidebar() {
  const [followedCommunities, setFollowedCommunities] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const toggleFollow = (communitySlug: string) => {
    setFollowedCommunities((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(communitySlug)) {
        newSet.delete(communitySlug)
      } else {
        newSet.add(communitySlug)
      }
      return newSet
    })
  }

  const toggleSearch = () => {
    setIsSearchOpen(!isSearchOpen)
    if (isSearchOpen) {
      setSearchQuery("") // 검색 닫을 때 검색어 초기화
    }
  }

  // 검색어로 커뮤니티 필터링
  const filteredCommunities = ALL_COMMUNITIES.filter((community) =>
    community.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-4 sticky top-16">
      
      {/* ===== 커뮤니티 메뉴 ===== */}
      <Card className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" />
            <h3 className="text-[14px] font-bold text-foreground">커뮤니티</h3>
          </div>
          <button
            onClick={toggleSearch}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            aria-label="검색"
          >
            <Search className={`w-4 h-4 transition-colors ${
              isSearchOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`} />
          </button>
        </div>
        
        {/* 검색 입력 */}
        {isSearchOpen && (
          <div className="px-4 py-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="커뮤니티 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-[13px]"
                autoFocus
              />
            </div>
          </div>
        )}
        
        <div className="py-1 max-h-[400px] overflow-y-auto">
          {filteredCommunities.length > 0 ? (
            filteredCommunities.map((community) => {
            const isFollowed = followedCommunities.has(community.slug)
            
            return (
              <div
                key={community.slug}
                className="flex items-center justify-between px-4 py-2 hover:bg-muted/40 transition-colors group"
              >
                <Link 
                  href={`/community/${community.slug}`}
                  className="flex items-center gap-2.5 flex-1 min-w-0"
                >
                  <span className="w-6 h-6 rounded bg-secondary flex items-center justify-center text-sm">
                    {community.emoji}
                  </span>
                  <span className="text-[13px] font-medium text-foreground group-hover:text-primary transition-colors">
                    {community.name}
                  </span>
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    toggleFollow(community.slug)
                  }}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
                  aria-label={isFollowed ? "언팔로우" : "팔로우"}
                >
                  <Star 
                    className={`w-4 h-4 transition-colors ${
                      isFollowed 
                        ? "fill-primary text-primary" 
                        : "text-muted-foreground group-hover:text-primary"
                    }`}
                  />
                </button>
              </div>
            )
          })) : (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] text-muted-foreground">
                검색 결과가 없습니다
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
