"use client"

/**
 * /design-preview 렌더링 (클라이언트) — 실제 게시물 데이터를 받아 개선안/현재 디자인으로 렌더.
 * ⚠️ 실제 담벼락 컴포넌트(post-card*)와 무관한 독립 프리뷰. 데이터만 실제 DB.
 */

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import {
  ThumbsUp,
  MessageCircle,
  Eye,
  Bookmark,
  Share2,
  MoreHorizontal,
  Flame,
  Pencil,
  Youtube,
  Instagram,
  Play,
  ExternalLink,
} from "lucide-react"

interface OEmbedData {
  provider?: string
  title?: string
  thumbnail_url?: string
  author_name?: string
  author_avatar?: string
  media?: { type: "photo" | "video"; url: string; thumbnail_url?: string }[]
}

/**
 * Reddit 스타일 리치 임베드 — /api/oembed 로 제목·썸네일·작성자를 받아 렌더.
 * (실제 EmbedCard 와 별개의 프리뷰 전용 경량 버전. 미디어 높이를 캡해 '거대 빈 박스' 방지.)
 */
function RichEmbed({ provider, url }: { provider: string; url: string }) {
  const { data } = useSWR<OEmbedData | null>(
    `/api/oembed?url=${encodeURIComponent(url)}`,
    (u: string) => fetch(u).then((r) => (r.ok ? r.json().catch(() => null) : null)),
    { dedupingInterval: 600_000, revalidateOnFocus: false, revalidateIfStale: false }
  )
  const domain = url.replace(/^https?:\/\//, "").split("/")[0]

  if (!data) {
    return (
      <div
        className="mt-3 flex h-[64px] items-center gap-3 rounded-xl border px-3 text-[12px]"
        style={{ borderColor: "var(--wc-line)", color: "var(--wc-mute-2)" }}
      >
        <span className="text-base">
          {provider === "youtube"
            ? "▶"
            : provider === "x"
              ? "𝕏"
              : provider === "instagram"
                ? "📷"
                : "🔗"}
        </span>
        불러오는 중… <span className="truncate">{domain}</span>
      </div>
    )
  }

  const media = data.media?.[0]
  const thumb = media?.type === "photo" ? media.url : media?.thumbnail_url || data.thumbnail_url

  // YouTube — 16:9 썸네일 + 재생 오버레이 + 제목
  if (provider === "youtube") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block overflow-hidden rounded-xl border"
        style={{ borderColor: "var(--wc-line)" }}
      >
        <div className="relative aspect-video w-full" style={{ background: "#000" }}>
          {data.thumbnail_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.thumbnail_url}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          )}
          <span className="absolute inset-0 flex items-center justify-center">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "#FF0000" }}
            >
              <Play className="ml-0.5 h-5 w-5 text-white" fill="white" />
            </span>
          </span>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-2 text-[12px]"
          style={{ color: "var(--wc-mute-2)" }}
        >
          <Youtube className="h-3.5 w-3.5" style={{ color: "#FF0000" }} />
          <span className="truncate font-semibold" style={{ color: "var(--wc-ink)" }}>
            {data.title || "YouTube 영상"}
          </span>
        </div>
      </a>
    )
  }

  // X — 작성자 + 트윗 본문 + (있으면) 미디어 썸네일
  if (provider === "x") {
    return (
      <div
        className="mt-3 overflow-hidden rounded-xl border"
        style={{ borderColor: "var(--wc-line)" }}
      >
        <div className="px-3.5 pt-3">
          <div className="flex items-center gap-2 text-[12.5px]">
            {data.author_avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.author_avatar}
                alt=""
                className="h-5 w-5 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="h-5 w-5 rounded-full" style={{ background: "var(--wc-line-2)" }} />
            )}
            <span className="font-bold" style={{ color: "var(--wc-ink)" }}>
              {data.author_name || domain}
            </span>
            <span className="ml-auto text-[13px]">𝕏</span>
          </div>
          {data.title && (
            <p
              className="mt-2 text-[13.5px] leading-relaxed"
              style={{
                color: "var(--wc-ink)",
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {data.title}
            </p>
          )}
        </div>
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="mt-2.5 max-h-[260px] w-full object-cover"
            referrerPolicy="no-referrer"
          />
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-3.5 py-2 text-[11.5px]"
          style={{ color: "var(--wc-mute-2)" }}
        >
          <ExternalLink className="h-3 w-3" /> X에서 보기
        </a>
      </div>
    )
  }

  // Instagram — 썸네일 + 캡션
  if (provider === "instagram") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block overflow-hidden rounded-xl border"
        style={{ borderColor: "var(--wc-line)" }}
      >
        {data.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.thumbnail_url}
            alt=""
            className="max-h-[300px] w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="flex h-[120px] items-center justify-center"
            style={{ background: "var(--wc-soft)" }}
          >
            <Instagram className="h-7 w-7" style={{ color: "#dc2743" }} />
          </div>
        )}
        <div
          className="flex items-center gap-1.5 px-3 py-2 text-[12px]"
          style={{ color: "var(--wc-mute-2)" }}
        >
          <Instagram className="h-3.5 w-3.5" style={{ color: "#dc2743" }} />
          <span className="truncate" style={{ color: "var(--wc-ink)" }}>
            {data.author_name || "instagram"}
            {data.title ? ` · ${data.title}` : ""}
          </span>
        </div>
      </a>
    )
  }

  // 일반 링크 — Reddit 가로형(제목+도메인 / 우측 썸네일)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex items-center gap-3 rounded-xl border p-2.5"
      style={{ borderColor: "var(--wc-line)" }}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold" style={{ color: "var(--wc-ink)" }}>
          {data.title || domain}
        </div>
        <div className="text-[11.5px]" style={{ color: "var(--wc-mute-2)" }}>
          🔗 {domain}
        </div>
      </div>
      {thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          className="h-[64px] w-[96px] shrink-0 rounded-lg object-cover"
          referrerPolicy="no-referrer"
        />
      )}
    </a>
  )
}

const CHIP: Record<string, { bg: string; color: string; emoji: string }> = {
  축구: { bg: "#FDECEC", color: "#9F1239", emoji: "⚽" },
  야구: { bg: "#EAF1FD", color: "#1E3A8A", emoji: "⚾" },
  농구: { bg: "#FDF1E5", color: "#9A3412", emoji: "🏀" },
  배구: { bg: "#F4EEFB", color: "#581C87", emoji: "🏐" },
}
const CHIP_FALLBACK = { bg: "#EFF2F4", color: "#3A3D45", emoji: "💬" }

export type PreviewMedia =
  | { kind: "image"; src: string }
  | { kind: "link"; provider: string; url: string; thumb?: string }

export interface PreviewPost {
  id: string
  sport: string
  team?: string
  author: string
  flair?: string
  time: string
  title: string
  body: string
  media?: PreviewMedia
  votes: number
  comments: number
  views: number
  hot?: boolean
}

export function PreviewClient({ posts }: { posts: PreviewPost[] }) {
  const [mode, setMode] = useState<"after" | "before">("after")
  const [density, setDensity] = useState<"card" | "compact">("card")

  return (
    <div className="worldcup-scope min-h-screen" style={{ background: "var(--wc-canvas)" }}>
      <div
        className="sticky top-0 z-20 flex flex-wrap items-center gap-2 px-4 py-2.5 text-[12.5px]"
        style={{ background: "var(--wc-ink)", color: "#fff" }}
      >
        <span className="font-bold">🎨 담벼락 디자인 프리뷰</span>
        <span style={{ color: "#b9c0cc" }}>· 실제 게시물 {posts.length}건 연결</span>
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
        {posts.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: "var(--wc-mute)" }}>
            연결할 게시물이 없습니다.
          </p>
        ) : mode === "after" ? (
          <AfterFeed posts={posts} density={density} />
        ) : (
          <BeforeFeed posts={posts} />
        )}
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

function chip(sport: string) {
  return CHIP[sport] ?? CHIP_FALLBACK
}

/* ════════ AFTER (개선안) ════════ */
function AfterFeed({ posts, density }: { posts: PreviewPost[]; density: "card" | "compact" }) {
  return (
    <div className="space-y-2.5">
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
        posts.map((p) => <AfterCard key={p.id} p={p} />)
      ) : (
        <div
          className="overflow-hidden rounded-xl"
          style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
        >
          {posts.map((p) => (
            <CompactRow key={p.id} p={p} />
          ))}
        </div>
      )}

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

function AfterCard({ p }: { p: PreviewPost }) {
  const c = chip(p.sport)
  return (
    <article
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
    >
      <div style={{ padding: "16px 18px" }}>
        {/* 태그·시간 (제목과 충분히 띄움) */}
        <div
          className="mb-3 flex items-center gap-2 text-[12px]"
          style={{ color: "var(--wc-mute-2)" }}
        >
          <span
            className="inline-flex h-[26px] items-center gap-1 rounded-md px-2 text-[11.5px] font-bold"
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

        {/* 제목 */}
        <h2
          className="text-[17px] font-bold"
          style={{ color: "var(--wc-ink)", letterSpacing: "-0.01em", lineHeight: 1.45 }}
        >
          {p.title}
        </h2>
        {/* 본문 (제목과 띄움) */}
        {p.body && (
          <p
            className="mt-2 text-[13.5px]"
            style={{
              color: "var(--wc-mute)",
              lineHeight: 1.6,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {p.body}
          </p>
        )}

        {/* 미디어 — 임베드는 Reddit 스타일 리치 카드(oembed) */}
        {p.media?.kind === "link" && <RichEmbed provider={p.media.provider} url={p.media.url} />}
        {p.media?.kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.media.src}
            alt=""
            className="mt-3 max-h-[300px] w-full rounded-xl object-cover"
            style={{ background: "var(--wc-soft)" }}
            referrerPolicy="no-referrer"
          />
        )}

        {/* 메타 (미디어와 충분히 띄움) */}
        <div
          className="mt-4 flex items-center gap-2.5 border-t pt-3 text-[12.5px]"
          style={{ borderColor: "var(--wc-line)", color: "var(--wc-mute)" }}
        >
          <span
            className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-bold"
            style={{ background: "#F6E4E8", color: "#961E37" }}
          >
            {p.author[0] ?? "?"}
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

function CompactRow({ p }: { p: PreviewPost }) {
  const c = chip(p.sport)
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

/* ════════ BEFORE (현재 근사) ════════ */
function BeforeFeed({ posts }: { posts: PreviewPost[] }) {
  return (
    <div className="space-y-2.5">
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
      {posts.map((p) => (
        <BeforeCard key={p.id} p={p} />
      ))}
    </div>
  )
}

function BeforeCard({ p }: { p: PreviewPost }) {
  const c = chip(p.sport)
  return (
    <article
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
    >
      <div style={{ padding: "18px 20px" }}>
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
            className="ml-auto inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] font-bold"
            style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)" }}
          >
            🌡 {(p.votes / 2 + p.comments + 3).toFixed(1)}°
          </span>
        </div>
        <h2 className="truncate text-[18px] font-bold" style={{ color: "var(--wc-ink)" }}>
          {p.title}
        </h2>
        {p.body && (
          <p className="truncate text-[14px]" style={{ color: "var(--wc-mute)" }}>
            {p.body}
          </p>
        )}
        {p.media?.kind === "link" && (
          <div
            className="-mx-5 mt-2.5 flex h-[300px] flex-col items-center justify-center gap-2 border-t text-[12px]"
            style={{
              borderColor: "var(--wc-line)",
              background: "var(--wc-soft)",
              color: "var(--wc-mute)",
            }}
          >
            {p.media.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.media.thumb}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <>
                <span className="text-2xl">
                  {p.media.provider === "youtube" ? "▶" : p.media.provider === "x" ? "𝕏" : "🔗"}
                </span>
                <span>(임베드 — 큰 프레임 ~300px 예약)</span>
              </>
            )}
          </div>
        )}
        {p.media?.kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.media.src}
            alt=""
            className="-mx-5 mt-2.5 max-h-[420px] w-[calc(100%+2.5rem)] border-t object-cover"
            style={{ borderColor: "var(--wc-line)" }}
            referrerPolicy="no-referrer"
          />
        )}
        <div
          className="mt-3 flex items-center gap-3 border-t pt-3 text-[12.5px]"
          style={{ borderColor: "var(--wc-line)", color: "var(--wc-mute)" }}
        >
          <span
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-bold"
            style={{ background: "#F6E4E8", color: "#961E37" }}
          >
            {p.author[0] ?? "?"}
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
