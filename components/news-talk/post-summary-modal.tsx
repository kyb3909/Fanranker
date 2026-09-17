"use client"

import { useState } from "react"
import { useClerk, useUser } from "@clerk/nextjs"
import { ArrowUpRight, ChevronRight, MessageSquareQuote, Newspaper } from "lucide-react"
import Link from "@/components/ui/app-link"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { CommentSection } from "@/components/post-detail/comment-section"
import { useComments } from "@/hooks/use-comments"
import { countAllComments } from "@/types/post-detail"
import { formatRelativeTime } from "@/lib/utils/date"
import type { TickerItem } from "./news-ticker"

interface PostSummaryModalProps {
  item: TickerItem & { postId: string }
  onClose: () => void
}

/**
 * 떡밥 요약 모달 (2026-09-18 운영자: "3줄 요약 … 모달로 뜨게 하고, 거기 다는 댓글들이 그대로
 * 게시판에도").
 *
 * ## 아래 절반 — 미리보기 + 단일 CTA (2026-09-18 디자인·UX 리뷰 A안)
 * 처음엔 글 페이지의 댓글 편집기를 통째로 넣었는데, "읽기 모달"에 "머무는 편집기"가 들어와
 * 정체가 애매했다(운영자: "댓글창이 좀 애매"). 지금은 이 글의 댓글 2개를 먼저 보여주고
 * `댓글 쓰기` 하나만 1차 액션으로 둔다. 누르면 그 자리에 글 페이지와 **같은 CommentSection**이
 * 펼쳐진다 — 같은 API, 같은 표 — 모달에서 쓴 댓글이 곧 글의 댓글이다.
 * 비로그인은 버튼이 항상 살아 있고 누르면 바로 로그인이다(빈 편집기 + 죽은 버튼 금지).
 *
 * ## Radix Dialog 주의
 * - `worldcup-scope` 필수 — body 로 포털돼 앱 셸 밖으로 나가므로 토큰이 안 풀린다(tarot-modal 참조).
 * - Clerk 로그인 모달도 포털이라 바깥 클릭으로 잡히면 이 모달이 닫힌다 → `onInteractOutside` 에서 제외.
 * - 자동 포커스가 첫 링크(원문)로 가면 Enter 한 번에 새 탭이 열린다 → 막는다.
 */
export function PostSummaryModal({ item, onClose }: PostSummaryModalProps) {
  const detail = item.detail
  const isInterview = detail?.kind === "interview"
  const href = item.href ?? `/post/${item.postId}`
  const { user, isLoaded } = useUser()
  const clerk = useClerk()
  const [writing, setWriting] = useState(false)
  const { comments, isLoadingComments } = useComments(item.postId)
  const count = isLoadingComments ? (detail?.participants ?? 0) : countAllComments(comments)
  const preview = [...comments]
    .sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 2)

  const quoteBlocks = isInterview ? groupQuotes(detail?.summary ?? []) : []

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          const t = e.target as HTMLElement | null
          if (t?.closest?.('[class*="cl-"]')) e.preventDefault()
        }}
        className="worldcup-scope z-[60] max-h-[90dvh] gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[600px] [&>[data-slot=dialog-close]]:top-5 [&>[data-slot=dialog-close]]:right-5"
        style={{
          background: "var(--wc-paper)",
          borderColor: "var(--wc-line)",
          boxShadow: "var(--wc-shadow-3)",
        }}
      >
        <div className="max-h-[90dvh] overflow-y-auto">
          {/* 머리 — 키커 + 제목 */}
          <header className="px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
            <p className="mb-2 flex items-center gap-1.5 pr-8 text-[12px]">
              <span
                className="gn-num inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold tracking-[0.14em] uppercase"
                style={{ background: "var(--wc-wine-tint)", color: "var(--wc-burgundy)" }}
              >
                {isInterview ? (
                  <MessageSquareQuote className="h-3 w-3" />
                ) : (
                  <Newspaper className="h-3 w-3" />
                )}
                {isInterview ? "INTERVIEW" : "BRIEF"}
              </span>
              <span className="font-semibold" style={{ color: "var(--wc-ink-2)" }}>
                {isInterview ? "인터뷰 요지" : "세 줄 요약"}
              </span>
              {detail?.postedAt && (
                <span className="ml-auto" style={{ color: "var(--wc-mute-2)" }}>
                  {formatRelativeTime(new Date(detail.postedAt))}
                </span>
              )}
            </p>
            <DialogTitle
              className="pr-8 text-[20px] leading-[1.25] font-extrabold tracking-[-0.02em] [text-wrap:balance] [word-break:keep-all]"
              style={{ color: "var(--wc-ink)" }}
            >
              {item.text}
            </DialogTitle>
          </header>

          {/* 요약 */}
          {detail && (
            <section className="px-5 pb-5 sm:px-6">
              {isInterview ? (
                /* 인터뷰 = 발언이 주인공. 발언 블록은 소프트 틴트, 맥락(질문·주제)은 한 단 흐리게.
                   같은 맥락이 이어지면 라벨은 한 번만 (2026-09-18 운영자: "질문 → 대답(quote)") */
                <div className="space-y-2.5">
                  {quoteBlocks.map((block, i) => (
                    <div
                      key={`${item.id}-q${i}`}
                      className="rounded-xl px-4 py-3"
                      style={{ background: "var(--wc-soft)" }}
                    >
                      {block.context && (
                        <p
                          className="mb-1 text-[12px] font-medium [word-break:keep-all]"
                          style={{ color: "var(--wc-mute-2)" }}
                        >
                          {/[?？]$/.test(block.context) ? `Q. ${block.context}` : block.context}
                        </p>
                      )}
                      <div className="space-y-2">
                        {block.quotes.map((q, j) => (
                          <p
                            key={`${item.id}-q${i}-${j}`}
                            className="text-[16px] leading-[1.65] [word-break:keep-all]"
                            style={{ color: "var(--wc-ink)" }}
                          >
                            {q}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* 단신 뉴스 = 초록(abstract)처럼 한 단락 (2026-09-18 운영자: "1,2,3 하지 말고
                   진짜 요약"). 문장은 저장 단위(lines)지만 화면은 공백으로 이어 붙인다 */
                <p
                  className="text-[16px] leading-[1.65] [word-break:keep-all]"
                  style={{ color: "var(--wc-ink)" }}
                >
                  {detail.summary.join(" ")}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                <span style={{ color: "var(--wc-mute)" }}>
                  출처{" "}
                  {detail.sourceUrl ? (
                    <a
                      href={detail.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-0.5 font-semibold underline-offset-4 hover:underline sm:min-h-0"
                      style={{ color: "var(--wc-ink-2)" }}
                    >
                      {detail.source} <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="font-semibold" style={{ color: "var(--wc-ink-2)" }}>
                      {detail.source}
                    </span>
                  )}
                </span>
                <Link
                  href={href}
                  className="ml-auto inline-flex min-h-11 items-center gap-0.5 font-semibold underline-offset-4 hover:underline sm:min-h-0"
                  style={{ color: "var(--wc-ink-2)" }}
                >
                  글 전체 보기 <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </section>
          )}

          {/* 이 글의 댓글 — 미리보기 + 단일 CTA. 편집기는 눌렀을 때만 (글 페이지와 같은 부품) */}
          <section
            className="border-t px-5 pt-4 pb-5 sm:px-6"
            style={{ borderColor: "var(--wc-line)" }}
          >
            <div className="mb-3 flex items-baseline gap-2">
              <h3 className="text-[16px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                이 글의 댓글{" "}
                <span
                  className="tnum"
                  style={{ color: count > 0 ? "var(--wc-burgundy)" : "var(--wc-mute-2)" }}
                >
                  {count}
                </span>
              </h3>
              <span className="text-[12px]" style={{ color: "var(--wc-mute-2)" }}>
                글 페이지에서도 같이 보여요
              </span>
            </div>

            {writing ? (
              <CommentSection postId={item.postId} variant="embedded" />
            ) : (
              <>
                {preview.length > 0 && (
                  <ul className="mb-3 space-y-2">
                    {preview.map((c) => (
                      <li
                        key={String(c.id)}
                        className="rounded-xl px-4 py-3"
                        style={{ background: "var(--wc-soft)" }}
                      >
                        <p className="mb-1 text-[12px]" style={{ color: "var(--wc-mute)" }}>
                          <span className="font-semibold" style={{ color: "var(--wc-ink-2)" }}>
                            {c.author}
                          </span>{" "}
                          · {formatRelativeTime(new Date(c.createdAt))}
                        </p>
                        <p
                          className="line-clamp-2 text-[14px] leading-[1.55] [word-break:keep-all]"
                          style={{ color: "var(--wc-ink)" }}
                        >
                          {c.content
                            .replace(/<[^>]+>/g, " ")
                            .replace(/\s+/g, " ")
                            .trim()}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {!isLoadingComments && preview.length === 0 && (
                  <p className="mb-3 text-[13px]" style={{ color: "var(--wc-mute-2)" }}>
                    아직 댓글이 없어요. 첫 반응을 남겨보세요.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (isLoaded && !user) clerk.openSignIn()
                      else setWriting(true)
                    }}
                    className="inline-flex min-h-11 items-center rounded-full px-4 text-[14px] font-bold transition-opacity hover:opacity-90 sm:min-h-10"
                    style={{ background: "var(--wc-burgundy)", color: "var(--wc-paper)" }}
                  >
                    {isLoaded && !user ? "로그인하고 댓글 쓰기" : "댓글 쓰기"}
                  </button>
                  {count > preview.length && (
                    <Link
                      href={`${href}${href.includes("?") ? "&" : "?"}from=summary#comments`}
                      className="inline-flex min-h-11 items-center gap-0.5 text-[13px] font-semibold underline-offset-4 hover:underline sm:min-h-0"
                      style={{ color: "var(--wc-mute)" }}
                    >
                      댓글 {count - preview.length}개 더 보기{" "}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** `맥락 — “발언”` 줄들을 맥락별로 묶는다. 같은 맥락이 이어지면 라벨을 한 번만 단다 */
function groupQuotes(lines: string[]): { context: string | null; quotes: string[] }[] {
  const out: { context: string | null; quotes: string[] }[] = []
  for (const line of lines) {
    const sep = line.indexOf(" — “")
    const context = sep > 0 ? line.slice(0, sep) : null
    const quote = sep > 0 ? line.slice(sep + 3) : line
    const last = out[out.length - 1]
    if (last && last.context === context) last.quotes.push(quote)
    else out.push({ context, quotes: [quote] })
  }
  return out
}
