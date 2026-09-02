"use client"

import { useState, type ReactNode } from "react"
import Image from "next/image"
import { MessageCircle, Share2 } from "lucide-react"
import { useAuth, useClerk } from "@clerk/nextjs"
import Link from "@/components/ui/app-link"
import { VoteButtons } from "@/components/vote-buttons"
import { InlineComments } from "@/components/home/inline-comments"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { trackEvent } from "@/lib/analytics/events"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import type { PopularPost } from "@/lib/home/popular-posts"

/**
 * 담벼락 포스트 — 떡밥(봇 뉴스) 피드 사이에 끼는 사람 글 (2026-08-20 인터리브 → 2026-09-03 큰 카드
 * → 2026-09-03 밤 디자인 리뷰 "타임라인 포스트").
 *
 * 디자인 리뷰 결론(편집·SNS·시스템·UX 네 관점 + 디렉터, 2026-09-03): 뉴스와 갈라 보이지 않던 이유는
 * 색이 아니라 **골격**이 같아서였다 — 둘 다 흰 둥근 카드 + 12px 키커 줄 + 굵은 제목. 색 시안 열 개
 * (연한 와인 ~ 버건디 밴드)는 전부 폐기: 연한 쪽은 지각 문턱 아래, 진한 쪽은 이 시스템에서 뜻이
 * 틀린다(와인 채움=활성 칩, 핑크 면=공지, 2px 테두리=선택, 버건디 밴드=페이지 선언·버튼).
 *
 * 그래서 종류가 다른 것은 **형태**로 가른다:
 * - 실루엣: 뉴스는 카드, 담벼락은 카드가 아니다. 모바일은 화면 끝까지 붙는 평판(-mx-4), 위아래 괘선
 *   `--wc-line-2` 양면(한쪽 액센트 보더가 아니다). 데스크톱도 평판 — 인스타·X 데스크톱 문법
 *   (운영자 확정 2026-09-03, 후보 "타임라인 포스트").
 * - 진입부: 40px 중성 아바타 + 14px 이름 + "담벼락 · 게시판" 12px mute. 버건디 0 · 필 0 · 라틴 0.
 *   (와인틴트+버건디 글자 폴백 아바타는 칩으로 읽혔다 — 폐기. "새 글" 필은 콜드스타트에서 전 카드에
 *   붙어 배지가 아니었다 — 폐기.)
 * - 크기: 제목 20px — 뉴스 14 대비 1.43배. 16(1.14배)은 스크롤 속도에서 무의미했다.
 * - 퇴장부: 추천·댓글·공유가 같은 링을 두른 알약 셋. 0 이면 숫자 대신 동사("추천"·"댓글 달기") —
 *   "👍 0 · 댓글 0"은 어떤 틴트보다 크게 "아무도 없다"를 말한다.
 * - 미디어: 본문 첫 동영상 > 첫 이미지. 4:3 예약 프레임(CLS 0)에 통째로 담고 빈 곳은 흐린 배경.
 *   동영상은 포스터 + 재생 버튼, 자동 재생 없음.
 * - 댓글: 글 페이지 부품 그대로(InlineComments), 기본 닫힘 — 댓글 버튼을 눌러야 불러온다.
 * - 타임스탬프 없음 — 어제의 공방이 "낡은 글"로 읽히면 콜드스타트에서 진다.
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
  const media = post.video ? "video" : post.image ? "image" : "none"

  return (
    <article
      className={cn(
        // 모바일: 컬럼 패딩(px-4)을 뚫고 화면 끝까지 — 홈 main 이 px-4 sm:px-6 이라 -mx-4 는 <sm 에서만 뜻이 있다.
        // 위아래 괘선 양면. sm+ 는 컬럼 폭(sm~lg 은 600 가운데 정렬이라 뷰포트에 못 닿는다 — 늘리지 말 것).
        // 데스크톱도 평판 — 운영자 확정 2026-09-03 ("1번 마음에 드네"). 후보 2(카드 유지)는 기각.
        "-mx-4 overflow-hidden border-y sm:mx-0",
        // 스트림(전부 담벼락): 포스트 사이 괘선 한 줄만 — 인스타 타임라인
        surface === "stream" && "border-t-0 first:border-t"
      )}
      style={{ background: "var(--wc-card)", borderColor: "var(--wc-line-2)" }}
    >
      <header className="flex items-center gap-3 px-4 pt-3 pb-2">
        <Link
          href={`/profile/${post.userId}`}
          className="flex min-w-0 flex-1 items-center gap-3 no-underline"
        >
          <AuthorAvatar name={post.author} src={post.avatar} />
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-[14px] font-bold"
              style={{ color: "var(--wc-ink)" }}
            >
              {post.author}
            </span>
            <span
              className="block truncate text-[12px] font-medium"
              style={{ color: "var(--wc-mute)" }}
            >
              담벼락 · {community}
            </span>
          </span>
        </Link>
      </header>

      <Link href={href} className="block px-4 pb-3 no-underline" onClick={openPost}>
        <h2
          className="line-clamp-3"
          style={{
            fontSize: 20,
            fontWeight: 700,
            lineHeight: 1.3,
            letterSpacing: "-0.02em",
            textWrap: "balance",
            color: "var(--wc-ink)",
            wordBreak: "keep-all",
            overflowWrap: "anywhere",
          }}
        >
          {post.title}
        </h2>
        {media === "none" && post.excerpt && (
          <p
            className="mt-2 line-clamp-3 text-[14px] leading-[1.55] font-normal"
            style={{ color: "var(--wc-ink-2)", wordBreak: "keep-all", overflowWrap: "anywhere" }}
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
                sizes="(max-width: 640px) 100vw, 600px"
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

      {/* 퇴장부 — 같은 링을 두른 알약 셋. 뉴스 카드엔 없는 아랫단 실루엣 */}
      <div className="flex items-center gap-2 px-4 pt-2 pb-3">
        <VoteButtons
          voteCount={voteCount}
          myVote={myVote}
          onVote={vote}
          size="md"
          emptyLabel="추천"
        />
        <button
          type="button"
          onClick={() => setCommentsOpen((o) => !o)}
          aria-expanded={commentsOpen}
          className="inline-flex h-[34px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors hover:bg-[var(--wc-soft)]"
          style={{
            color: "var(--wc-mute)",
            background: "var(--wc-card)",
            border: "1px solid var(--wc-line-2)",
          }}
        >
          <MessageCircle className="h-4 w-4" />
          {commentCount === 0 ? (
            <span>댓글 달기</span>
          ) : (
            <>
              <span>댓글</span>
              <b className="gn-num" style={{ color: "var(--wc-ink)" }}>
                {commentCount}
              </b>
            </>
          )}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={share}
          aria-label="공유"
          className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full transition-colors hover:bg-[var(--wc-soft)]"
          style={{
            color: "var(--wc-mute)",
            background: "var(--wc-card)",
            border: "1px solid var(--wc-line-2)",
          }}
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

/** 40px 원형. 이미지 없으면 중성 원 + 이니셜 — 구글·슬랙식 "계정" 문법 (와인 폴백은 칩으로 읽혔다) */
function AuthorAvatar({ name, src }: { name: string; src: string | null }) {
  return (
    <span
      className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full"
      style={{ background: "var(--wc-tint)", color: "var(--wc-ink-2)" }}
    >
      {src ? (
        src.startsWith("/") ? (
          <Image src={src} alt="" fill sizes="40px" className="object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[14px] font-bold">
          {(name || "?").slice(0, 1)}
        </span>
      )}
    </span>
  )
}

/** 인터리브 대열의 마지막 카드 뒤에 한 번만 붙는 담벼락 진입로 */
export function WallMoreRow() {
  return (
    <div className="-mt-1 flex justify-end px-4">
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
