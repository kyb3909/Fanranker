"use client"

import { use } from "react"
import { useState } from "react"
import { Heart, Eye, MessageSquare, Share2, Flag, Download, Palette, ArrowLeft, Send } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { formatCount } from "@/lib/utils/format"

// --- Mock Data (동일한 데이터 재사용) ---

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

interface MockArtwork {
  id: string
  title: string
  artist: string
  artistAvatar: string
  category: string
  categoryLabel: string
  likes: number
  views: number
  comments: number
  gradient: string
  aspectRatio: number
  tags: string[]
  description: string
  createdAt: string
}

const CATEGORY_LABELS: Record<string, string> = {
  "illustration": "일러스트",
  "character-design": "캐릭터 디자인",
  "concept-art": "컨셉 아트",
  "comic": "만화",
  "animation": "애니메이션",
  "graphic-design": "그래픽 디자인",
}

const MOCK_ARTWORKS: MockArtwork[] = [
  { id: "1", title: "숲속의 수호자", artist: "ArtistKim", artistAvatar: "K", category: "illustration", categoryLabel: "일러스트", likes: 342, views: 1820, comments: 28, gradient: GRADIENTS[0], aspectRatio: 1.4, tags: ["판타지", "숲", "캐릭터"], description: "깊은 숲속에서 고대의 힘을 수호하는 전사의 모습을 그렸습니다. 자연과 마법이 공존하는 세계관을 표현했습니다.", createdAt: "2026-02-14" },
  { id: "2", title: "고대 사원의 비밀", artist: "PixelMaster", artistAvatar: "P", category: "concept-art", categoryLabel: "컨셉 아트", likes: 256, views: 1340, comments: 15, gradient: GRADIENTS[1], aspectRatio: 0.75, tags: ["배경", "건축", "판타지"], description: "잊혀진 문명의 사원을 발견한 탐험가의 시점으로 그린 컨셉 아트입니다.", createdAt: "2026-02-13" },
  { id: "3", title: "사이버 전사", artist: "NeonDraw", artistAvatar: "N", category: "character-design", categoryLabel: "캐릭터 디자인", likes: 489, views: 2650, comments: 42, gradient: GRADIENTS[2], aspectRatio: 1.2, tags: ["사이버펑크", "캐릭터", "SF"], description: "2077년 네온시티의 거리를 지키는 사이버 전사. 기계와 인간의 경계에서 싸우는 캐릭터를 디자인했습니다.", createdAt: "2026-02-12" },
  { id: "4", title: "봄의 정원", artist: "FloralArt", artistAvatar: "F", category: "illustration", categoryLabel: "일러스트", likes: 178, views: 980, comments: 12, gradient: GRADIENTS[3], aspectRatio: 1.0, tags: ["자연", "꽃", "풍경"], description: "봄이 찾아온 정원의 평화로운 풍경을 수채화 느낌으로 표현했습니다.", createdAt: "2026-02-11" },
  { id: "5", title: "드래곤 나이트", artist: "FantasyKing", artistAvatar: "F", category: "illustration", categoryLabel: "일러스트", likes: 612, views: 3200, comments: 56, gradient: GRADIENTS[4], aspectRatio: 1.5, tags: ["드래곤", "기사", "판타지"], description: "드래곤과 함께 전장을 누비는 기사의 영웅적인 순간을 포착했습니다.", createdAt: "2026-02-10" },
  { id: "6", title: "미래 도시 스카이라인", artist: "SciFiVision", artistAvatar: "S", category: "concept-art", categoryLabel: "컨셉 아트", likes: 301, views: 1750, comments: 23, gradient: GRADIENTS[5], aspectRatio: 0.6, tags: ["SF", "도시", "미래"], description: "100년 후 서울의 모습을 상상하며 그린 미래 도시 스카이라인입니다.", createdAt: "2026-02-09" },
  { id: "7", title: "마법소녀 변신", artist: "MagicPen", artistAvatar: "M", category: "comic", categoryLabel: "만화", likes: 445, views: 2100, comments: 38, gradient: GRADIENTS[6], aspectRatio: 1.3, tags: ["만화", "마법소녀", "액션"], description: "마법소녀 시리즈의 변신 장면을 역동적으로 연출했습니다.", createdAt: "2026-02-08" },
  { id: "8", title: "언더워터 킹덤", artist: "DeepBlue", artistAvatar: "D", category: "illustration", categoryLabel: "일러스트", likes: 234, views: 1200, comments: 18, gradient: GRADIENTS[7], aspectRatio: 0.8, tags: ["수중", "판타지", "왕국"], description: "심해에 존재하는 수중 왕국의 신비로운 모습을 담았습니다.", createdAt: "2026-02-07" },
  { id: "9", title: "로봇 친구", artist: "TechDoodle", artistAvatar: "T", category: "character-design", categoryLabel: "캐릭터 디자인", likes: 156, views: 890, comments: 9, gradient: GRADIENTS[8], aspectRatio: 1.1, tags: ["로봇", "귀여움", "SF"], description: "아이와 로봇의 따뜻한 우정을 표현한 캐릭터 일러스트입니다.", createdAt: "2026-02-06" },
  { id: "10", title: "달빛 아래 여우", artist: "MoonlitArt", artistAvatar: "M", category: "illustration", categoryLabel: "일러스트", likes: 523, views: 2800, comments: 45, gradient: GRADIENTS[9], aspectRatio: 1.25, tags: ["동물", "달", "자연"], description: "보름달 아래 신비로운 빛을 내뿜는 여우를 그렸습니다.", createdAt: "2026-02-05" },
  { id: "11", title: "스팀펑크 시계탑", artist: "GearWorks", artistAvatar: "G", category: "concept-art", categoryLabel: "컨셉 아트", likes: 287, views: 1500, comments: 21, gradient: GRADIENTS[10], aspectRatio: 1.6, tags: ["스팀펑크", "건축", "기계"], description: "거대한 톱니바퀴로 작동하는 시계탑의 내부를 상상했습니다.", createdAt: "2026-02-04" },
  { id: "12", title: "네온 거리", artist: "NeonDraw", artistAvatar: "N", category: "graphic-design", categoryLabel: "그래픽 디자인", likes: 198, views: 1050, comments: 14, gradient: GRADIENTS[11], aspectRatio: 0.7, tags: ["네온", "도시", "야경"], description: "비 오는 밤, 네온사인이 반사되는 도시의 골목을 표현했습니다.", createdAt: "2026-02-03" },
  { id: "13", title: "엘프 궁수", artist: "FantasyKing", artistAvatar: "F", category: "character-design", categoryLabel: "캐릭터 디자인", likes: 378, views: 1900, comments: 31, gradient: GRADIENTS[0], aspectRatio: 1.35, tags: ["엘프", "궁수", "판타지"], description: "숲의 수호자 엘프 궁수의 캐릭터 시트입니다.", createdAt: "2026-02-02" },
  { id: "14", title: "우주 탐험가", artist: "StarGaze", artistAvatar: "S", category: "illustration", categoryLabel: "일러스트", likes: 267, views: 1400, comments: 19, gradient: GRADIENTS[3], aspectRatio: 0.9, tags: ["우주", "탐험", "SF"], description: "미지의 행성을 탐사하는 우주 비행사의 모습입니다.", createdAt: "2026-02-01" },
  { id: "15", title: "전투 메카", artist: "MechaPilot", artistAvatar: "M", category: "animation", categoryLabel: "애니메이션", likes: 412, views: 2300, comments: 35, gradient: GRADIENTS[5], aspectRatio: 1.15, tags: ["메카", "로봇", "액션"], description: "거대 로봇의 전투 장면을 애니메이션 스타일로 그렸습니다.", createdAt: "2026-01-31" },
  { id: "16", title: "요정의 숲", artist: "FloralArt", artistAvatar: "F", category: "illustration", categoryLabel: "일러스트", likes: 189, views: 1100, comments: 11, gradient: GRADIENTS[7], aspectRatio: 1.45, tags: ["요정", "숲", "판타지"], description: "요정들이 사는 비밀의 숲을 환상적으로 표현했습니다.", createdAt: "2026-01-30" },
  { id: "17", title: "사무라이 혼", artist: "BushidoArt", artistAvatar: "B", category: "character-design", categoryLabel: "캐릭터 디자인", likes: 534, views: 2900, comments: 48, gradient: GRADIENTS[9], aspectRatio: 1.0, tags: ["사무라이", "일본", "전통"], description: "무사도의 정신을 담은 사무라이 캐릭터입니다.", createdAt: "2026-01-29" },
  { id: "18", title: "크리스탈 동굴", artist: "DeepBlue", artistAvatar: "D", category: "concept-art", categoryLabel: "컨셉 아트", likes: 223, views: 1300, comments: 16, gradient: GRADIENTS[1], aspectRatio: 0.65, tags: ["동굴", "크리스탈", "판타지"], description: "빛나는 크리스탈로 가득한 지하 동굴의 컨셉 아트입니다.", createdAt: "2026-01-28" },
]

const ARTIST_STATS: Record<string, { works: number; followers: number; bio: string }> = {
  ArtistKim: { works: 87, followers: 1500, bio: "판타지와 자연을 사랑하는 일러스트레이터" },
  PixelMaster: { works: 64, followers: 1200, bio: "배경과 건축 전문 컨셉 아티스트" },
  NeonDraw: { works: 98, followers: 2100, bio: "사이버펑크와 네온 아트 전문" },
  FloralArt: { works: 76, followers: 1800, bio: "자연과 꽃을 주제로 작업합니다" },
  FantasyKing: { works: 142, followers: 3200, bio: "판타지 세계를 그리는 일러스트레이터" },
  SciFiVision: { works: 55, followers: 900, bio: "SF와 미래 도시를 상상합니다" },
  MagicPen: { works: 115, followers: 2700, bio: "만화와 웹툰을 그립니다" },
  DeepBlue: { works: 43, followers: 800, bio: "수중 세계와 신비로운 풍경" },
  TechDoodle: { works: 38, followers: 600, bio: "귀여운 캐릭터와 로봇 전문" },
  MoonlitArt: { works: 92, followers: 2400, bio: "달빛 아래 동물들의 이야기" },
  GearWorks: { works: 61, followers: 1100, bio: "스팀펑크와 기계 미학" },
  StarGaze: { works: 47, followers: 700, bio: "우주와 별을 그립니다" },
  MechaPilot: { works: 73, followers: 1600, bio: "메카와 로봇 액션 전문" },
  BushidoArt: { works: 56, followers: 1300, bio: "일본 전통 문화와 사무라이" },
}

const MOCK_COMMENTS = [
  { id: "c1", user: "ArtFan01", avatar: "A", text: "정말 멋진 작품이네요! 색감이 환상적입니다.", time: "2시간 전", likes: 12 },
  { id: "c2", user: "DrawLover", avatar: "D", text: "디테일이 살아있어요. 특히 빛 표현이 좋습니다.", time: "5시간 전", likes: 8 },
  { id: "c3", user: "PixelHeart", avatar: "P", text: "이 스타일로 커미션 받으시나요?", time: "1일 전", likes: 3 },
]

export default function ArtworkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [liked, setLiked] = useState(false)
  const [commentText, setCommentText] = useState("")

  const artwork = MOCK_ARTWORKS.find((a) => a.id === id)
  if (!artwork) {
    return (
      <div className="text-center py-20">
        <Palette className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground">작품을 찾을 수 없습니다.</p>
        <Link href="/art" className="text-primary text-sm mt-2 inline-block hover:underline">갤러리로 돌아가기</Link>
      </div>
    )
  }

  const artistStats = ARTIST_STATS[artwork.artist] || { works: 0, followers: 0, bio: "" }

  // 같은 작가의 다른 작품 또는 랜덤 추천
  const recommended = MOCK_ARTWORKS
    .filter((a) => a.id !== artwork.id)
    .sort(() => 0.5 - Math.random())
    .slice(0, 6)

  return (
    <div className="space-y-4">
      {/* Back */}
      <Link href="/art" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        갤러리
      </Link>

      <div className="grid grid-cols-12 gap-5 lg:gap-6">
        {/* Left: Artwork + Details */}
        <div className="col-span-12 lg:col-span-9 space-y-4">
          {/* Main Image */}
          <div className="relative overflow-hidden rounded-xl bg-card border border-border">
            <div
              className={`relative bg-gradient-to-br ${artwork.gradient} w-full`}
              style={{ paddingBottom: `${Math.min(artwork.aspectRatio, 1.2) * 100}%` }}
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-10">
                <Palette className="w-20 h-20 text-white" />
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className={`gap-1.5 ${liked ? "text-red-500" : "text-muted-foreground"}`}
                onClick={() => setLiked(!liked)}
              >
                <Heart className={`h-4 w-4 ${liked ? "fill-red-500" : ""}`} />
                <span className="text-sm">{liked ? artwork.likes + 1 : artwork.likes}</span>
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
                <span className="text-sm">{artwork.comments}</span>
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <Flag className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Title + Artist (mobile에서 artist 카드 대신) */}
          <div>
            <h1 className="text-xl font-bold text-foreground">{artwork.title}</h1>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                {artwork.artistAvatar}
              </div>
              <span className="text-sm text-muted-foreground">
                by <span className="text-foreground font-medium">{artwork.artist}</span>
              </span>
              <span className="text-xs text-muted-foreground ml-auto">{artwork.createdAt}</span>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">{artwork.description}</p>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {artwork.tags.map((tag) => (
              <span key={tag} className="px-2.5 py-1 bg-muted/60 text-muted-foreground text-xs rounded-md">
                #{tag}
              </span>
            ))}
            <span className="px-2.5 py-1 bg-muted/60 text-muted-foreground text-xs rounded-md">
              {artwork.categoryLabel}
            </span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground py-2 border-t border-border">
            <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> 조회 {formatCount(artwork.views)}</span>
            <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> 좋아요 {formatCount(artwork.likes)}</span>
            <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> 댓글 {artwork.comments}</span>
          </div>

          {/* Comments */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            <h3 className="font-bold text-sm text-foreground">댓글 {artwork.comments}개</h3>

            {/* Comment Input */}
            <div className="flex gap-2">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold shrink-0">
                ?
              </div>
              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  placeholder="댓글을 입력하세요..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="flex-1 h-9 px-3 bg-secondary text-sm text-foreground rounded-lg border border-transparent focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                />
                <Button size="sm" className="h-9 px-3" disabled={!commentText.trim()}>
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Comments List */}
            <div className="space-y-3">
              {MOCK_COMMENTS.map((comment) => (
                <div key={comment.id} className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-[10px] font-bold shrink-0">
                    {comment.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">{comment.user}</span>
                      <span className="text-[11px] text-muted-foreground">{comment.time}</span>
                    </div>
                    <p className="text-sm text-foreground/90 mt-0.5">{comment.text}</p>
                    <button className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                      <Heart className="h-3 w-3" /> {comment.likes}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <aside className="hidden lg:block col-span-3 space-y-4">
          {/* Artist Card */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
                {artwork.artistAvatar}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{artwork.artist}</p>
                <p className="text-[11px] text-muted-foreground line-clamp-1">{artistStats.bio}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span><strong className="text-foreground">{artistStats.works}</strong> 작품</span>
              <span><strong className="text-foreground">{formatCount(artistStats.followers)}</strong> 팔로워</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-8 text-xs">팔로우</Button>
              <Link href={`/art/commissions?artist_id=${artwork.artist}`}>
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs w-full">커미션 문의</Button>
              </Link>
            </div>
          </div>

          {/* Recommended Works */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="font-bold text-sm text-foreground mb-3">추천 작품</h3>
            <div className="grid grid-cols-2 gap-2">
              {recommended.map((rec) => (
                <Link key={rec.id} href={`/art/${rec.id}`} className="group block">
                  <div className="relative overflow-hidden rounded-lg">
                    <div
                      className={`bg-gradient-to-br ${rec.gradient} w-full`}
                      style={{ paddingBottom: "100%" }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-10">
                        <Palette className="w-6 h-6 text-white" />
                      </div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Print / Goods CTA */}
          <div className="bg-gradient-to-br from-red-900 via-red-800 to-red-900 border border-red-700/30 rounded-xl p-4">
            <h3 className="font-bold text-sm text-white mb-1.5">프린팅 요청</h3>
            <p className="text-xs text-red-200 mb-3">이 작품으로 포스터, 티셔츠 등 굿즈를 만들어보세요.</p>
            <button className="w-full py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors">
              굿즈 만들기
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
