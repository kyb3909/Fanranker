"use client"

import useSWR from "swr"
import Link from "@/components/ui/app-link"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Circle, MessageSquare, ThumbsUp } from "lucide-react"
import { DiscordInviteBanner } from "@/components/discord-invite-banner"
import { fetcher } from "@/lib/swr"
import { trackEvent } from "@/lib/analytics/events"
import { STAGE_LABEL } from "@/lib/saga/stages"
import { getGameTypeLabel } from "@/types/betting"
import {
  extractFirstImageSrcFromTipTapJSON,
  extractFirstEmbedFromTipTapJSON,
} from "@/lib/utils/tiptap-embeds"
import type { PickDistributionEntry, PredictionSuccessState } from "@/types/betting"

interface PredictionSuccessDialogProps {
  state: PredictionSuccessState
  onClose: () => void
}

interface HotPost {
  id: string
  title: string
  content?: unknown
  comment_count: number | null
  vote_count: number | null
}

interface ActiveSaga {
  slug: string
  title: string
  stage: string
  entry_count: number
}

/** 게시글 본문에서 대표 썸네일 1장 추출 (이미지 → 임베드 썸네일 순). 없으면 null. */
function postThumbnail(post: HotPost): string | null {
  const img = extractFirstImageSrcFromTipTapJSON(post.content)
  if (img) return img
  const embed = extractFirstEmbedFromTipTapJSON(post.content)
  return embed?.attrs?.thumbnail_url ?? null
}

const PICK_ORDER = ["home", "draw", "away", "over", "under"] as const

function pickLabel(pick: string, entry: PickDistributionEntry): string {
  switch (pick) {
    case "home":
      return entry.homeTeam
    case "away":
      return entry.awayTeam
    case "draw":
      return "무승부"
    case "over":
      return "오버"
    case "under":
      return "언더"
    default:
      return pick
  }
}

function DistributionCard({ entry }: { entry: PickDistributionEntry }) {
  // 표시 옵션 = 분포에 등장한 픽 ∪ 내 픽 (2way/3way 를 데이터로 자연 분기)
  const picks = PICK_ORDER.filter((p) => (entry.counts[p] ?? 0) > 0 || p === entry.myPick)

  return (
    <div
      className="rounded-lg px-3.5 py-3"
      style={{
        background: "var(--wc-paper, #faf9f7)",
        border: "1px solid var(--wc-line, #e8e5e0)",
      }}
    >
      <p className="mb-2 text-[13px] font-bold" style={{ color: "var(--wc-ink, #1a1714)" }}>
        {entry.homeTeam} vs {entry.awayTeam}
        <span
          className="ml-1.5 text-[11px] font-semibold"
          style={{ color: "var(--wc-mute, #5c6470)" }}
        >
          {getGameTypeLabel(entry.gameType)} · {entry.total.toLocaleString()}명 참여
        </span>
      </p>
      <div className="space-y-1.5">
        {picks.map((pick) => {
          const count = entry.counts[pick] ?? 0
          const pct = entry.total > 0 ? Math.round((count / entry.total) * 100) : 0
          const isMine = pick === entry.myPick
          return (
            <div key={pick} className="flex items-center gap-2">
              <span
                className="w-[88px] shrink-0 truncate text-[12px]"
                style={{
                  color: isMine ? "var(--wc-burgundy, #961e37)" : "var(--wc-ink-2, #494d56)",
                  fontWeight: isMine ? 700 : 500,
                }}
              >
                {pickLabel(pick, entry)}
                {isMine && " ✓"}
              </span>
              <div
                className="h-2 flex-1 overflow-hidden rounded-full"
                style={{ background: "rgba(0,0,0,0.06)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: isMine ? "var(--wc-burgundy, #961e37)" : "rgba(0,0,0,0.22)",
                  }}
                />
              </div>
              <span
                className="w-[38px] shrink-0 text-right text-[12px] tabular-nums"
                style={{
                  color: isMine ? "var(--wc-burgundy, #961e37)" : "var(--wc-mute, #5c6470)",
                  fontWeight: isMine ? 700 : 500,
                }}
              >
                {pct}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 예측 완료 모달 — 커뮤니티 전환 실험 (2026-07-02).
 * 기존 "예측 완료!" 단순 알림(막다른 골목)을 대체:
 * 1) 방금 예측한 경기들의 전체 픽 분포 ("다른 사람들은 어디에?")
 * 2) 최신 글 카드 + 게시판 CTA (showCommunity 일 때만)
 * 클릭은 GA4(prediction_modal_*)로 계측 → 매치 스레드(B안) 투자 판단 데이터.
 */
export function PredictionSuccessDialog({ state, onClose }: PredictionSuccessDialogProps) {
  // 최신 글 — 종목 무관, 썸네일 있는 글 우선 노출.
  // ⚠️ 2026-08-12 패널: 이전엔 sort=hot 에 "🔥 지금 인기 있는 글" 라벨이었는데,
  // 온도가 전부 0이라 hot 은 최신순의 다른 이름이었다 — 최고 전환 지점(이 모달)에서
  // "인기글"이라며 평균 조회 0.57짜리 최신 봇글을 뿌리던 셈. 라벨을 사실대로 바꾸고
  // 쿼리도 정직하게 sort=new 로. "오늘의 이슈" 편성 슬롯이 생기면 이 소스를 교체한다.
  const { data: hotData } = useSWR<{ posts: HotPost[] }>(
    state.isOpen && state.showCommunity ? "/api/posts?sort=new&limit=8" : null,
    fetcher
  )
  // 진행 중 이적 사가 — 예측 직후는 "다음 베팅거리"를 찾는 순간 (PM 토론 #4)
  const { data: sagaData } = useSWR<{ sagas: ActiveSaga[] }>(
    state.isOpen ? "/api/saga/active" : null,
    fetcher
  )
  const activeSagas = (sagaData?.sagas ?? []).slice(0, 2)
  const hotPosts = (() => {
    const all = hotData?.posts ?? []
    const withThumb = all.filter((p) => postThumbnail(p))
    const withoutThumb = all.filter((p) => !postThumbnail(p))
    return [...withThumb, ...withoutThumb].slice(0, 3)
  })()

  return (
    <Dialog
      open={state.isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-[440px]" showCloseButton={false}>
        <DialogHeader className="items-center text-center">
          <div
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: "rgba(47,125,91,0.15)" }}
          >
            <Circle
              className="h-7 w-7"
              style={{ fill: "var(--wc-go, #2f7d5b)", color: "var(--wc-go, #2f7d5b)" }}
            />
          </div>
          <DialogTitle className="text-xl" style={{ color: "var(--wc-go, #2f7d5b)" }}>
            예측 완료!
          </DialogTitle>
          <DialogDescription className="pt-1 text-center text-sm whitespace-pre-line">
            {state.message}
          </DialogDescription>
        </DialogHeader>

        {/* min-w-0 필수 — DialogContent 는 grid 이고 grid item 의 min-width:auto 기본값 때문에
            긴 콘텐츠(HOT 제목)가 컬럼을 다이얼로그 밖으로 밀어냄 (truncate 무력화) */}
        {state.distribution.length > 0 && (
          <div className="max-h-[280px] min-w-0 space-y-2 overflow-y-auto">
            {state.distribution.map((entry) => (
              <DistributionCard key={`${entry.gameId}-${entry.myPick}`} entry={entry} />
            ))}
          </div>
        )}

        {/* 이적 사가 주입 — 예측을 막 끝낸 사람에게 "다음 논쟁거리"를 쥐여준다.
            나간다/남는다 투표가 예측과 같은 근육이라 전환 마찰이 가장 낮은 표면 */}
        {activeSagas.length > 0 && (
          <div className="min-w-0 space-y-2">
            <p className="text-[12px] font-bold" style={{ color: "var(--wc-mute, #5c6470)" }}>
              ⚔️ 지금 뜨거운 이적 사가 — 나간다 vs 남는다
            </p>
            {activeSagas.map((s) => (
              <Link
                key={s.slug}
                href={`/saga/${s.slug}?utm_source=prediction_modal`}
                onClick={() =>
                  trackEvent({
                    name: "prediction_modal_saga_click",
                    params: { saga_slug: s.slug },
                  })
                }
                className="flex min-w-0 items-center gap-2.5 rounded-lg p-2.5 transition-colors hover:opacity-80"
                style={{
                  background: "rgba(150,30,55,0.06)",
                  border: "1px solid var(--wc-line, #e8e5e0)",
                }}
              >
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold"
                  style={{ background: "var(--wc-burgundy, #961e37)", color: "#fff" }}
                >
                  {STAGE_LABEL[s.stage] ?? s.stage}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-[13px] font-semibold"
                  style={{ color: "var(--wc-ink, #1a1714)" }}
                >
                  {s.title}
                </span>
                <span
                  className="shrink-0 text-[11px] tabular-nums"
                  style={{ color: "var(--wc-mute, #5c6470)" }}
                >
                  기록 {s.entry_count}
                </span>
              </Link>
            ))}
          </div>
        )}

        {state.showCommunity && hotPosts.length > 0 && (
          <div className="min-w-0 space-y-2">
            <p className="text-[12px] font-bold" style={{ color: "var(--wc-mute, #5c6470)" }}>
              ⚡ 방금 올라온 소식
            </p>
            {hotPosts.map((post) => {
              const thumb = postThumbnail(post)
              return (
                <Link
                  key={post.id}
                  href={`/post/${post.id}`}
                  onClick={() =>
                    trackEvent({
                      name: "prediction_modal_post_click",
                      params: { post_id: post.id },
                    })
                  }
                  className="flex min-w-0 items-center gap-2.5 rounded-lg p-2 transition-colors hover:opacity-80"
                  style={{
                    background: "rgba(150,30,55,0.06)",
                    border: "1px solid var(--wc-line, #e8e5e0)",
                  }}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      loading="lazy"
                      className="h-14 w-14 shrink-0 rounded-md object-cover"
                      style={{ background: "var(--wc-paper, #faf9f7)" }}
                    />
                  ) : (
                    <span
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-[10px] font-bold"
                      style={{ background: "var(--wc-burgundy, #961e37)", color: "#fff" }}
                    >
                      HOT
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span
                      className="line-clamp-2 text-[13px] leading-snug font-semibold"
                      style={{ color: "var(--wc-ink, #1a1714)" }}
                    >
                      {post.title}
                    </span>
                    <span
                      className="flex items-center gap-2 text-[11px] tabular-nums"
                      style={{ color: "var(--wc-mute, #5c6470)" }}
                    >
                      <span className="flex items-center gap-0.5">
                        <ThumbsUp className="h-3 w-3" />
                        {post.vote_count ?? 0}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <MessageSquare className="h-3 w-3" />
                        {post.comment_count ?? 0}
                      </span>
                    </span>
                  </span>
                </Link>
              )
            })}
            <Link
              href="/"
              onClick={() =>
                trackEvent({
                  name: "prediction_modal_board_click",
                  params: { board: "feed" },
                })
              }
              className="flex w-full items-center justify-center rounded-lg py-2.5 text-[13px] font-bold transition-opacity hover:opacity-90"
              style={{ background: "var(--wc-burgundy, #961e37)", color: "#fff" }}
            >
              담벼락 구경하러 가기 →
            </Link>
          </div>
        )}

        {/* 검증된 최대 레버(예측 완료 직후) — 재소환 채널(디스코드) 유입 */}
        <div className="min-w-0">
          <DiscordInviteBanner variant="inline" placement="prediction_success" />
        </div>

        <DialogFooter className="sm:justify-center">
          <Button
            onClick={onClose}
            variant="outline"
            className="w-full px-8 sm:w-auto"
            style={{ color: "var(--wc-ink-2, #494d56)" }}
          >
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
