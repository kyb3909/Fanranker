"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { useAuth, useClerk } from "@clerk/nextjs"
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

/**
 * 모달용 VS 투표 (2026-08-12 패널 Top5 #5 — "쓰기 대신 고르기").
 *
 * 편성 카드에 실려 온 vs 데이터로 1탭 투표. post-detail 의 VsIssueWidget 과 같은
 * 엔드포인트·이벤트를 쓰되 surface="modal" 로 분리 계측한다 — 이 표면의 클릭률이
 * "예측 직후 바로바로 참여" 가설의 판정 지표다 (3일 누적 15% 미만이면 가설 기각).
 * 배치는 기사 카드 **아래** 고정 — 언론사 지표(기사 조회)가 우선이라 1주차엔 순서
 * 실험을 하지 않는다 (트래픽이 없어 A/B 가 성립하지 않음).
 */
function ModalVsVote({ vs }: { vs: NonNullable<CardNewsItem["vs"]> }) {
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const [myKey, setMyKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 카드엔 % 와 총표만 실려 온다 — 근사 카운트로 복원해 낙관 반영에 쓴다
  const [counts, setCounts] = useState(() => {
    const aCount = Math.round((vs.total * vs.aPct) / 100)
    return { [vs.aKey]: aCount, [vs.bKey]: vs.total - aCount }
  })

  useEffect(() => {
    // 노출 계측 — 세션당 폴별 1회 (surface 별 dedupe 키 분리: 다른 표면은 다른 노출)
    try {
      const seen = JSON.parse(sessionStorage.getItem("vs-seen-modal") || "{}")
      if (!seen[vs.pollId]) {
        seen[vs.pollId] = 1
        sessionStorage.setItem("vs-seen-modal", JSON.stringify(seen))
        trackEvent({ name: "vs_impression", params: { poll_id: vs.pollId, surface: "modal" } })
      }
    } catch {
      trackEvent({ name: "vs_impression", params: { poll_id: vs.pollId, surface: "modal" } })
    }
  }, [vs.pollId])

  async function vote(optionKey: string) {
    if (busy || myKey === optionKey) return
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    setBusy(true)
    const prevKey = myKey
    const prevCounts = counts
    setCounts((c) => ({
      ...c,
      [optionKey]: (c[optionKey] ?? 0) + 1,
      ...(prevKey ? { [prevKey]: Math.max(0, (c[prevKey] ?? 1) - 1) } : {}),
    }))
    setMyKey(optionKey)
    try {
      const res = await fetch(`/api/polls/${vs.pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionKey }),
      })
      if (!res.ok) throw new Error()
      trackEvent({
        name: "vs_vote",
        params: { poll_id: vs.pollId, option_key: optionKey, surface: "modal" },
      })
    } catch {
      setMyKey(prevKey)
      setCounts(prevCounts)
    } finally {
      setBusy(false)
    }
  }

  const aCount = counts[vs.aKey] ?? 0
  const bCount = counts[vs.bKey] ?? 0
  const total = aCount + bCount
  const aPct = total === 0 ? 50 : Math.round((aCount / total) * 100)
  // 소표본(10표 미만)엔 % 숨김 — 1표가 "0% vs 100%" 로 그려지면 유령 사이트 증거가 된다
  const showPct = total >= 10

  const side = (key: string, label: string, color: string) => {
    const mine = myKey === key
    return (
      <button
        type="button"
        onClick={() => vote(key)}
        disabled={busy}
        aria-pressed={mine}
        className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left transition-all disabled:opacity-70"
        style={{
          background: mine ? `color-mix(in srgb, ${color} 8%, white)` : "var(--wc-card, #fff)",
          border: `1.5px solid ${mine ? color : "var(--wc-line, #e8e5e0)"}`,
        }}
      >
        <span
          className="block truncate text-[12.5px] font-bold"
          style={{ color: mine ? color : "var(--wc-ink, #1a1714)", wordBreak: "keep-all" }}
        >
          {label}
          {mine && " ✓"}
        </span>
      </button>
    )
  }

  return (
    <div
      className="min-w-0 rounded-lg p-3"
      style={{
        background: "var(--wc-paper, #faf9f7)",
        border: "1px solid var(--wc-line, #e8e5e0)",
      }}
    >
      <p
        className="mb-2 text-[12.5px] leading-snug font-bold"
        style={{ color: "var(--wc-ink, #1a1714)", wordBreak: "keep-all" }}
      >
        🗳️ {vs.question}
      </p>
      <div className="flex gap-2">
        {side(vs.aKey, vs.aLabel, "var(--wc-burgundy, #961e37)")}
        {side(vs.bKey, vs.bLabel, "#2c4a6e")}
      </div>
      <p className="mt-1.5 text-[11px]" style={{ color: "var(--wc-mute, #5c6470)" }}>
        {total === 0 ? "첫 표를 던져보세요" : `참여 ${total.toLocaleString()}명`}
        {showPct && ` · ${aPct}% vs ${100 - aPct}%`}
        {!isSignedIn && " · 투표는 로그인 후"}
      </p>
    </div>
  )
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
  // ── 슬롯 재편성 (2026-08-12 패널 Top5 #4): 이 모달은 CTA 자리가 아니라
  // 하루 조회 15회짜리 콘텐츠를 사람 눈앞에 옮기는 **유일한 유통 채널**이다. ──

  // ① 오늘의 이슈 — 편성 시스템(fetchHeroCards 3단: 수동 핀 → 에이전트 픽 → 규칙 폴백).
  // 담벼락 히어로와 같은 소스라 한 번 편성하면 두 화면에 동시 노출. 폴백 덕에 안 비는다.
  const { data: featuredData } = useSWR<{ cards: CardNewsItem[] }>(
    state.isOpen && state.showCommunity ? "/api/feed/featured" : null,
    fetcher
  )
  const featuredCards = (featuredData?.cards ?? []).slice(0, 3)

  // ② 진행 중 이적 사가 — 예측 직후는 "다음 논쟁거리"를 찾는 순간 (PM 토론 #4)
  const { data: sagaData } = useSWR<{ sagas: ActiveSaga[] }>(
    state.isOpen ? "/api/saga/active" : null,
    fetcher
  )
  const activeSagas = (sagaData?.sagas ?? []).slice(0, 2)

  // ③ 방금 예측한 팀 소식 — 룰 기반(개인화 아님, 유저 0명에서도 작동): 슬립의 팀명이
  // 제목에 걸리는 최신 글. 편성 카드와 중복 제거. 매치 없으면 섹션 자체를 생략한다
  // (일반 최신글로 채우면 ①의 폴백과 겹쳐 같은 글이 두 번 보인다).
  const teamNames = Array.from(
    new Set(state.distribution.flatMap((e) => [e.homeTeam, e.awayTeam]).filter(Boolean))
  )
  const { data: latestData } = useSWR<{ posts: HotPost[] }>(
    state.isOpen && state.showCommunity && teamNames.length > 0
      ? "/api/posts?sort=new&limit=30"
      : null,
    fetcher
  )
  const featuredIds = new Set(featuredCards.map((c) => String(c.id)))
  const teamPosts = (latestData?.posts ?? [])
    .filter((p) => !featuredIds.has(String(p.id)))
    .filter((p) => teamNames.some((t) => p.title.includes(t)))
    .slice(0, 3)

  // ④ VS 투표 — 편성 카드에 실려 온 폴 하나만, 기사 카드 아래 (Top5 #5)
  const modalVs = featuredCards.find((c) => c.vs)?.vs

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
                    style={{ background: "var(--wc-paper, #faf9f7)" }}
                  />
                ) : (
                  <span
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-[10px] font-bold"
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
                    className="flex items-center gap-2 text-[11px] tabular-nums"
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
                      style={{ background: "var(--wc-paper, #faf9f7)" }}
                    />
                  ) : (
                    <span
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-[10px] font-bold"
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
          </div>
        )}

        {/* ④ VS 투표 — 기사 카드 아래 고정 (언론사 지표 = 기사 조회가 우선) */}
        {state.showCommunity && modalVs && <ModalVsVote vs={modalVs} />}

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
