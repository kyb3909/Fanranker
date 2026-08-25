"use client"

import Image from "next/image"
import Link from "@/components/ui/app-link"
import { trackEvent } from "@/lib/analytics/events"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"

/**
 * 담벼락 인터리브 카드 (2026-08-20 — "레딧처럼 한 피드에서", 운영자 승인 시안).
 *
 * 떡밥(봇 뉴스) 피드 사이에 **사람 글**을 같은 밀도의 카드로 끼운다. 다이제스트 블록이
 * 아니라 개별 카드인 이유: 밀도가 같아야 피드가 한 몸으로 읽힌다 — 밀도가 다른 블록은
 * "삽입물"로, 같은 밀도의 카드는 "피드의 일부"로 읽힌다.
 *
 * - 재료는 홈이 이미 프리페치하는 최근 댓글 달린 글 (get_recent_commented_posts).
 *   봇은 댓글을 안 쓰므로 이 정렬 신호는 100% 사람 활동이다.
 * - 타임스탬프를 내지 않는다 — 어제의 공방이 "낡은 글"로 읽히면 콜드스타트에서 진다.
 * - 댓글수는 구조상 항상 ≥1 이라 0 카운트 노출이 불가능하다.
 */

export interface WallPost {
  id: string
  title: string
  communitySlug: string
  comments: number
  /** 본문 첫 이미지 (2026-08-21 운영자: "아이돌 이미지도 하나 중간에") — 없으면 텍스트 행 */
  image?: string | null
}

export function WallPostCard({ post }: { post: WallPost }) {
  return (
    <article
      className="gn-card-lift relative overflow-hidden rounded-xl transition-transform active:scale-[.99]"
      style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
    >
      <div className="relative flex items-center gap-3 px-4 py-3">
        <Link
          href={`/post/${post.id}?utm_source=wall_now`}
          className="absolute inset-0 z-[1]"
          aria-label={post.title}
          onClick={() =>
            trackEvent({
              name: "wall_now_open_post",
              params: { post_id: post.id, surface: "cardnews" },
            })
          }
        />
        <div className="min-w-0 flex-1">
          {/* 키커 — 뉴스 카드의 출처 자리에 "담벼락"이 선다. 이 카드의 정체 표기 전부다 */}
          <p className="mb-0.5 flex items-center gap-1.5 text-[12px] font-bold">
            <span style={{ color: "var(--wc-burgundy)" }}>담벼락</span>
            <span aria-hidden style={{ color: "var(--wc-mute-2)" }}>
              ·
            </span>
            <span style={{ color: "var(--wc-mute)" }}>
              {COMMUNITY_NAMES[post.communitySlug] || post.communitySlug}
            </span>
          </p>
          <h2
            className="line-clamp-2"
            style={{
              fontSize: 14,
              fontWeight: 650,
              lineHeight: 1.38,
              letterSpacing: "-0.01em",
              color: "var(--wc-ink)",
              wordBreak: "keep-all",
              overflowWrap: "anywhere",
            }}
          >
            {post.title}
            <span
              className="gn-num ml-1.5 text-[12px] font-bold"
              style={{ color: "var(--wc-burgundy)" }}
            >
              [{post.comments}]
            </span>
          </h2>
        </div>
        {/* 썸네일 — 뉴스 카드(CompactCard)와 같은 104×76 문법. 같은 출처(/) 만 next/image,
            외부 호스트는 remotePatterns 미등록 시 터지므로 평범한 img 로 (기존 규칙 준용) */}
        {post.image && (
          <div className="relative h-[76px] w-[104px] shrink-0 overflow-hidden rounded-lg">
            {post.image.startsWith("/") ? (
              <Image
                src={post.image}
                alt=""
                fill
                sizes="104px"
                loading="lazy"
                className="object-cover"
                style={{ objectPosition: "50% 30%" }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.image}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: "50% 30%" }}
              />
            )}
          </div>
        )}
      </div>
    </article>
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
