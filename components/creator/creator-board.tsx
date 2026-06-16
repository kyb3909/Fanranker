"use client"

import { useState } from "react"
import Image from "next/image"
import { Play } from "lucide-react"
import { useCreatorVideos, type CreatorVideo } from "@/hooks/use-creator-videos"
import type { CreatorInfo } from "@/lib/constants/creators"

interface CreatorBoardProps {
  creator: CreatorInfo
}

const card: React.CSSProperties = {
  background: "var(--wc-card)",
  border: "1px solid var(--wc-line)",
  boxShadow: "var(--wc-shadow-1)",
}
const sectionHead: React.CSSProperties = {
  background: "var(--wc-soft)",
  color: "var(--wc-mute)",
  borderBottom: "1px solid var(--wc-line)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
}

/**
 * 크리에이터(유튜버) 보드 — 메인 배너(최신 영상, 클릭 시 그 자리 재생) + 오른쪽
 * 최근 영상 리스트 + 유튜브 커뮤니티(게시물) 글(공지). iframe 은 재생 클릭 시에만 lazy 로드.
 * 데스크탑은 우측 컬럼을 좌측 영상 높이에 맞추고 각 섹션 내부 스크롤.
 */
export function CreatorBoard({ creator }: CreatorBoardProps) {
  const { hero, recent, community, isLoading } = useCreatorVideos(creator.creatorId)
  const [active, setActive] = useState<CreatorVideo | null>(null)
  const [playing, setPlaying] = useState(false)

  const current = active ?? hero

  const playVideo = (v: CreatorVideo) => {
    setActive(v)
    setPlaying(true)
  }

  return (
    <div className="py-4" data-testid="creator-board">
      <div className="mb-4">
        <div className="wc-sec-eb">CREATOR</div>
        <h1
          className="text-[22px] font-extrabold"
          style={{ color: "var(--wc-ink)", letterSpacing: "-0.02em" }}
        >
          {creator.name}
        </h1>
        {creator.description && (
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--wc-mute)" }}>
            {creator.description}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 메인 배너 */}
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl" style={card} data-testid="creator-hero">
            {isLoading ? (
              <div
                className="aspect-video w-full animate-pulse"
                style={{ background: "var(--wc-soft)" }}
              />
            ) : !current ? (
              <div
                className="flex aspect-video w-full items-center justify-center text-sm"
                style={{ background: "var(--wc-soft)", color: "var(--wc-mute)" }}
              >
                아직 영상이 없습니다.
              </div>
            ) : playing ? (
              <div className="relative aspect-video w-full">
                <iframe
                  data-testid="creator-hero-iframe"
                  className="absolute inset-0 h-full w-full"
                  src={`https://www.youtube.com/embed/${current.youtube_video_id}?autoplay=1`}
                  title={current.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            ) : (
              <button
                type="button"
                data-testid="creator-hero-play"
                onClick={() => setPlaying(true)}
                className="group relative block aspect-video w-full"
                aria-label={`${current.title} 재생`}
              >
                <Image
                  src={current.thumbnail_url}
                  alt={current.title}
                  fill
                  sizes="(max-width: 1024px) 100vw, 640px"
                  className="object-cover"
                  priority
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover:bg-black/40">
                  <span
                    className="flex h-16 w-16 items-center justify-center rounded-full"
                    style={{ background: "rgba(150,30,55,0.92)" }}
                  >
                    <Play className="h-7 w-7 translate-x-0.5 text-white" fill="white" />
                  </span>
                </span>
              </button>
            )}
            {current && (
              <div className="p-4">
                <h2
                  data-testid="creator-hero-title"
                  className="text-[16px] font-bold"
                  style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
                >
                  {current.title}
                </h2>
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽: 최근 영상 + 유튜브 커뮤니티 글 — 데스크탑은 좌측 영상 높이에 맞춰 각 섹션 스크롤 */}
        <div className="lg:relative lg:col-span-1">
          <div className="flex flex-col gap-4 lg:absolute lg:inset-0">
            {/* 최근 영상 */}
            <section
              className="overflow-hidden rounded-xl lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
              style={card}
              data-testid="creator-recent"
            >
              <div className="px-4 py-2.5 text-[12px] font-bold lg:shrink-0" style={sectionHead}>
                최근 영상
              </div>
              {recent.length > 0 ? (
                <ul className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                  {recent.map((v) => (
                    <li key={v.youtube_video_id}>
                      <button
                        type="button"
                        data-testid="creator-recent-item"
                        onClick={() => playVideo(v)}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[var(--wc-soft)]"
                        style={{ borderBottom: "1px solid var(--wc-line)" }}
                      >
                        <span
                          className="relative block aspect-video w-[88px] shrink-0 overflow-hidden rounded-md"
                          style={{ background: "var(--wc-soft)" }}
                        >
                          <Image
                            src={v.thumbnail_url}
                            alt={v.title}
                            fill
                            sizes="88px"
                            className="object-cover"
                          />
                        </span>
                        <span
                          className="line-clamp-2 text-[13px] font-semibold"
                          style={{ color: "var(--wc-ink)" }}
                        >
                          {v.title}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p
                  className="px-4 py-6 text-center text-[13px]"
                  style={{ color: "var(--wc-mute)" }}
                >
                  {isLoading ? "불러오는 중..." : "최근 영상이 없습니다."}
                </p>
              )}
            </section>

            {/* 공지 — 유튜브 커뮤니티(게시물) 글 */}
            <section
              className="overflow-hidden rounded-xl lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
              style={card}
              data-testid="creator-community"
            >
              <div className="px-4 py-2.5 text-[12px] font-bold lg:shrink-0" style={sectionHead}>
                유튜브 게시글
              </div>
              {community.length > 0 ? (
                <ul className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                  {community.map((post) => (
                    <li key={post.postId}>
                      <a
                        href={post.postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="creator-community-item"
                        className="block px-3 py-3 transition-colors hover:bg-[var(--wc-soft)]"
                        style={{ borderBottom: "1px solid var(--wc-line)" }}
                      >
                        {post.text && (
                          <p
                            className="line-clamp-3 text-[13px]"
                            style={{ color: "var(--wc-ink)" }}
                          >
                            {post.text}
                          </p>
                        )}
                        {post.imageUrl && (
                          <span
                            className="relative mt-2 block aspect-video w-full overflow-hidden rounded-md"
                            style={{ background: "var(--wc-soft)" }}
                          >
                            <Image
                              src={post.imageUrl}
                              alt=""
                              fill
                              sizes="(max-width: 1024px) 100vw, 320px"
                              className="object-cover"
                            />
                          </span>
                        )}
                        <span
                          className="mt-1.5 block text-[11px]"
                          style={{ color: "var(--wc-mute-2)" }}
                        >
                          {post.publishedText} · YouTube
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p
                  className="px-4 py-6 text-center text-[13px]"
                  style={{ color: "var(--wc-mute)" }}
                >
                  {isLoading ? "불러오는 중..." : "게시글이 없어요."}
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
