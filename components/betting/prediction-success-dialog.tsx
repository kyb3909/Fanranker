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
import { CardVsVote } from "@/components/vs/card-vs-vote"
import { trackEvent } from "@/lib/analytics/events"
import { STAGE_LABEL } from "@/lib/saga/stages"
import { getGameTypeLabel } from "@/types/betting"
import { isEventLive } from "@/lib/event/gunners-season"
import {
  extractFirstImageSrcFromTipTapJSON,
  extractFirstEmbedFromTipTapJSON,
} from "@/lib/utils/tiptap-embeds"
import type { CardNewsItem } from "@/lib/feed/cardnews"
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
        background: "var(--wc-paper, #ffffff)",
        border: "1px solid var(--wc-line, #e8e5e0)",
      }}
    >
      <p className="mb-2 text-[13px] font-bold" style={{ color: "var(--wc-ink, #1a1714)" }}>
        {entry.homeTeam} vs {entry.awayTeam}
        <span
          className="ml-1.5 text-[12px] font-semibold"
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
  // ── 슬롯 재편성 (2026-08-12 패널 Top5 #4): 이 모달은 CTA 자리가 아니라
  // 하루 조회 15회짜리 콘텐츠를 사람 눈앞에 옮기는 **유일한 유통 채널**이다. ──

  // ⚡ 프리페치 (2026-08-14 운영자: "모달 뜨고 나서 뉴스가 늦게 뜬다")
  // 이 컴포넌트는 예측 페이지와 함께 **마운트되어 있고** 모달만 닫혀 있다. 그런데
  // SWR 키를 state.isOpen 으로 잠가 두면 "제출 순간"에야 3개 요청이 동시에 나가서
  // 카드가 뒤늦게 채워진다 — 유저가 가장 집중한 3초를 빈 자리로 쓰는 셈.
  // 키를 열어 두면 페이지 체류 중에 미리 받아 두고, 제출 시엔 캐시가 즉시 그려진다.
  // (세 엔드포인트 모두 CDN 캐시 대상이고 dedupe 되므로 부하는 무시할 만하다.)
  const PREFETCH = { revalidateOnFocus: false, dedupingInterval: 60_000 }

  // ① 오늘의 이슈 — 편성 시스템(fetchHeroCards 3단: 수동 핀 → 에이전트 픽 → 규칙 폴백).
  // 담벼락 히어로와 같은 소스라 한 번 편성하면 두 화면에 동시 노출. 폴백 덕에 안 비는다.
  const { data: featuredData } = useSWR<{ cards: CardNewsItem[] }>(
    "/api/feed/featured",
    fetcher,
    PREFETCH
  )
  const featuredCards = (featuredData?.cards ?? []).slice(0, 3)

  // ② 진행 중 이적 사가 — 예측 직후는 "다음 논쟁거리"를 찾는 순간 (PM 토론 #4)
  const { data: sagaData } = useSWR<{ sagas: ActiveSaga[] }>("/api/saga/active", fetcher, PREFETCH)
  const activeSagas = (sagaData?.sagas ?? []).slice(0, 2)

  // ③ 방금 예측한 팀 소식 — 룰 기반(개인화 아님, 유저 0명에서도 작동): 슬립의 팀명이
  // 제목에 걸리는 최신 글. 편성 카드와 중복 제거. 매치 없으면 섹션 자체를 생략한다
  // (일반 최신글로 채우면 ①의 폴백과 겹쳐 같은 글이 두 번 보인다).
  const teamNames = Array.from(
    new Set(state.distribution.flatMap((e) => [e.homeTeam, e.awayTeam]).filter(Boolean))
  )
  // 팀 필터는 클라이언트에서 하므로 키 자체는 제출 전에도 동일 → 같이 프리페치한다
  const { data: latestData } = useSWR<{ posts: HotPost[] }>(
    "/api/posts?sort=new&limit=30",
    fetcher,
    PREFETCH
  )
  const featuredIds = new Set(featuredCards.map((c) => String(c.id)))
  const teamPosts = (latestData?.posts ?? [])
    .filter((p) => !featuredIds.has(String(p.id)))
    .filter((p) => teamNames.some((t) => p.title.includes(t)))
    .slice(0, 3)

  // ④ VS 투표 — 편성 카드에 실려 온 폴 하나만, 기사 카드 아래 (Top5 #5)
  const modalVs = featuredCards.find((c) => c.vs)?.vs

  // ⑤ 이벤트 참가 여부 — 스트립 문구를 가른다 (신청자만 "반영됐어요"가 사실이다).
  // 경량 엔드포인트라 다른 프리페치와 같이 미리 받아 둔다.
  const { data: regData } = useSWR<{ registered: boolean }>(
    "/api/event/season/registration",
    fetcher,
    PREFETCH
  )
  const eventRegistered = regData?.registered === true

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

        {/* 개막 기념 승부예측 이벤트 스트립 (8/21~9/30) — 신청자에게는 "반영됐다", 미신청자에게는
            "신청하면 다음 예측부터"라고 말한다. 참여는 신청 이후부터이므로(운영자 확정
            2026-08-14) 미신청자에게 반영됐다고 하면 그건 거짓말이다. */}
        {state.sport === "축구" && isEventLive() && (
          <Link
            href={eventRegistered ? "/season?ref=pick" : "/season/join?ref=pick"}
            onClick={() => trackEvent({ name: "prediction_modal_event_click", params: {} })}
            className="flex min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2.5 transition-opacity hover:opacity-90"
            style={{
              background: "var(--wc-wine-tint, #fbf2f4)",
              border: "1px solid var(--wc-line, #e8e5e0)",
            }}
          >
            <span
              className="min-w-0 truncate text-[13px] font-bold"
              style={{ color: "var(--wc-burgundy, #961e37)" }}
            >
              {eventRegistered
                ? "🏁 개막 기념 승부예측 이벤트에 반영됐어요"
                : "🏁 개막 기념 승부예측 이벤트 — 신청하면 다음 예측부터"}
            </span>
            <span
              className="shrink-0 text-[12px] font-bold"
              style={{ color: "var(--wc-burgundy, #961e37)" }}
            >
              {eventRegistered ? "내 순위 보기 →" : "참가 신청 →"}
            </span>
          </Link>
        )}

        {/* 방금 예측한 경기의 불판 (2026-08-20 UX 패널 A3) — 예측 완료 직후가 검증된
            최대 전환 레버. 경기를 픽한 사람은 그 경기를 볼 사람이다 → 불판으로 잇는다.
            불판이 있는 경기만, 최대 3개 (모달 비대화 방지) */}
        {(state.threads ?? []).length > 0 && (
          <div className="min-w-0 space-y-2">
            {(state.threads ?? []).slice(0, 3).map((t) => (
              <Link
                key={t.threadId}
                href={`/post/${t.threadId}?utm_source=prediction_modal`}
                onClick={() =>
                  trackEvent({
                    name: "prediction_modal_thread_click",
                    params: { post_id: t.threadId },
                  })
                }
                className="flex min-w-0 items-baseline justify-between gap-2 rounded-lg px-3 py-2.5 transition-opacity hover:opacity-90"
                style={{
                  background: "var(--wc-wine-tint, #fbf2f4)",
                  border: "1px solid var(--wc-line, #e8e5e0)",
                }}
              >
                <span
                  className="min-w-0 truncate text-[13px] font-bold"
                  style={{ color: "var(--wc-ink, #1a1714)" }}
                >
                  {t.homeTeam} vs {t.awayTeam} 불판에서 같이 봐요
                </span>
                <span
                  className="shrink-0 text-[12px] font-bold"
                  style={{ color: "var(--wc-burgundy, #961e37)" }}
                >
                  참여 →
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* min-w-0 필수 — DialogContent 는 grid 이고 grid item 의 min-width:auto 기본값 때문에
            긴 콘텐츠(HOT 제목)가 컬럼을 다이얼로그 밖으로 밀어냄 (truncate 무력화) */}
        {state.distribution.length > 0 && (
          <div className="max-h-[280px] min-w-0 space-y-2 overflow-y-auto">
            {state.distribution.map((entry) => (
              <DistributionCard key={`${entry.gameId}-${entry.myPick}`} entry={entry} />
            ))}
          </div>
        )}

        {/* ① 오늘의 이슈 — 편성 카드 (원클릭 종점: 사가 연결 글은 위키로, 나머지는 글 상세로) */}
        {state.showCommunity && featuredCards.length > 0 && (
          <div className="min-w-0 space-y-2">
            <p className="text-[12px] font-bold" style={{ color: "var(--wc-mute, #5c6470)" }}>
              📌 오늘의 이슈
            </p>
            {featuredCards.map((card) => (
              <Link
                key={card.id}
                href={
                  card.sagaSlug
                    ? `/saga/${card.sagaSlug}?utm_source=prediction_modal`
                    : `/post/${card.id}`
                }
                onClick={() =>
                  trackEvent({
                    name: "prediction_modal_post_click",
                    params: { post_id: String(card.id), slot: "featured" },
                  })
                }
                className="flex min-w-0 items-center gap-2.5 rounded-lg p-2 transition-colors hover:opacity-80"
                style={{
                  background: "rgba(150,30,55,0.06)",
                  border: "1px solid var(--wc-line, #e8e5e0)",
                }}
              >
                {card.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.image}
                    alt=""
                    loading="lazy"
                    className="h-14 w-14 shrink-0 rounded-md object-cover"
                    style={{ background: "var(--wc-paper, #ffffff)" }}
                  />
                ) : (
                  <span
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-[12px] font-bold"
                    style={{ background: "var(--wc-burgundy, #961e37)", color: "#fff" }}
                  >
                    이슈
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span
                    className="line-clamp-2 text-[13px] leading-snug font-semibold"
                    style={{ color: "var(--wc-ink, #1a1714)" }}
                  >
                    {card.title}
                  </span>
                  <span
                    className="flex items-center gap-2 text-[12px] tabular-nums"
                    style={{ color: "var(--wc-mute, #5c6470)" }}
                  >
                    {card.flair?.name && (
                      <span
                        className="font-semibold"
                        style={{ color: card.flair.color ?? undefined }}
                      >
                        {card.flair.name}
                      </span>
                    )}
                    <span className="flex items-center gap-0.5">
                      <ThumbsUp className="h-3 w-3" />
                      {card.voteCount}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <MessageSquare className="h-3 w-3" />
                      {card.commentCount}
                    </span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* ② 이적 사가 주입 — 예측을 막 끝낸 사람에게 "다음 논쟁거리"를 쥐여준다.
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
                  className="shrink-0 rounded px-1.5 py-0.5 text-[12px] font-bold"
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
                  className="shrink-0 text-[12px] tabular-nums"
                  style={{ color: "var(--wc-mute, #5c6470)" }}
                >
                  기록 {s.entry_count}
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* ③ 방금 예측한 팀 소식 — 슬립의 팀명이 제목에 걸리는 최신 글 (룰 기반).
            매치 없으면 섹션 생략 — ①의 폴백과 같은 글이 두 번 보이는 것 방지 */}
        {state.showCommunity && teamPosts.length > 0 && (
          <div className="min-w-0 space-y-2">
            <p className="text-[12px] font-bold" style={{ color: "var(--wc-mute, #5c6470)" }}>
              🎯 방금 예측한 팀 소식
            </p>
            {teamPosts.map((post) => {
              const thumb = postThumbnail(post)
              return (
                <Link
                  key={post.id}
                  href={`/post/${post.id}`}
                  onClick={() =>
                    trackEvent({
                      name: "prediction_modal_post_click",
                      params: { post_id: post.id, slot: "team" },
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
                      style={{ background: "var(--wc-paper, #ffffff)" }}
                    />
                  ) : (
                    <span
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-[12px] font-bold"
                      style={{ background: "var(--wc-burgundy, #961e37)", color: "#fff" }}
                    >
                      소식
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
                      className="flex items-center gap-2 text-[12px] tabular-nums"
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
          </div>
        )}

        {/* ④ VS 투표 — 기사 카드 아래 고정 (언론사 지표 = 기사 조회가 우선) */}
        {state.showCommunity && modalVs && <CardVsVote vs={modalVs} surface="modal" />}

        {state.showCommunity && (
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
