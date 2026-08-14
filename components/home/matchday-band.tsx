"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { HeroVsVote } from "@/components/home/hero-vs-vote"
import { useAuth } from "@clerk/nextjs"
import Link from "@/components/ui/app-link"
import { GUNNERS_SEASON } from "@/lib/event/gunners-season"
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import type { CardNewsItem } from "@/lib/feed/cardnews"
import type { GroupedMatch } from "@/types/betting"

/**
 * 담벼락 상단 "오늘의 메인 이벤트" 다크 밴드 (시안 A · 매치데이).
 *
 * 좌: 톱스토리 캐러셀 — 카드뉴스 최신 글 중 이미지 있는 것 상위 3개
 * 우: 오늘의 경기 — 다음 킥오프 카운트다운 + 경기 목록 + 예측 진입
 *
 * 배당률 숫자는 노출하지 않는다 (정책). 픽은 /prediction 에서.
 */

const SLIDE_MS = 6000
const MAX_SLIDES = 3
const MAX_ROWS = 4

/** 브랜드 헤드라인 — 어그로체 Bold (한글 디스플레이).
 *  ⚠️ 이미 Bold 라 font-weight 를 더 얹으면 합성 볼드로 뭉갠다. */
const DISPLAY = "var(--font-display-ko), var(--font-title)"

function fmtKstTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })
}

function fmtKstDate(d: Date): string {
  return d
    .toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      timeZone: "Asia/Seoul",
    })
    .replace(",", "")
    .toUpperCase()
}

interface MatchdayBandProps {
  cards: CardNewsItem[]
  /**
   * 컴팩트 변형 — 홈 "오늘의 경기" 탭용 (2026-07-30 디자인 감리 실행안 B).
   * 히어로 캐러셀·경기 목록 없이 같은 DNA(키커·타이포·날짜 스탬프)의 한 줄 밴드만.
   * 탭 전환 시 530px 히어로가 "다른 페이지"로 갈아엎어지는 대신 "요약됐다"로 읽힌다.
   */
  compact?: boolean
  /**
   * SSR 프리페치된 경기 데이터 (app/page.tsx) — 첫 HTML 에 경기 목록을 실어
   * 하이드레이션 후 밴드가 자라며 본문을 밀어내는 CLS(모바일 0.17)를 제거한다.
   * null 이면 기존처럼 클라이언트 SWR 로만 로드 (fail-open).
   */
  initialGames?: { groupedGames?: GroupedMatch[] } | null
}

export function MatchdayBand({ cards, compact = false, initialGames }: MatchdayBandProps) {
  const slides = useMemo(() => cards.filter((c) => !!c.image).slice(0, MAX_SLIDES), [cards])

  const { data } = useSWR<{ groupedGames?: GroupedMatch[] }>("/api/sports/games", fetcher, {
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
    fallbackData: initialGames ?? undefined,
  })

  // 아직 시작 안 한 경기만, 킥오프 순.
  // 당분간 축구만 노출 (운영자 2026-08-14) — 시즌 이벤트 기간 홈의 초점을 축구에 고정.
  // SSR fallback(initialGames)에도 타 종목이 섞여 오므로 URL 이 아니라 여기서 거른다.
  const matches = useMemo(() => {
    const now = Date.now()
    return (data?.groupedGames ?? [])
      .filter((m) => m.sport === "축구")
      .filter((m) => new Date(m.matchTime).getTime() > now)
      .filter((m) => m.homeTeam && m.awayTeam && m.homeTeam !== "미정" && m.awayTeam !== "미정")
      .sort((a, b) => a.matchTime.localeCompare(b.matchTime))
  }, [data])

  // 훅 규칙상 조건 없이 호출 — full 밴드에서는 TodayFixtures 에 내려준다
  const countdown = useCountdown(matches[0]?.matchTime)

  if (compact) {
    return (
      <section className="gn-band" aria-label="오늘의 경기">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-8 pb-8">
            <span
              className="gn-num text-[13px] font-bold uppercase"
              style={{ letterSpacing: "0.2em", color: "var(--gn-bg-100)" }}
            >
              Matchday
            </span>
            <h2
              className="text-[30px] leading-none sm:text-[42px]"
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                color: "var(--gn-cream)",
                letterSpacing: "-0.035em",
              }}
            >
              오늘의 경기
            </h2>
            {countdown && matches.length > 0 && (
              <span
                className="gn-num ml-auto hidden text-[15px] font-bold sm:block"
                style={{ letterSpacing: "0.06em", color: "var(--gn-cream-dim)" }}
                suppressHydrationWarning
              >
                다음 킥오프 <span style={{ color: "var(--gn-cream)" }}>{countdown}</span> ·{" "}
                {matches.length}경기
              </span>
            )}
          </div>
        </div>
      </section>
    )
  }

  // 밴드는 톱스토리도 경기도 없으면 통째로 숨긴다 (빈 다크 박스로 첫 화면 낭비 X)
  if (slides.length === 0 && matches.length === 0) return null

  return (
    <section className="gn-band" aria-label="오늘의 메인 이벤트">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-6 pb-4">
          <span
            className="gn-num text-[13px] font-bold uppercase"
            style={{ letterSpacing: "0.2em", color: "var(--gn-bg-100)" }}
          >
            Matchday
          </span>
          <h2
            /* PageBand 와 동일 스케일 — 페이지 제목(42) > 톱스토리 헤드라인(31) 위계 */
            className="text-[30px] leading-none sm:text-[42px]"
            style={{
              // 어그로체는 Bold(700) 단일 — 900 을 얹으면 브라우저가 합성 볼드로 뭉갠다
              fontFamily: DISPLAY,
              fontWeight: 700,
              color: "var(--gn-cream)",
              letterSpacing: "-0.035em",
            }}
          >
            오늘의 메인 이벤트
          </h2>
          <span
            className="gn-num ml-auto hidden text-[15px] font-bold sm:block"
            style={{ letterSpacing: "0.1em", color: "var(--gn-cream-dim)" }}
            suppressHydrationWarning
          >
            {fmtKstDate(new Date())}
          </span>
        </div>

        <div className="grid gap-4 pb-7 lg:grid-cols-[1.35fr_1fr]">
          {slides.length > 0 && <TopStoryCarousel slides={slides} />}
          {matches.length > 0 && <TodayFixtures matches={matches} countdown={countdown} />}
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────── 톱스토리 캐러셀 ─────────────────────────── */

function TopStoryCarousel({ slides }: { slides: CardNewsItem[] }) {
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchX = useRef<number | null>(null)

  const go = useCallback(
    (n: number) => setIdx((n + slides.length) % slides.length),
    [slides.length]
  )

  useEffect(() => {
    if (paused || slides.length < 2) return
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), SLIDE_MS)
    return () => clearInterval(t)
  }, [paused, slides.length])

  const cur = slides[idx]

  return (
    <div
      className="relative flex min-h-[300px] items-end overflow-hidden rounded-[16px] sm:min-h-[420px]"
      style={{ background: "var(--gn-night-soft)", boxShadow: "0 20px 50px -20px rgba(0,0,0,.7)" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 40) go(dx < 0 ? idx + 1 : idx - 1)
        touchX.current = null
      }}
      aria-roledescription="carousel"
      aria-label="오늘의 톱스토리"
    >
      {slides.map((c, i) => (
        <article
          key={c.id}
          className="absolute inset-0 flex items-end transition-opacity duration-500"
          style={{ opacity: i === idx ? 1 : 0, visibility: i === idx ? "visible" : "hidden" }}
          aria-hidden={i !== idx}
        >
          <div className="gn-thumb gn-thumb-hero absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.image as string}
              alt=""
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : undefined}
              style={{ objectPosition: "50% 22%" }}
            />
          </div>
          <div className="relative z-[2] w-full p-5 sm:p-8">
            {(c.source || c.flair) && (
              <span
                className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-[12.5px] font-extrabold"
                style={{ background: "var(--wc-burgundy)", color: "var(--gn-cream)" }}
              >
                {c.flair?.name ?? "오늘의 톱뉴스"}
                {c.source && <em className="font-semibold not-italic opacity-85">· {c.source}</em>}
              </span>
            )}
            <h3
              className="font-title max-w-[21ch] text-[22px] leading-[1.24] font-bold sm:text-[31px]"
              style={{
                color: "var(--gn-cream)",
                letterSpacing: "-0.025em",
                // 한글은 기본값이 글자 단위 줄바꿈이라 "로드리"가 "로/드리"로 갈라진다
                // → 어절 단위로만 꺾는다. overflowWrap 은 초장문 안전판.
                wordBreak: "keep-all",
                overflowWrap: "break-word",
              }}
            >
              <Link href={`/post/${c.id}`} className="hover:underline">
                {c.title}
              </Link>
            </h3>
            {/* VS 쟁점 — 결과만 보던 스트립을 **그 자리에서 투표**로 (2026-08-12 운영자).
                다크 밴드(선언 영역) 안이라 다크 허용. 기사 진입은 컴포넌트 안 별도 링크. */}
            {c.vs && <HeroVsVote vs={c.vs} postId={c.id} />}
            {/* 0 카운트는 노출하지 않는다 (피드 count>0 규칙과 통일, 2026-07-30 워룸
                — "댓글 0 · 추천 0" 전시는 유령 사이트 각인만 남긴다). CTA 링크는
                2026-08-04 운영자 지시로 제거 — 제목 링크가 내비게이션을 담당한다. */}
            {(c.commentCount > 0 || c.voteCount > 0) && (
              <p className="mt-3 text-[13.5px]" style={{ color: "var(--gn-cream-dim)" }}>
                <span className="gn-num">
                  {[
                    c.commentCount > 0 ? `댓글 ${c.commentCount}` : null,
                    c.voteCount > 0 ? `추천 ${c.voteCount}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </p>
            )}
          </div>
        </article>
      ))}

      {slides.length > 1 && (
        <>
          <div className="absolute top-4 right-4 z-[3] flex gap-1.5">
            <CarouselBtn label="이전 톱스토리" onClick={() => go(idx - 1)}>
              <ChevronLeft className="h-[17px] w-[17px]" aria-hidden />
            </CarouselBtn>
            <CarouselBtn label="다음 톱스토리" onClick={() => go(idx + 1)}>
              <ChevronRight className="h-[17px] w-[17px]" aria-hidden />
            </CarouselBtn>
          </div>
          {/* 도트 비주얼은 8px 유지, 버튼 실박스는 h-6 + gap-4 로 터치 타깃 24px 확보
              (인접 중심 간격 ≥24px — pseudo hit area 는 target-size 감사가 인정 안 함) */}
          <div className="absolute right-5 bottom-5 z-[3] flex items-center gap-4">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => go(i)}
                aria-label={`${i + 1}번 톱스토리`}
                aria-current={i === idx}
                className="flex h-6 items-center"
              >
                <span
                  aria-hidden
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: i === idx ? 22 : 8,
                    background: i === idx ? "var(--gn-cream)" : "rgba(245,239,231,.34)",
                  }}
                />
              </button>
            ))}
          </div>
        </>
      )}

      {/* 스크린리더용 현재 슬라이드 안내 */}
      <span className="sr-only" aria-live="polite">
        {cur ? `${idx + 1} / ${slides.length} — ${cur.title}` : ""}
      </span>
    </div>
  )
}

function CarouselBtn({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-full backdrop-blur-[6px] transition-colors hover:bg-[var(--wc-burgundy)]"
      style={{
        background: "rgba(22,20,26,.55)",
        border: "1px solid rgba(245,239,231,.22)",
        color: "var(--gn-cream)",
      }}
    >
      {children}
    </button>
  )
}

/* ─────────────────────────── 오늘의 경기 ─────────────────────────── */

function TodayFixtures({
  matches,
  countdown,
}: {
  matches: GroupedMatch[]
  countdown: string | null
}) {
  // SSR/하이드레이션 첫 렌더에서는 undefined → 게스트 문구로 시작, 로그인 확인 후 전환
  const { isSignedIn } = useAuth()
  const shown = matches.slice(0, MAX_ROWS)
  const rest = matches.length - shown.length

  return (
    <aside
      className="gn-dcard flex flex-col p-5"
      style={{ boxShadow: "0 20px 50px -20px rgba(0,0,0,.7)" }}
    >
      <div className="flex items-center justify-between">
        <h3
          className="text-[21px] leading-none"
          style={{
            fontFamily: DISPLAY,
            fontWeight: 700,
            color: "var(--gn-cream)",
            letterSpacing: "-0.035em",
          }}
        >
          오늘의 경기
        </h3>
        <span
          className="gn-num text-[13px] font-bold uppercase"
          style={{ color: "var(--gn-cream-dim)", letterSpacing: "0.06em" }}
        >
          {matches.length} matches
        </span>
      </div>

      {countdown && (
        <div
          className="mt-2 flex items-baseline gap-2.5 pt-1 pb-3"
          style={{ borderBottom: "1px solid var(--gn-night-line)" }}
        >
          <span className="text-[12.5px] font-bold" style={{ color: "var(--gn-cream-dim)" }}>
            다음 킥오프까지
          </span>
          <span
            className="gn-num text-[34px] leading-none font-bold"
            style={{ color: "var(--gn-cream)" }}
            suppressHydrationWarning
          >
            {countdown}
          </span>
        </div>
      )}

      {/* 시즌 개막 이벤트 진입점 — 미신청자는 /season(참가 신청), 신청자는 /prediction 으로
          가는 스마트 라우터(/season/join). 사전 등록 기간부터 노출 (운영자 2026-08-14) */}
      {new Date() < new Date(GUNNERS_SEASON.endAt) && (
        <Link
          href="/season/join?ref=band"
          className="mt-2 flex items-center justify-between rounded-lg px-3 py-2 transition-opacity hover:opacity-85"
          style={{ background: "rgba(150,30,55,0.28)", border: "1px solid rgba(150,30,55,0.5)" }}
        >
          <span className="text-[12.5px] font-bold" style={{ color: "var(--gn-cream)" }}>
            🏁 오늘 개막 이벤트 참가하기
          </span>
          <span className="text-[12px] font-bold" style={{ color: "var(--gn-cream-dim)" }}>
            참가 →
          </span>
        </Link>
      )}

      <ul className="flex-1">
        {shown.map((m) => (
          <li key={m.matchKey} style={{ borderBottom: "1px solid rgba(54,48,64,.55)" }}>
            <Link
              href="/prediction"
              className="grid grid-cols-[52px_58px_1fr] items-center gap-2.5 py-2.5 transition-opacity hover:opacity-80"
            >
              <span
                className="gn-num text-[20px] leading-none font-bold"
                style={{ color: "var(--gn-cream)" }}
                suppressHydrationWarning
              >
                {fmtKstTime(m.matchTime)}
              </span>
              <span
                className="gn-num rounded px-0 py-[3px] text-center text-[11px] font-bold uppercase"
                style={{
                  border: "1px solid var(--gn-night-line)",
                  color: "var(--gn-cream-dim)",
                  letterSpacing: "0.08em",
                }}
              >
                {m.leagueCode}
              </span>
              <span className="truncate text-[14px] font-bold" style={{ color: "var(--gn-cream)" }}>
                {m.homeTeam}
                <span className="gn-num mx-1.5 text-[11px] font-bold" style={{ color: "#8d8794" }}>
                  VS
                </span>
                {m.awayTeam}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/prediction"
        className="mt-4 flex items-center justify-center gap-1.5 rounded-[12px] py-3 text-[15px] font-extrabold transition-transform active:scale-[.98]"
        style={{ background: "var(--gn-cream)", color: "var(--gn-night)" }}
      >
        {!isSignedIn
          ? "가입하고 오늘 경기 예측하기"
          : rest > 0
            ? `오늘 ${matches.length}경기 예측하기`
            : "오늘 경기 예측하기"}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
      <p className="mt-2 text-center text-[12px]" style={{ color: "#8d8794" }}>
        {/* 비로그인에겐 가치 제안, 로그인에겐 리마인더 (2026-07-30 워룸: CTA 전부 미래형·
            가입 이유 0개 문제의 밴드 몫) */}
        {!isSignedIn
          ? "가입은 1분 — 맞힌 기록이 점수로 쌓입니다"
          : "매일 밤 11시 볼 충전 — 오늘 안 하면 내일의 내가 아쉬워함"}
      </p>
    </aside>
  )
}

/** 다음 킥오프까지 HH:MM:SS. 서버/첫 렌더에서는 null → 하이드레이션 불일치 없음 */
function useCountdown(iso?: string): string | null {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    if (!iso) {
      setText(null)
      return
    }
    const target = new Date(iso).getTime()
    const tick = () => {
      const diff = Math.max(0, target - Date.now())
      const h = Math.floor(diff / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      const s = Math.floor((diff % 60_000) / 1000)
      const pad = (n: number) => String(n).padStart(2, "0")
      setText(`${pad(h)}:${pad(m)}:${pad(s)}`)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [iso])

  return text
}
