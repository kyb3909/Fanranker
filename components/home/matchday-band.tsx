"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "@/components/ui/app-link"
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
}

export function MatchdayBand({ cards, compact = false }: MatchdayBandProps) {
  const slides = useMemo(() => cards.filter((c) => !!c.image).slice(0, MAX_SLIDES), [cards])

  const { data } = useSWR<{ groupedGames?: GroupedMatch[] }>("/api/sports/games", fetcher, {
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })

  // 아직 시작 안 한 경기만, 킥오프 순
  const matches = useMemo(() => {
    const now = Date.now()
    return (data?.groupedGames ?? [])
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
              style={{ objectPosition: "50% 22%" }}
            />
          </div>
          <div className="relative z-[2] w-full p-5 pl-[64px] sm:p-8 sm:pl-[110px]">
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
            {/* VS 쟁점 스트립 — 폴 있는 히어로에만. 다크 밴드(선언 영역) 안이라 다크 허용 */}
            {c.vs && (
              <Link href={`/post/${c.id}`} className="mt-3 block max-w-[430px] no-underline">
                <span
                  className="mb-1.5 flex items-baseline gap-2 text-[12.5px] font-bold"
                  style={{ color: "var(--gn-cream)" }}
                >
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider"
                    style={{ background: "rgba(150,30,55,.35)", color: "#e8a0b0" }}
                  >
                    오늘의 쟁점
                  </span>
                  <span style={{ wordBreak: "keep-all" }}>{c.vs.question}</span>
                </span>
                <span
                  className="flex h-[22px] overflow-hidden rounded-md text-[11px] font-extrabold"
                  style={{ color: "var(--gn-cream)" }}
                  role="img"
                  aria-label={`${c.vs.aLabel} ${c.vs.aPct}%, ${c.vs.bLabel} ${100 - c.vs.aPct}%`}
                >
                  <span
                    className="flex items-center pl-2"
                    style={{
                      width: `${c.vs.aPct}%`,
                      minWidth: 30,
                      background:
                        "linear-gradient(100deg, var(--wc-burgundy-deep,#771629), var(--wc-burgundy,#961e37))",
                    }}
                  >
                    {c.vs.aPct}%
                  </span>
                  <span
                    className="flex items-center justify-end pr-2"
                    style={{
                      width: `${100 - c.vs.aPct}%`,
                      minWidth: 30,
                      background: "linear-gradient(100deg, #2c4a6e, #1f3550)",
                    }}
                  >
                    {100 - c.vs.aPct}%
                  </span>
                </span>
                <span className="mt-1 flex justify-between text-[11px] font-bold">
                  <span style={{ color: "#e8a0b0", wordBreak: "keep-all" }}>{c.vs.aLabel}</span>
                  <span style={{ color: "#9db8d8", wordBreak: "keep-all" }}>{c.vs.bLabel}</span>
                </span>
              </Link>
            )}
            <p
              className="mt-3 flex items-center gap-3 text-[13.5px]"
              style={{ color: "var(--gn-cream-dim)" }}
            >
              <span className="gn-num">
                댓글 {c.commentCount} · 추천 {c.voteCount}
              </span>
              <Link
                href={`/post/${c.id}`}
                className="inline-flex items-center gap-1 font-bold"
                style={{ color: "var(--gn-bg-100)" }}
              >
                {c.vs ? "참전하러 가기" : "떡밥 물러 가기"}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </p>
          </div>
        </article>
      ))}

      {/* 고정 장식 플레이트 — 슬라이드가 바뀌어도 유지 */}
      <div
        aria-hidden
        className="absolute top-0 bottom-0 -left-8 w-[74px] opacity-90 sm:-left-9 sm:w-[118px]"
        style={{
          background: "linear-gradient(180deg, var(--wc-burgundy), var(--gn-bg-700))",
          transform: "skewX(-8deg)",
        }}
      >
        <span
          className="gn-num absolute top-5 left-[42px] text-[15px] font-bold whitespace-nowrap opacity-90 sm:top-6 sm:left-[54px] sm:text-[18px]"
          style={{
            transform: "skewX(8deg) rotate(90deg)",
            transformOrigin: "left top",
            letterSpacing: "0.34em",
            color: "var(--gn-cream)",
          }}
        >
          TOP STORY
        </span>
      </div>

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
          <div className="absolute right-5 bottom-5 z-[3] flex items-center gap-[7px]">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => go(i)}
                aria-label={`${i + 1}번 톱스토리`}
                aria-current={i === idx}
                className="h-2 rounded-full transition-all"
                style={{
                  width: i === idx ? 22 : 8,
                  background: i === idx ? "var(--gn-cream)" : "rgba(245,239,231,.34)",
                }}
              />
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
        {rest > 0 ? `오늘 ${matches.length}경기 픽 걸러 가기` : "오늘 픽 걸러 가기"}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
      <p className="mt-2 text-center text-[12px]" style={{ color: "#8d8794" }}>
        매일 밤 11시 볼 충전 — 오늘 안 걸면 내일의 내가 아쉬워함
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
