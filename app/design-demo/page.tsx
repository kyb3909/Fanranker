"use client"

import { TitleBadge } from "@/components/profile/title-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  Calendar,
  Trophy,
  ImageIcon,
  ThumbsUp,
  MessageSquare,
  Newspaper,
} from "lucide-react"
import { getTemperatureStyle } from "@/lib/temperature"

// ===== 유저 플레어 (닉네임 아래 칭호 뱃지) =====

function UserFlair({
  adj,
  noun,
  rarity = "common",
}: {
  adj: string | null
  noun: string
  rarity?: "common" | "rare" | "epic" | "legendary"
}) {
  const label = adj ? `${adj} ${noun}` : noun

  const bg = {
    common: "bg-slate-100 dark:bg-slate-800/60",
    rare: "bg-blue-50 dark:bg-blue-950/60",
    epic: "bg-purple-50 dark:bg-purple-950/60",
    legendary:
      "bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/60 dark:to-yellow-950/60",
  }
  const text = {
    common: "text-slate-600 dark:text-slate-300",
    rare: "text-blue-600 dark:text-blue-300",
    epic: "text-purple-600 dark:text-purple-300",
    legendary: "text-amber-700 dark:text-amber-300",
  }

  return (
    <span
      className={`inline-flex items-center rounded-sm px-1.5 py-[1px] text-[12px] leading-tight font-medium ${bg[rarity]} ${text[rarity]}`}
    >
      {label}
    </span>
  )
}

// ===== 닉네임 + 플레어 (게시글/댓글용 — 픽셀아트 없음) =====

function UserBlock({
  nickname,
  adj,
  noun,
  rarity,
  time,
  size = "md",
}: {
  nickname: string
  adj: string | null
  noun: string
  rarity: "common" | "rare" | "epic" | "legendary"
  time?: string
  size?: "sm" | "md"
}) {
  const nameSize = size === "sm" ? "text-[13px]" : "text-[14px]"

  return (
    <div className="flex flex-col leading-none">
      <div className="flex items-center gap-1.5">
        <span className={`text-foreground font-semibold ${nameSize}`}>{nickname}</span>
        {time && <span className="text-muted-foreground text-[12px]">{time}</span>}
      </div>
      <div className="mt-0.5">
        <UserFlair adj={adj} noun={noun} rarity={rarity} />
      </div>
    </div>
  )
}

// ===== 유저 데이터 =====

interface UserDemo {
  nickname: string
  avatar: string
  adj: string | null
  rarity: "common" | "rare" | "epic" | "legendary"
  noun: string
  art: string | null
  temp: number
}

const users: UserDemo[] = [
  {
    nickname: "풋볼매니아_kr",
    avatar: "😎",
    adj: "축잘알",
    rarity: "epic",
    noun: "꾸레",
    art: "/pixel-art/messi.png",
    temp: 42.5,
  },
  {
    nickname: "야구도사",
    avatar: "🧢",
    adj: "예언자",
    rarity: "legendary",
    noun: "4번타자",
    art: null,
    temp: 38.2,
  },
  {
    nickname: "게임러",
    avatar: "🎮",
    adj: "똥손의",
    rarity: "common",
    noun: "브론즈",
    art: "/pixel-art/messi.png",
    temp: 36.1,
  },
  {
    nickname: "시네필",
    avatar: "🎬",
    adj: null,
    rarity: "common",
    noun: "관객",
    art: null,
    temp: 35.0,
  },
  {
    nickname: "덕후킹",
    avatar: "🌸",
    adj: "덕통사고",
    rarity: "rare",
    noun: "오타쿠",
    art: "/pixel-art/messi.png",
    temp: 39.8,
  },
]

// ===== Mock 게시글 (칭호만, 픽셀아트 없음) =====

function MockPost({ u, title, body }: { u: UserDemo; title: string; body: string }) {
  return (
    <div className="border-border bg-card rounded-xl border p-4">
      <div className="mb-3 flex items-start gap-2.5">
        <div className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg">
          {u.avatar}
        </div>
        <UserBlock
          nickname={u.nickname}
          adj={u.adj}
          noun={u.noun}
          rarity={u.rarity}
          time="6분 전"
        />
      </div>
      <h3 className="text-foreground mb-1.5 text-[16px] font-semibold">{title}</h3>
      <p className="text-muted-foreground text-[13px] leading-relaxed">{body}</p>
      <div className="border-border/40 text-muted-foreground mt-3 flex items-center gap-3 border-t pt-3 text-[12px]">
        <button className="hover:text-foreground flex items-center gap-1 transition-colors">
          <span>👍</span> 42
        </button>
        <button className="hover:text-foreground flex items-center gap-1 transition-colors">
          <span>💬</span> 13
        </button>
        <button className="hover:text-foreground transition-colors">공유</button>
      </div>
    </div>
  )
}

// ===== Mock 댓글 (칭호만, 픽셀아트 없음) =====

function MockComment({ u, text }: { u: UserDemo; text: string }) {
  return (
    <div className="flex gap-2.5 py-3">
      <div className="bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm">
        {u.avatar}
      </div>
      <div className="min-w-0 flex-1">
        <UserBlock
          nickname={u.nickname}
          adj={u.adj}
          noun={u.noun}
          rarity={u.rarity}
          time="1시간 전"
          size="sm"
        />
        <p className="text-foreground/90 mt-1 text-[13px]">{text}</p>
        <div className="text-muted-foreground mt-1 flex gap-3 text-[12px]">
          <button className="hover:text-foreground">👍 5</button>
          <button className="hover:text-foreground">답글</button>
        </div>
      </div>
    </div>
  )
}

// ===== Mock 프로필 (여기서만 픽셀아트 표시) =====

function MockProfile({ u }: { u: UserDemo }) {
  return (
    <div className="border-border bg-card rounded-xl border p-5">
      <div className="flex items-start gap-4">
        {/* 아바타 */}
        <div className="bg-muted ring-border flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl ring-2">
          {u.avatar}
        </div>

        <div className="flex flex-col gap-1.5">
          {/* 닉네임 + 온도 */}
          <div className="flex items-center gap-2">
            <h2 className="text-foreground text-xl font-bold">{u.nickname}</h2>
            <span className="text-sm font-semibold text-orange-500">{u.temp}°</span>
          </div>

          {/* 칭호 */}
          <UserFlair adj={u.adj} noun={u.noun} rarity={u.rarity} />

          {/* 종목별 레벨 */}
          <div className="text-muted-foreground flex flex-wrap gap-x-3 text-[12px]">
            <span>⚽ 축구 Lv.7</span>
            <span>⚾ 야구 Lv.3</span>
            <span>🎮 게임 Lv.5</span>
          </div>

          {/* 픽셀아트 컬렉션 (프로필 전용) */}
          {u.art && (
            <div className="border-border/40 mt-2 border-t pt-2">
              <p className="text-muted-foreground mb-1.5 text-[12px] font-medium">보유 픽셀아트</p>
              <div className="flex gap-2">
                <div className="border-border/40 bg-muted/20 h-12 w-12 overflow-hidden rounded-lg border p-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u.art} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="border-border/60 bg-muted/10 text-muted-foreground flex h-12 w-12 items-center justify-center rounded-lg border border-dashed text-[12px]">
                  +
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ===== 상점 =====

function MockShop() {
  const items = [
    { name: "메시", price: 300, cat: "축구" },
    { name: "호날두", price: 300, cat: "축구" },
    { name: "손흥민", price: 300, cat: "축구" },
    { name: "오타니", price: 250, cat: "야구" },
    { name: "페이커", price: 350, cat: "게임" },
    { name: "나루토", price: 200, cat: "애니" },
  ]
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {items.map((it) => (
        <button
          key={it.name}
          className="group border-border bg-card hover:border-primary/40 flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all hover:shadow-sm"
        >
          <div className="border-border/30 bg-muted/20 overflow-hidden rounded-lg border p-1 transition-transform group-hover:scale-105">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pixel-art/messi.png" alt={it.name} className="h-11 w-11 object-cover" />
          </div>
          <p className="text-xs font-medium">{it.name}</p>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[12px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            {it.price}P
          </span>
        </button>
      ))}
    </div>
  )
}

// ===== 히어로: Before → After =====

function Hero() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Before */}
      <div className="border-border bg-card rounded-xl border p-4">
        <p className="text-muted-foreground mb-3 text-[12px] font-bold tracking-widest uppercase">
          Before
        </p>
        <div className="flex items-center gap-2">
          <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full text-sm">
            😎
          </div>
          <span className="text-foreground text-[14px] font-medium">풋볼매니아_kr</span>
          <span className="text-border">|</span>
          <span className="text-xs text-blue-500">🌡 8°</span>
        </div>
      </div>

      {/* After */}
      <div className="border-primary/30 bg-primary/[0.03] rounded-xl border-2 p-4">
        <p className="text-primary mb-3 text-[12px] font-bold tracking-widest uppercase">After</p>
        <div className="flex items-center gap-2.5">
          <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm">
            😎
          </div>
          <div className="flex flex-col leading-none">
            <div className="flex items-center gap-1.5">
              <span className="text-foreground text-[14px] font-semibold">풋볼매니아_kr</span>
              <span className="text-muted-foreground text-[12px]">6분 전</span>
            </div>
            <div className="mt-0.5">
              <UserFlair adj="축잘알" noun="꾸레" rarity="epic" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== 칭호 예시 모음 =====

function FlairShowcase() {
  const list = [
    { adj: "축잘알", noun: "꾸레", rarity: "epic" as const },
    { adj: "천재", noun: "구너", rarity: "epic" as const },
    { adj: "예언자", noun: "4번타자", rarity: "legendary" as const },
    { adj: "열정적인", noun: "레드데빌", rarity: "rare" as const },
    { adj: "똥손의", noun: "브론즈", rarity: "common" as const },
    { adj: "감성적인", noun: "평론가", rarity: "rare" as const },
    { adj: "덕통사고", noun: "오타쿠", rarity: "epic" as const },
    { adj: "전설의", noun: "팬마스터", rarity: "legendary" as const },
    { adj: null, noun: "신입 팬", rarity: "common" as const },
  ]
  const rarityLabel = { common: "일반", rare: "희귀", epic: "영웅", legendary: "전설" }

  return (
    <div className="flex flex-wrap gap-2">
      {list.map((t, i) => (
        <div key={i} className="bg-muted/30 flex items-center gap-2 rounded-lg px-3 py-2">
          <UserFlair adj={t.adj} noun={t.noun} rarity={t.rarity} />
          <span className="text-muted-foreground text-[12px]">{rarityLabel[t.rarity]}</span>
        </div>
      ))}
    </div>
  )
}

// ===== 공개 프로필 페이지 (실제 레이아웃 재현) =====

function FullProfilePage() {
  const u = users[0]
  const mockBoardPoints = [
    {
      board_slug: "football",
      name: "축구",
      total_points: 2850,
      available_points: 1200,
      level: 7,
      adj: "축잘알",
      noun: "꾸레",
      rarity: "epic" as const,
    },
    {
      board_slug: "baseball",
      name: "야구",
      total_points: 420,
      available_points: 320,
      level: 4,
      adj: null,
      noun: "관중석",
      rarity: "common" as const,
    },
    {
      board_slug: "game",
      name: "게임",
      total_points: 1100,
      available_points: 600,
      level: 6,
      adj: "똥손의",
      noun: "브론즈",
      rarity: "common" as const,
    },
  ]
  const mockPosts = [
    {
      id: "1",
      title: "오늘 경기 미쳤다 ㄹㅇ 역대급",
      vote_count: 42,
      comment_count: 13,
      created_at: "2시간 전",
      community: "축구",
    },
    {
      id: "2",
      title: "손흥민 근황 봤냐 컨디션 좋아보임",
      vote_count: 28,
      comment_count: 7,
      created_at: "5시간 전",
      community: "축구",
    },
    {
      id: "3",
      title: "롤 시즌 메타 정리해봄",
      vote_count: 15,
      comment_count: 4,
      created_at: "1일 전",
      community: "게임",
    },
    {
      id: "4",
      title: "KBO 개막전 승부예측 결과",
      vote_count: 31,
      comment_count: 9,
      created_at: "2일 전",
      community: "야구",
    },
  ]
  const mockPixelArts = [
    { name: "메시", cat: "축구" },
    { name: "손흥민", cat: "축구" },
    { name: "페이커", cat: "게임" },
  ]

  return (
    <main className="mx-auto max-w-[600px] space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">프로필</h1>
      </div>

      {/* 프로필 헤더 */}
      <Card className="overflow-hidden">
        <div className="bg-card border-border flex items-start justify-between border-b p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 sm:h-20 sm:w-20">
              <AvatarFallback className="text-2xl">{u.avatar}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-foreground text-xl font-bold sm:text-2xl">{u.nickname}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  <Newspaper className="h-3 w-3" />
                  기자
                </span>
              </div>
              <div className="flex items-center gap-1 text-sm" style={getTemperatureStyle(u.temp)}>
                <span className="font-semibold">온도</span>
                <span className="font-bold">{u.temp.toFixed(1)}°</span>
              </div>
            </div>
          </div>
          <Button variant="default" size="sm" className="gap-2">
            <span>팔로우</span>
          </Button>
        </div>
        <p className="text-muted-foreground px-4 pt-2 pb-4 text-sm sm:px-6">
          축구 마니아입니다. EPL, 라리가 위주로 활동하고 있어요. 승부예측 적중률 78% 달성 중!
        </p>
        <div className="text-muted-foreground flex items-center gap-1.5 px-4 pb-4 text-xs sm:px-6">
          <Calendar className="h-3.5 w-3.5" />
          <span>2025년 8월 가입</span>
        </div>
      </Card>

      {/* 활동 & 칭호 */}
      <Card className="overflow-hidden">
        <div className="border-border border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">활동 & 칭호</h3>
          </div>
        </div>
        <div className="divide-border divide-y">
          {mockBoardPoints.map((bp) => (
            <div key={bp.board_slug} className="flex items-center justify-between px-4 py-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{bp.name}</span>
                {(bp.adj || bp.noun) && (
                  <TitleBadge adjTitle={bp.adj} nounTitle={bp.noun} rarity={bp.rarity} size="sm" />
                )}
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">Lv.{bp.level}</span>
                <span className="font-medium text-amber-600 tabular-nums dark:text-amber-400">
                  {bp.total_points.toLocaleString()}P
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 픽셀아트 컬렉션 */}
      <Card className="overflow-hidden">
        <div className="border-border border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="text-primary h-4 w-4" />
            <h3 className="text-sm font-semibold">픽셀아트 컬렉션</h3>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 p-4 sm:grid-cols-5">
          {mockPixelArts.map((pa) => (
            <div key={pa.name} className="flex flex-col items-center gap-1">
              <div className="bg-muted flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded bg-gradient-to-br from-blue-200 to-purple-200 text-lg dark:from-blue-800 dark:to-purple-800"
                  style={{ imageRendering: "pixelated" }}
                >
                  {pa.cat === "축구" ? "⚽" : "🎮"}
                </div>
              </div>
              <span className="text-muted-foreground text-[12px]">{pa.name}</span>
            </div>
          ))}
          <div className="flex flex-col items-center gap-1">
            <div className="border-border/60 bg-muted/20 text-muted-foreground flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed text-xs">
              +3
            </div>
            <span className="text-muted-foreground text-[12px]">더보기</span>
          </div>
        </div>
      </Card>

      {/* 최근 작성글 */}
      <Card className="overflow-hidden">
        <div className="border-border border-b px-4 py-3">
          <h3 className="text-sm font-semibold">최근 작성글</h3>
        </div>
        <div className="divide-border divide-y">
          {mockPosts.map((post) => (
            <div
              key={post.id}
              className="hover:bg-muted/50 block cursor-pointer px-4 py-3 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-sm font-medium">{post.title}</p>
                  <div className="text-muted-foreground mt-1 flex items-center gap-3 text-xs">
                    <span>{post.community}</span>
                    <span>{post.created_at}</span>
                  </div>
                </div>
                <div className="text-muted-foreground flex shrink-0 items-center gap-2.5 text-xs">
                  <span className="flex items-center gap-0.5">
                    <ThumbsUp className="h-3 w-3" />
                    {post.vote_count}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <MessageSquare className="h-3 w-3" />
                    {post.comment_count}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </main>
  )
}

// ===== 페이지 =====

export default function DesignDemoPage() {
  return (
    <div className="bg-background min-h-screen px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-10">
        {/* 공개 프로필 페이지 전체 미리보기 */}
        <section className="space-y-3">
          <div className="bg-primary/5 border-primary/20 rounded-lg border p-3">
            <h2 className="text-primary text-lg font-bold">공개 프로필 페이지 (실제 레이아웃)</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              다른 유저가 닉네임 클릭 시 보게 되는 페이지
            </p>
          </div>
          <FullProfilePage />
        </section>

        <div className="border-border border-t pt-8">
          <h1 className="text-foreground text-2xl font-bold">칭호 & 픽셀아트 디자인</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            게시글/댓글: 닉네임 아래 칭호 · 프로필: 픽셀아트 컬렉션
          </p>
        </div>

        {/* Before / After */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Before → After (게시글/댓글)</h2>
          <Hero />
        </section>

        {/* 구조 설명 */}
        <div className="border-border bg-muted/20 rounded-xl border border-dashed p-4 text-center">
          <p className="text-sm">
            <span className="font-semibold">게시글/댓글</span>: 닉네임 + 칭호 뱃지만 표시
          </p>
          <p className="mt-1 text-sm">
            <span className="font-semibold">프로필 페이지</span>: 칭호 + 보유 픽셀아트 컬렉션 표시
          </p>
          <p className="text-muted-foreground mt-2 text-[12px]">
            형용사 = 업적 달성 · 명사 = 포인트로 구매 · 픽셀아트 = 상점 구매 (프로필 꾸미기)
          </p>
        </div>

        {/* 게시글 (칭호만) */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold">게시글 (칭호만)</h2>
          <div className="space-y-2">
            <MockPost
              u={users[0]}
              title="오늘 경기 미쳤다 ㄹㅇ"
              body="진짜 후반 30분부터 완전 달라졌음... 역대급 경기였다고 봅니다."
            />
            <MockPost
              u={users[1]}
              title="내일 경기 예측해봄"
              body="데이터 분석해봤는데 확실히 홈팀이 유리하다고 봅니다."
            />
          </div>
        </section>

        {/* 댓글 (칭호만) */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold">댓글 (칭호만)</h2>
          <div className="divide-border/40 border-border bg-card divide-y rounded-xl border px-4">
            <MockComment u={users[0]} text="ㄹㅇ 역대급이었음 ㅋㅋ" />
            <MockComment u={users[1]} text="예언자가 또 맞췄네..." />
            <MockComment u={users[2]} text="ㅋㅋㅋ 난 또 틀렸다" />
            <MockComment u={users[3]} text="처음 봤는데 재밌었어요" />
            <MockComment u={users[4]} text="덕통사고 당할뻔 ㅋㅋㅋ" />
          </div>
        </section>

        {/* 칭호 모음 */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold">칭호 조합 예시</h2>
          <div className="border-border bg-card rounded-xl border p-4">
            <FlairShowcase />
          </div>
        </section>

        {/* 상점 */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold">픽셀아트 상점 (프로필 꾸미기용)</h2>
          <div className="border-border bg-card rounded-xl border p-4">
            <MockShop />
          </div>
        </section>
      </div>
    </div>
  )
}
