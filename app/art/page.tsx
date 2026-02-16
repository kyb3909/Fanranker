"use client"

import { useState } from "react"
import { Heart, Eye, MessageSquare, Flame, TrendingUp, Clock, ChevronDown, Palette } from "lucide-react"
import Link from "next/link"

// --- Mock Data ---

const CATEGORIES = [
  { id: "all", label: "전체" },
  { id: "illustration", label: "일러스트" },
  { id: "character-design", label: "캐릭터 디자인" },
  { id: "concept-art", label: "컨셉 아트" },
  { id: "comic", label: "만화" },
  { id: "animation", label: "애니메이션" },
  { id: "graphic-design", label: "그래픽 디자인" },
]

const SORT_OPTIONS = [
  { id: "hot", label: "Hot", icon: Flame },
  { id: "top", label: "Top", icon: TrendingUp },
  { id: "new", label: "New", icon: Clock },
]

interface MockArtwork {
  id: string
  title: string
  artist: string
  artistAvatar: string
  category: string
  likes: number
  views: number
  comments: number
  gradient: string
  aspectRatio: number
  tags: string[]
}

const GRADIENTS = [
  "from-zinc-800 via-neutral-700 to-stone-800",
  "from-red-950 via-rose-900 to-red-950",
  "from-slate-800 via-slate-700 to-zinc-800",
  "from-stone-800 via-neutral-700 to-stone-900",
  "from-neutral-800 via-zinc-700 to-neutral-900",
  "from-red-900/80 via-stone-800 to-neutral-800",
  "from-zinc-700 via-stone-700 to-neutral-800",
  "from-stone-900 via-zinc-800 to-stone-900",
  "from-neutral-700 via-stone-700 to-zinc-800",
  "from-red-950/70 via-neutral-800 to-zinc-900",
  "from-slate-700 via-zinc-700 to-slate-800",
  "from-stone-800 via-red-950/50 to-neutral-800",
]

const MOCK_ARTWORKS: MockArtwork[] = [
  { id: "1", title: "숲속의 수호자", artist: "ArtistKim", artistAvatar: "K", category: "illustration", likes: 342, views: 1820, comments: 28, gradient: GRADIENTS[0], aspectRatio: 1.4, tags: ["판타지", "숲", "캐릭터"] },
  { id: "2", title: "고대 사원의 비밀", artist: "PixelMaster", artistAvatar: "P", category: "concept-art", likes: 256, views: 1340, comments: 15, gradient: GRADIENTS[1], aspectRatio: 0.75, tags: ["배경", "건축", "판타지"] },
  { id: "3", title: "사이버 전사", artist: "NeonDraw", artistAvatar: "N", category: "character-design", likes: 489, views: 2650, comments: 42, gradient: GRADIENTS[2], aspectRatio: 1.2, tags: ["사이버펑크", "캐릭터", "SF"] },
  { id: "4", title: "봄의 정원", artist: "FloralArt", artistAvatar: "F", category: "illustration", likes: 178, views: 980, comments: 12, gradient: GRADIENTS[3], aspectRatio: 1.0, tags: ["자연", "꽃", "풍경"] },
  { id: "5", title: "드래곤 나이트", artist: "FantasyKing", artistAvatar: "F", category: "illustration", likes: 612, views: 3200, comments: 56, gradient: GRADIENTS[4], aspectRatio: 1.5, tags: ["드래곤", "기사", "판타지"] },
  { id: "6", title: "미래 도시 스카이라인", artist: "SciFiVision", artistAvatar: "S", category: "concept-art", likes: 301, views: 1750, comments: 23, gradient: GRADIENTS[5], aspectRatio: 0.6, tags: ["SF", "도시", "미래"] },
  { id: "7", title: "마법소녀 변신", artist: "MagicPen", artistAvatar: "M", category: "comic", likes: 445, views: 2100, comments: 38, gradient: GRADIENTS[6], aspectRatio: 1.3, tags: ["만화", "마법소녀", "액션"] },
  { id: "8", title: "언더워터 킹덤", artist: "DeepBlue", artistAvatar: "D", category: "illustration", likes: 234, views: 1200, comments: 18, gradient: GRADIENTS[7], aspectRatio: 0.8, tags: ["수중", "판타지", "왕국"] },
  { id: "9", title: "로봇 친구", artist: "TechDoodle", artistAvatar: "T", category: "character-design", likes: 156, views: 890, comments: 9, gradient: GRADIENTS[8], aspectRatio: 1.1, tags: ["로봇", "귀여움", "SF"] },
  { id: "10", title: "달빛 아래 여우", artist: "MoonlitArt", artistAvatar: "M", category: "illustration", likes: 523, views: 2800, comments: 45, gradient: GRADIENTS[9], aspectRatio: 1.25, tags: ["동물", "달", "자연"] },
  { id: "11", title: "스팀펑크 시계탑", artist: "GearWorks", artistAvatar: "G", category: "concept-art", likes: 287, views: 1500, comments: 21, gradient: GRADIENTS[10], aspectRatio: 1.6, tags: ["스팀펑크", "건축", "기계"] },
  { id: "12", title: "네온 거리", artist: "NeonDraw", artistAvatar: "N", category: "graphic-design", likes: 198, views: 1050, comments: 14, gradient: GRADIENTS[11], aspectRatio: 0.7, tags: ["네온", "도시", "야경"] },
  { id: "13", title: "엘프 궁수", artist: "FantasyKing", artistAvatar: "F", category: "character-design", likes: 378, views: 1900, comments: 31, gradient: GRADIENTS[0], aspectRatio: 1.35, tags: ["엘프", "궁수", "판타지"] },
  { id: "14", title: "우주 탐험가", artist: "StarGaze", artistAvatar: "S", category: "illustration", likes: 267, views: 1400, comments: 19, gradient: GRADIENTS[3], aspectRatio: 0.9, tags: ["우주", "탐험", "SF"] },
  { id: "15", title: "전투 메카", artist: "MechaPilot", artistAvatar: "M", category: "animation", likes: 412, views: 2300, comments: 35, gradient: GRADIENTS[5], aspectRatio: 1.15, tags: ["메카", "로봇", "액션"] },
  { id: "16", title: "요정의 숲", artist: "FloralArt", artistAvatar: "F", category: "illustration", likes: 189, views: 1100, comments: 11, gradient: GRADIENTS[7], aspectRatio: 1.45, tags: ["요정", "숲", "판타지"] },
  { id: "17", title: "사무라이 혼", artist: "BushidoArt", artistAvatar: "B", category: "character-design", likes: 534, views: 2900, comments: 48, gradient: GRADIENTS[9], aspectRatio: 1.0, tags: ["사무라이", "일본", "전통"] },
  { id: "18", title: "크리스탈 동굴", artist: "DeepBlue", artistAvatar: "D", category: "concept-art", likes: 223, views: 1300, comments: 16, gradient: GRADIENTS[1], aspectRatio: 0.65, tags: ["동굴", "크리스탈", "판타지"] },
]

const FEATURED_ARTISTS = [
  { name: "FantasyKing", avatar: "F", works: 142, followers: 3200, specialty: "판타지 일러스트" },
  { name: "NeonDraw", avatar: "N", works: 98, followers: 2100, specialty: "사이버펑크" },
  { name: "FloralArt", avatar: "F", works: 76, followers: 1800, specialty: "자연/풍경" },
  { name: "MagicPen", avatar: "M", works: 115, followers: 2700, specialty: "만화/웹툰" },
]

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export default function ArtPage() {
  const [activeCategory, setActiveCategory] = useState("all")
  const [activeSort, setActiveSort] = useState("hot")
  const [showTopPeriod, setShowTopPeriod] = useState(false)

  const filteredArtworks = activeCategory === "all"
    ? MOCK_ARTWORKS
    : MOCK_ARTWORKS.filter(a => a.category === activeCategory)

  return (
    <div className="space-y-5">
      {/* Sort + Category Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        {/* Sort Buttons */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
          {SORT_OPTIONS.map((sort) => {
            const Icon = sort.icon
            const isActive = activeSort === sort.id
            return (
              <button
                key={sort.id}
                onClick={() => {
                  setActiveSort(sort.id)
                  if (sort.id === "top") setShowTopPeriod(!showTopPeriod)
                  else setShowTopPeriod(false)
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {sort.label}
                {sort.id === "top" && isActive && <ChevronDown className="h-3 w-3" />}
              </button>
            )
          })}
          {showTopPeriod && (
            <div className="flex items-center gap-0.5 ml-1 pl-1 border-l border-border">
              {["일", "주", "월", "전체"].map((period) => (
                <button
                  key={period}
                  className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
                >
                  {period}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                activeCategory === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content: Gallery + Sidebar */}
      <div className="grid grid-cols-12 gap-5 lg:gap-6">
        {/* Masonry Gallery */}
        <div className="col-span-12 lg:col-span-9">
          <div className="columns-2 sm:columns-3 md:columns-4 gap-2 sm:gap-2.5">
            {filteredArtworks.map((artwork) => (
              <ArtworkCard key={artwork.id} artwork={artwork} />
            ))}
          </div>

          {filteredArtworks.length === 0 && (
            <div className="text-center py-16">
              <Palette className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">이 카테고리에 작품이 없습니다.</p>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <aside className="hidden lg:block col-span-3 space-y-4">
          {/* Featured Artists */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="font-bold text-sm text-foreground mb-3">인기 아티스트</h3>
            <div className="space-y-3">
              {FEATURED_ARTISTS.map((artist) => (
                <div key={artist.name} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
                    {artist.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{artist.name}</p>
                    <p className="text-[11px] text-muted-foreground">{artist.specialty}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-muted-foreground">{formatCount(artist.followers)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Commission Banner */}
          <div className="bg-gradient-to-br from-red-900 via-red-800 to-red-900 border border-red-700/30 rounded-xl p-4">
            <h3 className="font-bold text-sm text-white mb-1.5">커미션 의뢰하기</h3>
            <p className="text-xs text-red-200 mb-3">마음에 드는 작가에게 직접 작품을 의뢰해보세요.</p>
            <button className="w-full py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors">
              커미션 마켓 둘러보기
            </button>
          </div>

          {/* Popular Tags */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="font-bold text-sm text-foreground mb-3">인기 태그</h3>
            <div className="flex flex-wrap gap-1.5">
              {["판타지", "캐릭터", "SF", "자연", "사이버펑크", "만화", "동물", "풍경", "메카", "전통"].map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-muted/60 text-muted-foreground text-[11px] rounded-md hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function ArtworkCard({ artwork }: { artwork: MockArtwork }) {
  return (
    <div className="break-inside-avoid mb-2 sm:mb-3 group">
      <Link href={`/art/${artwork.id}`} className="block">
        <div className="relative overflow-hidden rounded-lg cursor-pointer">
          {/* Image area */}
          <div
            className={`relative bg-gradient-to-br ${artwork.gradient} w-full`}
            style={{ paddingBottom: `${artwork.aspectRatio * 100}%` }}
          >
            {/* Subtle art icon */}
            <div className="absolute inset-0 flex items-center justify-center opacity-10">
              <Palette className="w-12 h-12 text-white" />
            </div>

            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-white font-semibold text-[13px] leading-tight line-clamp-1 drop-shadow-sm">{artwork.title}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <div className="w-5 h-5 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center text-[9px] text-white font-bold">
                    {artwork.artistAvatar}
                  </div>
                  <span className="text-white/90 text-xs drop-shadow-sm">{artwork.artist}</span>
                </div>
                <div className="flex items-center gap-3 mt-2 text-white/80">
                  <span className="flex items-center gap-1 text-[11px]">
                    <Heart className="h-3 w-3" />
                    {formatCount(artwork.likes)}
                  </span>
                  <span className="flex items-center gap-1 text-[11px]">
                    <Eye className="h-3 w-3" />
                    {formatCount(artwork.views)}
                  </span>
                  <span className="flex items-center gap-1 text-[11px]">
                    <MessageSquare className="h-3 w-3" />
                    {artwork.comments}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </div>
  )
}
