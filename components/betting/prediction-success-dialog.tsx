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
import { fetcher } from "@/lib/swr"
import { trackEvent } from "@/lib/analytics/events"
import { getGameTypeLabel } from "@/types/betting"
import type { PickDistributionEntry, PredictionSuccessState } from "@/types/betting"

interface PredictionSuccessDialogProps {
  state: PredictionSuccessState
  onClose: () => void
}

interface HotPost {
  id: string
  title: string
  comment_count: number | null
  vote_count: number | null
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
        background: "var(--wc-paper, #f1f1f3)",
        border: "1px solid var(--wc-line, #e2e5ea)",
      }}
    >
      <p className="mb-2 text-[13px] font-bold" style={{ color: "var(--wc-ink, #14161a)" }}>
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
 * 2) 축구 게시판 인기글 1개 + 게시판 CTA (showCommunity 일 때만)
 * 클릭은 GA4(prediction_modal_*)로 계측 → 매치 스레드(B안) 투자 판단 데이터.
 */
export function PredictionSuccessDialog({ state, onClose }: PredictionSuccessDialogProps) {
  const { data: hotData } = useSWR<{ posts: HotPost[] }>(
    state.isOpen && state.showCommunity
      ? "/api/posts?community_slug=football&sort=hot&limit=1"
      : null,
    fetcher
  )
  const hotPost = hotData?.posts?.[0]

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

        {state.distribution.length > 0 && (
          <div className="max-h-[280px] space-y-2 overflow-y-auto">
            {state.distribution.map((entry) => (
              <DistributionCard key={`${entry.gameId}-${entry.myPick}`} entry={entry} />
            ))}
          </div>
        )}

        {state.showCommunity && (
          <div className="space-y-2">
            {hotPost && (
              <Link
                href={`/post/${hotPost.id}`}
                onClick={() =>
                  trackEvent({
                    name: "prediction_modal_post_click",
                    params: { post_id: hotPost.id },
                  })
                }
                className="flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 transition-colors hover:opacity-80"
                style={{
                  background: "rgba(150,30,55,0.06)",
                  border: "1px solid var(--wc-line, #e2e5ea)",
                }}
              >
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: "var(--wc-burgundy, #961e37)", color: "#fff" }}
                >
                  HOT
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-[13px] font-semibold"
                  style={{ color: "var(--wc-ink, #14161a)" }}
                >
                  {hotPost.title}
                </span>
                <span
                  className="flex shrink-0 items-center gap-2 text-[11px] tabular-nums"
                  style={{ color: "var(--wc-mute, #5c6470)" }}
                >
                  <span className="flex items-center gap-0.5">
                    <ThumbsUp className="h-3 w-3" />
                    {hotPost.vote_count ?? 0}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <MessageSquare className="h-3 w-3" />
                    {hotPost.comment_count ?? 0}
                  </span>
                </span>
              </Link>
            )}
            <Link
              href="/community/football"
              onClick={() =>
                trackEvent({
                  name: "prediction_modal_board_click",
                  params: { board: "football" },
                })
              }
              className="flex w-full items-center justify-center rounded-lg py-2.5 text-[13px] font-bold transition-opacity hover:opacity-90"
              style={{ background: "var(--wc-burgundy, #961e37)", color: "#fff" }}
            >
              축구 게시판에서 이 경기 얘기하기 →
            </Link>
          </div>
        )}

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
