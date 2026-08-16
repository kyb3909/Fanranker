"use client"

import { useEffect, useState } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { trackEvent } from "@/lib/analytics/events"
import type { CardNewsItem } from "@/lib/feed/cardnews"

/**
 * VS 쟁점 1탭 투표 — 카드/모달 공용.
 *
 * ## 왜 공용인가
 * 같은 투표를 표면마다 따로 만들면 이 저장소가 반복해서 앓은 병이 재발한다
 * (표기 사전이 읽는 경로 7개로 갈라져 하루에 사고가 다섯 번 났던 것과 같은 구조).
 * 낙관 반영·롤백·소표본 처리 규칙은 한 곳에만 있어야 한다.
 *
 * 글 상세의 VsIssueWidget 과는 **의도적으로 별개**다: 저쪽은 폴 원본(options 배열,
 * myKey 서버값)을 받는 큰 위젯이고, 이쪽은 피드 카드에 실려 오는 압축 형태
 * (`CardNewsItem["vs"]` — 퍼센트와 총표만)를 받는 한 줄짜리다.
 *
 * ## 표면별 계측
 * surface 로 노출·투표를 갈라 본다. 같은 폴이라도 다른 표면은 다른 노출이므로
 * 세션 dedupe 키도 표면별로 분리한다.
 */

const A_COLOR = "var(--wc-burgundy, #961e37)"
const B_COLOR = "#2c4a6e"

/**
 * 퍼센트 공개 하한 (2026-08-12 개편: 10 → 3).
 *
 * ## 왜 10이 문제였나
 * 30일간 생성된 폴 238개 중 10표를 넘긴 폴이 **0개**였다(최다 1표). 즉 이 기능이
 * 살아온 내내 **아무도 결과를 본 적이 없다**. 투표해도 체크 표시 하나만 돌아오니
 * 누를 이유가 없고, 안 누르니 10표에 영원히 못 닿는 자기봉쇄 구조였다.
 *
 * ## 3의 근거
 * 이 기능의 원설계 노트가 "3표도 67:33 으로 살아 보인다"(콜드스타트 대응)였다.
 * 10은 그 근거보다 훨씬 높게 잡혀 있었고, 근거 쪽이 맞다.
 *
 * ## 하한만 내리면 안 되는 이유
 * 10을 둔 원래 목적은 "1표가 100% vs 0% 로 그려지는" 유령 사이트 그림을 막는 것이고,
 * 그 목적 자체는 여전히 옳다. 그래서 하한을 내리는 대신 **양쪽 다 표가 있을 때만**
 * 퍼센트를 쓰고(SHOW_PCT_MIN_VOTES + bothSides), 그 전 구간은 퍼센트 대신 **실수**를
 * 보여준다. 같은 사실이라도 "1 vs 0"은 "이제 막 시작"으로 읽히고
 * "100% vs 0%"는 "죽은 사이트"로 읽힌다 — 숫자를 지어내지 않고 표기만 바꾼 것이다.
 */
const SHOW_PCT_MIN_VOTES = 3

interface CardVsVoteProps {
  vs: NonNullable<CardNewsItem["vs"]>
  surface: "card" | "modal"
  /** 카드용 컴팩트 배치 — 질문을 한 줄로 줄이고 여백을 줄인다 */
  compact?: boolean
  /**
   * 배치 형태 (2026-08-12 디자인 패널).
   *  · box   — 종이 틴트 + 테두리를 두른 기존 위젯 (모달·상세 표면)
   *  · strip — 테두리 없이 카드 하단에 붙는 전폭 44px 띠 (피드 카드)
   *
   * strip 이 생긴 이유: 카드 본문 안에 박힌 box 가 "카드 안에 또 카드"를 만들었고,
   * 투표 유무로 카드 높이가 2배 갈려 스캔 리듬이 끊겼다. 띠로 빼면 둘 다 사라진다.
   * box 를 지우지 않은 건 모달·상세가 질문 문장을 여전히 필요로 하기 때문이다
   * (거기선 카드 제목이라는 맥락이 없다).
   */
  variant?: "box" | "strip"
}

export function CardVsVote({ vs, surface, compact, variant = "box" }: CardVsVoteProps) {
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
    const storageKey = `vs-seen-${surface}`
    try {
      const seen = JSON.parse(sessionStorage.getItem(storageKey) || "{}")
      if (!seen[vs.pollId]) {
        seen[vs.pollId] = 1
        sessionStorage.setItem(storageKey, JSON.stringify(seen))
        trackEvent({ name: "vs_impression", params: { poll_id: vs.pollId, surface } })
      }
    } catch {
      trackEvent({ name: "vs_impression", params: { poll_id: vs.pollId, surface } })
    }
  }, [vs.pollId, surface])

  async function vote(optionKey: string) {
    if (busy || myKey === optionKey) return
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    setBusy(true)
    const prevKey = myKey
    const prevCounts = counts
    // 낙관 반영 — 실패하면 되돌린다
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
        params: { poll_id: vs.pollId, option_key: optionKey, surface },
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
  const showPct = total >= SHOW_PCT_MIN_VOTES && aCount > 0 && bCount > 0
  /**
   * 퍼센트가 아직 정직하게 성립하지 않는 구간의 대체 표기 — 실수 그대로.
   * **내가 던진 뒤에만** 켠다: 아무도 안 누른 카드에 "0 / 0"을 전시하면
   * 없는 것만 못하다(빈 상태를 광고하는 꼴). 던진 사람에게만 값을 돌려준다.
   */
  const showCount = !showPct && myKey !== null

  const side = (key: string, label: string, color: string) => {
    const mine = myKey === key
    return (
      <button
        type="button"
        onClick={(e) => {
          // 카드 전체가 링크(absolute inset-0)라 클릭이 기사로 새는 것을 막는다
          e.preventDefault()
          e.stopPropagation()
          vote(key)
        }}
        disabled={busy}
        aria-pressed={mine}
        className={`pointer-events-auto relative z-[2] min-w-0 flex-1 rounded-lg text-left transition-all disabled:opacity-70 ${
          compact ? "px-2 py-1.5" : "px-2.5 py-2"
        }`}
        style={{
          background: mine ? `color-mix(in srgb, ${color} 8%, white)` : "var(--wc-card, #fff)",
          border: `1.5px solid ${mine ? color : "var(--wc-line, #e8e5e0)"}`,
        }}
      >
        <span
          className={`block truncate font-bold ${compact ? "text-[11.5px]" : "text-[12.5px]"}`}
          style={{ color: mine ? color : "var(--wc-ink, #1a1714)", wordBreak: "keep-all" }}
        >
          {label}
          {mine && " ✓"}
        </span>
      </button>
    )
  }

  /**
   * 띠 형태 — 전폭 44px, 가운데 1px 분할선.
   *
   * 질문 문장과 안내문("첫 표를 던져보세요 · 투표는 로그인 후")을 버렸다.
   * 질문은 바로 위 카드 제목이 이미 말하고 있고, 안내문은 카드마다 반복돼
   * 노이즈였다. 비로그인 클릭은 그대로 로그인 창을 연다 — 미리 경고할 필요가 없다.
   *
   * ## 투표하면 무엇이 돌아오는가
   * 44px 고정이라 "참여 N명" 같은 안내 줄을 따로 붙일 자리가 없다. 그래서 **선택한
   * 칸 자체가 값을 돌려준다** — 퍼센트가 성립하면 퍼센트, 아니면 실수, 그리고
   * 내가 그 폴의 첫 사람이면 "첫 표".
   *
   * "첫 표"를 굳이 문구로 세운 이유: 1표는 퍼센트로 쓰면 100%(유령)이고 실수로 쓰면
   * 1(초라함)인데, **선착 순위로 쓰면 지위**가 된다. 같은 사실의 세 표기 중 가장
   * 정직하면서 유일하게 보상으로 읽히는 것을 골랐다. 트래픽이 적을수록 자주 걸리는
   * 구간이라 여기가 실질 기본값이다.
   */
  if (variant === "strip") {
    const stripSide = (key: string, label: string, color: string, pct: number, count: number) => {
      const mine = myKey === key
      // 내가 방금 만든 첫 표 — 상대 칸에까지 "첫 표"가 붙지 않도록 mine 조건을 건다
      const isFirst = mine && total === 1
      return (
        <button
          type="button"
          onClick={() => vote(key)}
          disabled={busy}
          role="radio"
          aria-checked={mine}
          className="min-w-0 flex-1 px-3 text-[12.5px] font-bold transition-colors"
          style={{
            height: 44,
            background: mine ? `color-mix(in srgb, ${color} 9%, white)` : "transparent",
            color: mine ? color : "var(--wc-ink, #1a1714)",
          }}
        >
          <span className="block truncate">
            {mine && "✓ "}
            {label}
            {showPct && (
              <span className="ml-1 font-extrabold tabular-nums" style={{ color }}>
                {pct}%
              </span>
            )}
            {showCount &&
              (isFirst ? (
                <span className="ml-1 font-extrabold" style={{ color }}>
                  첫 표
                </span>
              ) : (
                <span className="ml-1 font-extrabold tabular-nums" style={{ color }}>
                  {count}
                </span>
              ))}
          </span>
        </button>
      )
    }
    return (
      <div
        role="radiogroup"
        aria-label={vs.question}
        className="flex items-stretch"
        // 틴트 없음 — hairline 하나로만 나눈다 (편집 패널: 카드가 이미 액자다.
        // 틴트를 얹으면 카드마다 서류 푸터가 하나씩 달린 것처럼 읽힌다)
        style={{ borderTop: "1px solid var(--wc-line, #e8e5e0)" }}
      >
        {stripSide(vs.aKey, vs.aLabel, A_COLOR, aPct, aCount)}
        <span aria-hidden style={{ width: 1, background: "var(--wc-line, #e8e5e0)" }} />
        {stripSide(vs.bKey, vs.bLabel, B_COLOR, 100 - aPct, bCount)}
      </div>
    )
  }

  return (
    <div
      className={`pointer-events-auto relative z-[2] min-w-0 rounded-lg ${compact ? "mt-2 p-2" : "p-3"}`}
      style={{
        background: "var(--wc-paper, #ffffff)",
        border: "1px solid var(--wc-line, #e8e5e0)",
      }}
    >
      <p
        className={`mb-1.5 leading-snug font-bold ${compact ? "line-clamp-1 text-[11.5px]" : "text-[12.5px]"}`}
        style={{ color: "var(--wc-ink, #1a1714)", wordBreak: "keep-all" }}
      >
        🗳️ {vs.question}
      </p>
      <div className="flex gap-1.5">
        {side(vs.aKey, vs.aLabel, A_COLOR)}
        {side(vs.bKey, vs.bLabel, B_COLOR)}
      </div>
      {/* 박스는 안내 줄이 있으므로 띠와 달리 여기서 값을 돌려준다 — 규칙(showPct/showCount)은 공유 */}
      <p className="mt-1 text-[10.5px]" style={{ color: "var(--wc-mute, #5c6470)" }}>
        {total === 0
          ? "첫 표를 던져보세요"
          : myKey && total === 1
            ? "🎉 당신이 이 쟁점의 첫 표입니다"
            : `참여 ${total.toLocaleString()}명`}
        {showPct && ` · ${aPct}% vs ${100 - aPct}%`}
        {showCount && total > 1 && ` · ${aCount} vs ${bCount}`}
        {!isSignedIn && " · 투표는 로그인 후"}
      </p>
    </div>
  )
}
