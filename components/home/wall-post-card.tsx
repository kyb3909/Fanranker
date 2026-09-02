"use client"

import { useState, type ReactNode } from "react"
import Image from "next/image"
import { MessageCircle, Share2 } from "lucide-react"
import { useAuth, useClerk } from "@clerk/nextjs"
import Link from "@/components/ui/app-link"
import { VoteButtons } from "@/components/vote-buttons"
import { InlineComments } from "@/components/home/inline-comments"
import { toast } from "@/hooks/use-toast"
import { trackEvent } from "@/lib/analytics/events"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import type { PopularPost } from "@/lib/home/popular-posts"

/**
 * 담벼락 카드 — 떡밥 피드 사이에 끼는 사람 글 (2026-08-20 인터리브 → 2026-09-03 큰 카드).
 *
 * 운영자 결정(2026-09-03): "미리보기 창이 레딧이나 인스타그램처럼 크게, 거기에 바로 댓글을
 * 달고 볼 수 있게". 그래서 뉴스 카드(CompactCard, 썸네일 한 줄)와 **일부러 밀도가 다르다** —
 * 이 카드는 피드의 각주가 아니라 SNS 의 포스트다. 바탕은 뉴스 카드와 같은 흰색(운영자:
 * 웜 페이퍼 틴트는 "탁하다") — 구분은 크기와 "담벼락" 키커가 한다.
 *
 * - 미디어: 본문 첫 동영상 > 첫 이미지. 4:3 고정 프레임(폭·높이 예약 → CLS 0) 안에 통째로
 *   담고(contain), 빈 여백은 같은 이미지를 흐려 채운다 — 레딧 문법. 세로 영상도 잘리지 않는다.
 * - 동영상은 포스터 + 재생 버튼이 기본, 피드 자동 재생 없음.
 * - 댓글은 글 페이지 부품 그대로(InlineComments). **기본 닫힘** — 댓글 버튼을 눌러야 열리고 그때
 *   불러온다 (2026-09-03 운영자: "처음에는 모두 닫힌 채"). 카드마다 댓글창이 열려 있으면 피드가
 *   댓글판이 된다.
 * - 타임스탬프를 내지 않는다 — 어제의 공방이 "낡은 글"로 읽히면 콜드스타트에서 진다.
 */
export type WallPost = PopularPost

type Surface = "cardnews" | "stream"

export function WallPostCard({
  post,
  surface = "cardnews",
}: {
  post: WallPost
  /** cardnews = 떡밥 사이 인터리브 / stream = 뉴스를 끈 인기 스트림 */
  surface?: Surface
}) {
  const { isSignedIn } = useAuth()
  const { openSignIn } = useClerk()
  const [voteCount, setVoteCount] = useState(post.upvotes)
  const [myVote, setMyVote] = useState<"up" | "down" | null>(null)
  const [commentCount, setCommentCount] = useState(post.comments)
  const [commentsOpen, setCommentsOpen] = useState(false)

  const href = `/post/${post.id}?utm_source=wall_now`
  const openPost = () =>
    trackEvent({ name: "wall_now_open_post", params: { post_id: post.id, surface } })

  // 낙관적 갱신 — hooks/use-post-card-actions 와 같은 규칙 (서버 응답이 최종값)
  const vote = async (type: "up" | "down") => {
    if (!isSignedIn) {
      openSignIn()
      return
    }
    const prevVote = myVote
    const prevCount = voteCount
    if (myVote === type) {
      setMyVote(null)
      setVoteCount((c) => c + (type === "up" ? -1 : 1))
    } else {
      const delta = type === "up" ? 1 : -1
      const reverse = prevVote ? (prevVote === "up" ? -1 : 1) : 0
      setMyVote(type)
      setVoteCount((c) => c + delta + reverse)
    }
    try {
      const res = await fetch(`/api/posts/${post.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      })
      if (!res.ok) throw new Error("vote failed")
      const data = (await res.json()) as { voteCount: number; voteType: "up" | "down" | null }
      setVoteCount(data.voteCount)
      setMyVote(data.voteType)
    } catch {
      setMyVote(prevVote)
      setVoteCount(prevCount)
    }
  }

  const share = async () => {
    const url = `${window.location.origin}/post/${post.id}`
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title, url })
      } else {
        await navigator.clipboard.writeText(url)
        toast({ title: "링크를 복사했어요" })
      }
    } catch {
      // 공유 시트를 닫은 것 — 조용히
    }
  }

  const community = COMMUNITY_NAMES[post.communitySlug] || post.communitySlug
  // 아무도 안 누른 새 글 — 숫자 0 을 내보이지 않는다 (콜드스타트에서 "아무도 안 본 글"로 읽힌다)
  const isNew = post.upvotes === 0 && post.comments === 0
  const media = post.video ? "video" : post.image ? "image" : "none"

  return (
    <article
      className="overflow-hidden rounded-2xl"
      // --wall-* 는 색 시안 전환기(wall-tint-lab, 개발 전용)가 주입한다. 없으면 흰 카드 기본값.
      style={{
        background: "var(--wall-bg, var(--wc-card))",
        border: "var(--wall-border-width, 1px) solid var(--wall-border, var(--wc-line))",
        boxShadow: "var(--wall-shadow, var(--wc-shadow-1))",
      }}
    >
      <header
        className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5"
        style={{ background: "var(--wall-head-bg, transparent)" }}
      >
        <AuthorAvatar name={post.author} src={post.avatar} />
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[13px] font-bold"
            style={{ color: "var(--wall-head-fg, var(--wc-ink))" }}
          >
            {post.author}
          </p>
          {/* 키커 — 뉴스 카드의 출처 자리에 "담벼락"이 선다 */}
          <p className="flex items-center gap-1.5 text-[12px] font-bold">
            <span
              className="rounded-full"
              style={{
                color: "var(--wall-kicker-fg, var(--wc-burgundy))",
                background: "var(--wall-kicker-bg, transparent)",
                padding: "var(--wall-kicker-pad, 0)",
              }}
            >
              담벼락
            </span>
            <span aria-hidden style={{ color: "var(--wall-head-fg-2, var(--wc-mute-2))" }}>
              ·
            </span>
            <span style={{ color: "var(--wall-head-fg-2, var(--wc-mute))" }}>{community}</span>
            {isNew && (
              <span
                className="rounded-full px-1.5 py-px"
                style={{ background: "var(--wc-wine-tint)", color: "var(--wc-burgundy)" }}
              >
                새 글
              </span>
            )}
          </p>
        </div>
      </header>

      <Link href={href} className="block px-4 pb-3 no-underline" onClick={openPost}>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            lineHeight: 1.35,
            letterSpacing: "-0.01em",
            color: "var(--wc-ink)",
            wordBreak: "keep-all",
            overflowWrap: "anywhere",
          }}
        >
          {post.title}
        </h2>
        {media === "none" && post.excerpt && (
          <p
            className="mt-1.5 line-clamp-3 text-[14px]"
            style={{ color: "var(--wc-mute)", wordBreak: "keep-all", overflowWrap: "anywhere" }}
          >
            {post.excerpt}
          </p>
        )}
      </Link>

      {media === "video" && post.video && (
        <MediaFrame backdrop={post.image}>
          <video
            src={post.video}
            poster={post.image ?? undefined}
            controls
            playsInline
            preload={post.image ? "none" : "metadata"}
            className="absolute inset-0 h-full w-full object-contain"
            onPlay={() =>
              trackEvent({ name: "wall_video_play", params: { post_id: post.id, surface } })
            }
          />
        </MediaFrame>
      )}
      {media === "image" && post.image && (
        <Link href={href} className="block" aria-label={post.title} onClick={openPost}>
          <MediaFrame backdrop={post.image}>
            {post.image.startsWith("/") ? (
              <Image
                src={post.image}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 560px"
                className="object-contain"
              />
            ) : (
              // 외부 호스트는 remotePatterns 미등록 시 터지므로 평범한 img 로 (기존 규칙 준용)
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.image}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-contain"
              />
            )}
          </MediaFrame>
        </Link>
      )}

      <div
        className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5"
        style={{ background: "var(--wall-foot-bg, transparent)" }}
      >
        <VoteButtons voteCount={voteCount} myVote={myVote} onVote={vote} size="md" />
        <button
          type="button"
          onClick={() => setCommentsOpen((o) => !o)}
          aria-expanded={commentsOpen}
          className="inline-flex h-[34px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors hover:bg-[var(--wc-soft)]"
          style={{ color: "var(--wc-mute)" }}
        >
          <MessageCircle className="h-4 w-4" />
          <span>댓글</span>
          <b className="gn-num" style={{ color: "var(--wc-ink)" }}>
            {commentCount}
          </b>
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={share}
          aria-label="공유"
          className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full transition-colors hover:bg-[var(--wc-soft)]"
          style={{ color: "var(--wc-mute)" }}
        >
          <Share2 className="h-4 w-4" />
        </button>
      </div>

      {commentsOpen && <InlineComments postId={post.id} onCountChange={setCommentCount} />}
    </article>
  )
}

/** 4:3 예약 프레임 — 미디어를 통째로 담고, 남는 여백은 같은 그림을 흐려 채운다 (레딧 문법) */
function MediaFrame({ backdrop, children }: { backdrop: string | null; children: ReactNode }) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: "4 / 3", background: "var(--wc-soft)" }}
    >
      {backdrop && (
        <div
          aria-hidden
          className="absolute inset-0 scale-110 bg-cover bg-center blur-2xl"
          style={{ backgroundImage: `url("${backdrop}")` }}
        />
      )}
      {backdrop && (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: "color-mix(in srgb, var(--wc-ink) 25%, transparent)" }}
        />
      )}
      {children}
    </div>
  )
}

function AuthorAvatar({ name, src }: { name: string; src: string | null }) {
  return (
    <span
      className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full"
      style={{ background: "var(--wc-wine-tint)", color: "var(--wc-burgundy)" }}
    >
      {src ? (
        src.startsWith("/") ? (
          <Image src={src} alt="" fill sizes="36px" className="object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[13px] font-bold">
          {(name || "?").slice(0, 1)}
        </span>
      )}
    </span>
  )
}

/** 인터리브 대열의 마지막 카드 뒤에 한 번만 붙는 담벼락 진입로 */
export function WallMoreRow() {
  return (
    <div className="-mt-1 flex justify-end px-1">
      <Link
        href="/?tab=board"
        className="text-[12px] font-bold no-underline"
        style={{ color: "var(--wc-mute)" }}
        onClick={() => trackEvent({ name: "wall_now_open_board", params: { surface: "cardnews" } })}
      >
        담벼락 전체 보기 →
      </Link>
    </div>
  )
}
