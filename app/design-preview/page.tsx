"use client"

/**
 * /design-preview — 담벼락 디자인 개선안 프리뷰 (격리된 샌드박스)
 *
 * ⚠️ 실제 담벼락(components/home/*, post-card*) 과 무관한 독립 목업.
 * 실제 wc 토큰(.worldcup-scope)만 재사용해 브랜드 충실도 유지.
 * GNB 미노출 — 직접 URL(/design-preview)로만 접근. 프로덕션 피드 불변.
 *
 * 토글:
 *  - 개선안(After) ↔ 현재(Before)
 *  - 카드형 ↔ 컴팩트 리스트형 (개선안 전용)
 */

import { useState } from "react"
import {
  ThumbsUp,
  MessageCircle,
  Eye,
  Bookmark,
  Share2,
  MoreHorizontal,
  Flame,
  Pencil,
} from "lucide-react"

// ── 종목 칩 색 (실제 CATEGORY_CHIP 과 동일) ──
const CHIP: Record<string, { bg: string; color: string; emoji: string }> = {
  축구: { bg: "#FDECEC", color: "#9F1239", emoji: "⚽" },
  야구: { bg: "#EAF1FD", color: "#1E3A8A", emoji: "⚾" },
  농구: { bg: "#FDF1E5", color: "#9A3412", emoji: "🏀" },
  배구: { bg: "#F4EEFB", color: "#581C87", emoji: "🏐" },
}

interface MockPost {
  id: number
  sport: keyof typeof CHIP
  team?: string
  author: string
  flair?: string
  time: string
  title: string
  body: string
  link?: { domain: string; title: string; thumb: string }
  image?: string
  votes: number
  comments: number
  views: number
  hot?: boolean
}

const POSTS: MockPost[] = [
  {
    id: 1,
    sport: "축구",
    team: "아스날",
    author: "몽몽이",
    flair: "구너",
    time: "12분 전",
    hot: true,
    title: "아스날, 기마랑이스·토날리 영입 탐색 — 토트넘도 토날리에 큰 관심",
    body: "BBC 사미 목벨 단독. 아스날이 뉴캐슬 더블 미드필더 영입을 두고 탐색적 대화를 나눴다는 보도. 다른 미드필더 옵션도 열려 있는 상태.",
    link: {
      domain: "bbc.co.uk",
      title: "Arsenal exploring moves for Bruno Guimaraes and Sandro Tonali",
      thumb: "https://pbs.twimg.com/card_img/2070529246607319040/QfFNdGOy?format=jpg&name=280x150",
    },
    votes: 34,
    comments: 12,
    views: 412,
  },
  {
    id: 2,
    sport: "야구",
    team: "KIA",
    author: "타이거즈팬",
    flair: "레전드",
    time: "26분 전",
    hot: true,
    title: "[움짤] 9회말 2아웃 끝내기 투런 홈런 — 광주 떠나갔다",
    body: "8:7 역전승. 9회말 2아웃에서 터진 끝내기. 관중석 반응이 미쳤다.",
    image: "x",
    votes: 88,
    comments: 24,
    views: 1203,
  },
  {
    id: 3,
    sport: "농구",
    author: "코트지배자",
    time: "54분 전",
    title: "NBA 트레이드 데드라인 정리 — 우리 팀은 뭘 했나",
    body: "조용히 지나간 듯하지만 백코트 보강은 확실히 한 듯. 로테이션 변화 예상.",
    votes: 9,
    comments: 2,
    views: 88,
  },
  {
    id: 4,
    sport: "배구",
    team: "현대캐피탈",
    author: "스파이크",
    time: "1시간 전",
    title: "세트 핸디캡 베팅, 이번 주 라인업 어떻게 보세요?",
    body: "남자부 V리그 주말 경기 세트 핸디캡이 빡빡하게 잡혔는데 다들 어떻게 보는지.",
    votes: 5,
    comments: 7,
    views: 140,
  },
]

export default function DesignPreviewPage() {
  const [mode, setMode] = useState<"after" | "before">("after")
  const [density, setDensity] = useState<"card" | "compact">("card")

  return (
    <div className="worldcup-scope min-h-screen" style={{ background: "var(--wc-canvas)" }}>
      {/* 프리뷰 안내 바 */}
      <div
        className="sticky top-0 z-20 flex flex-wrap items-center gap-2 px-4 py-2.5 text-[12.5px]"
        style={{ background: "var(--wc-ink)", color: "#fff" }}
      >
        <span className="font-bold">🎨 담벼락 디자인 프리뷰</span>
        <span style={{ color: "#b9c0cc" }}>· 실제 담벼락 아님(목업)</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Toggle on={mode === "after"} onClick={() => setMode("after")}>
            개선안
          </Toggle>
          <Toggle on={mode === "before"} onClick={() => setMode("before")}>
            현재(Before)
          </Toggle>
          {mode === "after" && (
            <>
              <span className="mx-1" style={{ color: "#5b6472" }}>
                |
              </span>
              <Toggle on={density === "card"} onClick={() => setDensity("card")}>
                카드형
              </Toggle>
              <Toggle on={density === "compact"} onClick={() => setDensity("compact")}>
                컴팩트
              </Toggle>
            </>
          )}
        </div>
      </div>

      <div className="mx-auto w-full px-4 py-5 sm:max-w-[640px] sm:px-6">
        {mode === "after" ? <AfterFeed density={density} /> : <BeforeFeed />}
      </div>
    </div>
  )
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors"
      style={{
        background: on ? "var(--wc-burgundy)" : "rgba(255,255,255,.1)",
        color: on ? "#fff" : "#c9cfd8",
      }}
    >
      {children}
    </button>
  )
}

/* ════════════════ AFTER (개선안) ════════════════ */
function AfterFeed({ density }: { density: "card" | "compact" }) {
  return (
    <div className="space-y-2.5">
      {/* E6: 인라인 글쓰기 프롬프트 */}
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)" }}
        >
          <Pencil className="h-4 w-4" />
        </span>
        <span className="flex-1 text-[14px]" style={{ color: "var(--wc-mute)" }}>
          오늘 무슨 공놀이 이야기? 한 줄 남겨보세요…
        </span>
        <span
          className="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-bold"
          style={{ background: "var(--wc-burgundy)", color: "#fff" }}
        >
          글쓰기
        </span>
      </div>

      {/* E7: 종목 필터 + 정렬 (배너는 아래 인레이로 내림) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {["전체", "⚽ 축구", "⚾ 야구", "🏀 농구", "🏐 배구"].map((t, i) => (
          <Chip key={t} active={i === 0}>
            {t}
          </Chip>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <SortChip active>🔥 인기</SortChip>
        <SortChip>최신</SortChip>
        <SortChip>랜덤</SortChip>
      </div>

      {density === "card" ? (
        POSTS.map((p) => <AfterCard key={p.id} p={p} />)
      ) : (
        <div
          className="overflow-hidden rounded-xl"
          style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
        >
          {POSTS.map((p) => (
            <CompactRow key={p.id} p={p} />
          ))}
        </div>
      )}

      {/* 배너 인레이 (피드 흐름 안으로) */}
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3 text-[13.5px] font-bold"
        style={{
          background: "linear-gradient(100deg, var(--wc-burgundy-deep), var(--wc-burgundy))",
          color: "#fff",
        }}
      >
        🏆 <span className="flex-1">월드컵 승부예측 이벤트 — 참가하기</span>
        <span
          className="rounded-md px-2.5 py-1 text-[12px]"
          style={{ background: "rgba(255,255,255,.16)" }}
        >
          참가 →
        </span>
      </div>
    </div>
  )
}

function AfterCard({ p }: { p: MockPost }) {
  const c = CHIP[p.sport]
  return (
    <article
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
    >
      <div style={{ padding: "14px 16px" }}>
        {/* 메타 한 줄: 종목칩+팀 / 시간 / (인기만)🔥 */}
        <div
          className="mb-1.5 flex items-center gap-2 text-[12px]"
          style={{ color: "var(--wc-mute-2)" }}
        >
          <span
            className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] font-bold"
            style={{ background: c.bg, color: c.color }}
          >
            {c.emoji} {p.sport}
            {p.team ? ` · ${p.team}` : ""}
          </span>
          <span>{p.time}</span>
          {p.hot && (
            <span
              className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-bold"
              style={{ color: "var(--wc-burgundy)" }}
            >
              <Flame className="h-3.5 w-3.5" /> 인기
            </span>
          )}
        </div>

        {/* 제목 2줄 + 본문 2줄 (E2) */}
        <h2
          className="text-[16.5px] leading-snug font-bold"
          style={{ color: "var(--wc-ink)", letterSpacing: "-0.01em" }}
        >
          {p.title}
        </h2>
        <p
          className="mt-1 text-[13.5px] leading-relaxed"
          style={{
            color: "var(--wc-mute)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {p.body}
        </p>

        {/* E1: 임베드 = 접힌 작은 링크 카드 */}
        {p.link && (
          <div
            className="mt-2.5 flex items-center gap-3 rounded-lg border p-2"
            style={{ borderColor: "var(--wc-line)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.link.thumb}
              alt=""
              className="h-[52px] w-[78px] shrink-0 rounded-md object-cover"
              style={{ background: "var(--wc-soft)" }}
            />
            <div className="min-w-0">
              <div
                className="truncate text-[13px] font-semibold"
                style={{ color: "var(--wc-ink)" }}
              >
                {p.link.title}
              </div>
              <div className="text-[11.5px]" style={{ color: "var(--wc-mute-2)" }}>
                🔗 {p.link.domain}
              </div>
            </div>
          </div>
        )}
        {p.image && (
          <div
            className="mt-2.5 flex h-[150px] items-center justify-center rounded-lg text-[12px]"
            style={{ background: "var(--wc-soft)", color: "var(--wc-mute)" }}
          >
            (이미지/움짤 — 카드 안 16:9 고정)
          </div>
        )}

        {/* 메타 하단: 작성자 / 액션 상시 노출 (E4) */}
        <div
          className="mt-3 flex items-center gap-2.5 border-t pt-2.5 text-[12.5px]"
          style={{ borderColor: "var(--wc-line)", color: "var(--wc-mute)" }}
        >
          <span
            className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-bold"
            style={{ background: "#F6E4E8", color: "#961E37" }}
          >
            {p.author[0]}
          </span>
          <span className="font-bold" style={{ color: "var(--wc-ink)" }}>
            {p.author}
          </span>
          {p.flair && (
            <span
              className="rounded px-1.5 py-px text-[10px] font-semibold"
              style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)" }}
            >
              {p.flair}
            </span>
          )}
          <span className="ml-auto flex items-center gap-3.5">
            <Stat icon={<ThumbsUp className="h-3.5 w-3.5" />} n={p.votes} />
            <Stat icon={<MessageCircle className="h-3.5 w-3.5" />} n={p.comments} />
            <Stat icon={<Eye className="h-3.5 w-3.5" />} n={p.views} />
            <Bookmark className="h-3.5 w-3.5" style={{ opacity: 0.55 }} />
            <Share2 className="h-3.5 w-3.5" style={{ opacity: 0.55 }} />
            <MoreHorizontal className="h-3.5 w-3.5" style={{ opacity: 0.55 }} />
          </span>
        </div>
      </div>
    </article>
  )
}

function CompactRow({ p }: { p: MockPost }) {
  const c = CHIP[p.sport]
  return (
    <div
      className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13.5px]"
      style={{ borderBottom: "1px solid var(--wc-line)" }}
    >
      <span className="shrink-0 text-[13px]">{c.emoji}</span>
      <span className="min-w-0 flex-1 truncate" style={{ color: "var(--wc-ink)" }}>
        {p.hot && (
          <Flame className="mr-1 inline h-3.5 w-3.5" style={{ color: "var(--wc-burgundy)" }} />
        )}
        <span className="font-semibold">{p.title}</span>
        <span className="ml-1" style={{ color: "var(--wc-mute-2)" }}>
          · {p.author}
        </span>
      </span>
      <span className="shrink-0 text-[12px] tabular-nums" style={{ color: "var(--wc-mute-2)" }}>
        👍{p.votes} 💬{p.comments} 👁{p.views} · {p.time}
      </span>
    </div>
  )
}

/* ════════════════ BEFORE (현재 근사 재현) ════════════════ */
function BeforeFeed() {
  return (
    <div className="space-y-2.5">
      {/* 현재: 배너가 최상단 */}
      <div
        className="flex items-center gap-3 rounded-xl px-[18px] py-[14px] text-[14px] font-bold"
        style={{
          background: "linear-gradient(100deg, var(--wc-burgundy-deep), var(--wc-burgundy))",
          color: "#fff",
        }}
      >
        🏆 <span className="flex-1">월드컵 승부예측 구너들의 대결 — 지금 참가하세요</span>
        <span
          className="rounded-lg px-3 py-1.5 text-[12.5px]"
          style={{ background: "rgba(255,255,255,.14)" }}
        >
          참가 신청 →
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <SortChip>랜덤</SortChip>
        <SortChip active>온도순</SortChip>
        <SortChip>최신순</SortChip>
      </div>
      {POSTS.map((p) => (
        <BeforeCard key={p.id} p={p} />
      ))}
    </div>
  )
}

function BeforeCard({ p }: { p: MockPost }) {
  const c = CHIP[p.sport]
  return (
    <article
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
    >
      <div style={{ padding: "18px 20px" }}>
        {/* 현재: 카테고리칩+시간 / 우상단 온도칩 */}
        <div className="mb-2 flex items-center gap-2">
          <span
            className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] font-bold"
            style={{ background: c.bg, color: c.color }}
          >
            {c.emoji} {p.sport}
          </span>
          <span className="text-[12px]" style={{ color: "var(--wc-mute-2)" }}>
            {p.time}
          </span>
          <span
            className="tnum ml-auto inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] font-bold"
            style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)" }}
          >
            🌡 {(p.votes / 2 + 3).toFixed(1)}°
          </span>
        </div>
        {/* 현재: 제목 1줄 / 본문 1줄 */}
        <h2 className="truncate text-[18px] font-bold" style={{ color: "var(--wc-ink)" }}>
          {p.title}
        </h2>
        <p className="truncate text-[14px]" style={{ color: "var(--wc-mute)" }}>
          {p.body}
        </p>
        {p.link && (
          <div
            className="-mx-5 mt-2.5 flex h-[280px] flex-col items-center justify-center border-t text-[12px]"
            style={{
              borderColor: "var(--wc-line)",
              background: "var(--wc-soft)",
              color: "var(--wc-mute)",
            }}
          >
            <span className="text-2xl">𝕏</span>(임베드 빈 박스 — 340~470px 예약)
          </div>
        )}
        {p.image && (
          <div
            className="-mx-5 mt-2.5 flex h-[260px] items-center justify-center border-t text-[12px]"
            style={{
              borderColor: "var(--wc-line)",
              background: "var(--wc-soft)",
              color: "var(--wc-mute)",
            }}
          >
            (이미지)
          </div>
        )}
        <div
          className="mt-3 flex items-center gap-3 border-t pt-3 text-[12.5px]"
          style={{ borderColor: "var(--wc-line)", color: "var(--wc-mute)" }}
        >
          <span
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-bold"
            style={{ background: "#F6E4E8", color: "#961E37" }}
          >
            {p.author[0]}
          </span>
          <span className="font-bold" style={{ color: "var(--wc-ink)" }}>
            {p.author}
          </span>
          {p.flair && (
            <span
              className="rounded px-1.5 py-px text-[10px] font-semibold"
              style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)" }}
            >
              {p.flair}
            </span>
          )}
          <span className="ml-auto flex items-center gap-3">
            <Stat icon={<ThumbsUp className="h-3.5 w-3.5" />} n={p.votes} />
            <Stat icon={<MessageCircle className="h-3.5 w-3.5" />} n={p.comments} />
            <Stat icon={<Eye className="h-3.5 w-3.5" />} n={p.views} />
            <span className="text-[11px]" style={{ color: "var(--wc-line-2)" }}>
              (저장·공유는 hover 시)
            </span>
          </span>
        </div>
      </div>
    </article>
  )
}

/* ── 공용 소품 ── */
function Chip({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex h-8 items-center rounded-full px-3 text-[13px] font-semibold"
      style={{
        background: active ? "var(--wc-burgundy)" : "var(--wc-card)",
        color: active ? "#fff" : "var(--wc-mute)",
        border: active ? "1px solid var(--wc-burgundy)" : "1px solid var(--wc-line-2)",
      }}
    >
      {children}
    </span>
  )
}
function SortChip({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3.5 text-[13px] font-semibold"
      style={{
        height: 34,
        background: active ? "var(--wc-burgundy)" : "var(--wc-card)",
        color: active ? "#fff" : "var(--wc-mute)",
        border: active ? "1px solid var(--wc-burgundy)" : "1px solid var(--wc-line-2)",
      }}
    >
      {children}
    </span>
  )
}
function Stat({ icon, n }: { icon: React.ReactNode; n: number }) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      {icon}
      {n}
    </span>
  )
}
