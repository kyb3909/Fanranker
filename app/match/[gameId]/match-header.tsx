import Image from "next/image"
import Link from "@/components/ui/app-link"
import { leagueKicker, leagueLabel, leagueMarkSrc } from "@/lib/match/leagues"
import { LiveMinute } from "@/components/match/live-minute"
import type { MatchSummary } from "@/lib/match/get-match"

/**
 * 매치 센터 스코어 밴드 (2026-08-18 리디자인).
 *
 * 스코어를 흰 카드에서 **다크 밴드로 올린다** — 이 개편의 핵심 한 수.
 * 사이트에서 밴드를 쓰는 페이지가 11곳인데 매치·사가만 빠져 있어 "페이지가 시작하지
 * 않는" 인상을 줬다 (2026-08-18 디자인 감사). `PageBand` 컴포넌트는 쓰지 않는다 —
 * 제목 슬롯 하나로는 [팀 · 스코어 · 팀] 3열을 담을 수 없어 `.gn-band` 위에 전용 레이아웃을 얹는다.
 *
 * 규약
 * - 결과는 색이 아니라 **명도**로 말한다: 이긴 쪽 숫자만 cream, 진 쪽은 회색, 무승부는 둘 다 cream
 * - 구분자는 콜론이 아니라 **en-dash** — 콜론은 시각 표기다 (03:45)
 * - 킥오프 전에는 스코어 자리에 시각. `vs` 는 쓰지 않는다 (팀명 사이 공백이 그 일을 한다)
 * - 라이브 중계를 하지 않으므로 진행 중에도 스코어를 주장하지 않는다
 */

function fmtKst(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })
}

function fmtKstTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })
}

export function MatchHeader({
  match,
  finished,
  homeScore,
  awayScore,
  homeLabel,
  awayLabel,
  live = false,
  minute = null,
  thread = null,
}: {
  match: MatchSummary
  finished: boolean
  homeScore: number | null
  awayScore: number | null
  /** 지면 표기 (사전 통칭). 없으면 원문 — 데이터 값은 그대로 둔다 */
  homeLabel?: string
  awayLabel?: string
  /** LFA 기준 진행 중 (2026-08-20 라이브 매치센터) — 스코어·분을 라이브로 낸다 */
  live?: boolean
  minute?: string | null
  /** 이 경기의 불판. 있으면 밴드 아래 이음매에 걸치는 도선이 붙는다 */
  thread?: { id: string | number; commentCount: number } | null
}) {
  // 라이브 중에도 스코어를 낸다 (2026-08-20 운영자: "그래야 매치센터지") —
  // 종전 "진행 중엔 스코어를 주장하지 않는다"(8/16)는 LFA 라이브 실측 확인으로 폐기.
  const showScore = (finished || live) && homeScore != null && awayScore != null
  const status = finished
    ? "종료"
    : live
      ? "LIVE"
      : match.status === "cancelled"
        ? "취소"
        : match.status === "in_progress"
          ? "진행 중"
          : "예정"

  // 이긴 쪽만 크림, 진 쪽은 회색 — 무승부면 둘 다 크림. 라이브 중엔 승패 톤을 걸지
  // 않는다 (아직 끝난 얘기가 아니다) — 둘 다 크림.
  const dim = "#8d8794"
  const homeTone = !showScore || live || homeScore! >= awayScore! ? "var(--gn-cream)" : dim
  const awayTone = !showScore || live || awayScore! >= homeScore! ? "var(--gn-cream)" : dim

  // ⚠️ "← 경기 일정" 목적지는 달력일이 아니라 **매치데이**다. /matches 의 한 창은
  //    KST 06:00 ~ 다음날 06:00 — 새벽 킥오프(유럽 경기 대부분)에 +9h 달력일을 쓰면
  //    그 경기가 없는 날짜로 떨어진다 (2026-08-19 패널 3중 실측: 8/18 04:00 경기 →
  //    ?date=8/18 은 0경기, 실제 소속은 8/17). KST에서 6시간을 되감은 날짜 = +3h UTC.
  const backDate = new Date(new Date(match.matchTime).getTime() + 3 * 3600_000)
    .toISOString()
    .slice(0, 10)

  const markSrc = leagueMarkSrc(match.leagueCode)

  return (
    <section className={thread ? "gn-band gn-band-open" : "gn-band"} aria-label="경기 스코어">
      {/* 리그 워터마크 — 크림 에칭 라인, 우하단 (2026-08-20 P2). 콘텐츠 프레임에
          relative 를 줘 글 위로 올린다.
          ⚠️ 불판 도선이 붙으면 밴드가 overflow:visible 이라 밴드 스스로는 더 이상
             잘라 주지 않는다 → 워터마크만 따로 감싸서 밴드 박스에 가둔다. */}
      {markSrc && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <Image
            src={markSrc}
            alt=""
            width={600}
            height={400}
            aria-hidden
            className="absolute right-0 bottom-0 w-[420px] max-w-[52%] select-none"
            style={{ opacity: 0.11 }}
          />
        </div>
      )}
      <div /* 본문 프레임(1080)과 좌측 등뼈를 맞춘다 — 밴드만 1280 이면 전환 시 점프 */
        className={`relative mx-auto max-w-[1080px] px-4 pt-5 sm:px-6 ${thread ? "pb-3" : "pb-6"}`}
      >
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/matches?date=${backDate}`}
            className="text-[11.5px] font-semibold no-underline transition-colors"
            style={{ color: "var(--gn-cream-dim)" }}
          >
            ← 경기 일정
          </Link>
          <span
            className="text-[11.5px] font-bold"
            style={{ color: "var(--gn-cream-dim)", letterSpacing: "0.12em" }}
          >
            {status}
          </span>
        </div>

        {/* 키커는 **라틴 표기**(leagueKicker), 본문 라벨은 한글 — betman 코드를 그대로
            넣으면 한글 코드가 .gn-num(라틴 전용)에서 깨지고 라벨과 같은 단어가 두 번
            찍힌다 ("라리가 라리가", 2026-08-19 감리 A-1). 라틴 표기가 없는 코드는
            키커 없이 라벨만. */}
        <p className="mt-3.5 flex flex-wrap items-baseline gap-x-2">
          {leagueKicker(match.leagueCode) && (
            <span
              className="gn-num text-[12.5px] font-bold uppercase"
              style={{ color: "var(--gn-bg-100)", letterSpacing: "0.2em" }}
            >
              {leagueKicker(match.leagueCode)}
            </span>
          )}
          <span className="text-[12.5px] font-semibold" style={{ color: "var(--gn-cream-dim)" }}>
            {leagueLabel(match.leagueCode)}
          </span>
        </p>

        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5">
          <span
            className="min-w-0 text-right text-[17px] leading-tight font-extrabold sm:text-[20px]"
            style={{ color: "var(--gn-cream)", wordBreak: "keep-all" }}
          >
            {homeLabel ?? match.homeTeam}
          </span>
          {showScore ? (
            <span className="text-center">
              <span
                className="gn-num block text-[40px] leading-none font-bold sm:text-[56px]"
                style={{ letterSpacing: "-0.02em" }}
              >
                <span style={{ color: homeTone }}>{homeScore}</span>
                <span style={{ opacity: 0.35, fontSize: "0.55em", padding: "0 10px" }}>–</span>
                <span style={{ color: awayTone }}>{awayScore}</span>
              </span>
              {live && (
                <span
                  className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-bold"
                  style={{ color: "var(--gn-live)", letterSpacing: "0.08em" }}
                >
                  {/* 라임은 LIVE 전용, 화면당 1곳 (디자인 규칙) — 여기가 그 1곳이다 */}
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 animate-pulse rounded-full"
                    style={{ background: "var(--gn-live)" }}
                  />
                  {minute ? <LiveMinute minute={minute} /> : "LIVE"}
                </span>
              )}
            </span>
          ) : (
            <span className="text-center">
              <span
                className="gn-num block text-[28px] leading-none font-bold sm:text-[32px]"
                style={{ color: "var(--gn-cream)" }}
                suppressHydrationWarning
              >
                {fmtKstTime(match.matchTime)}
              </span>
              <span
                className="mt-1 block text-[11px] font-bold"
                style={{ color: "var(--gn-cream-dim)", letterSpacing: "0.12em" }}
              >
                KST
              </span>
            </span>
          )}
          <span
            className="min-w-0 text-left text-[17px] leading-tight font-extrabold sm:text-[20px]"
            style={{ color: "var(--gn-cream)", wordBreak: "keep-all" }}
          >
            {awayLabel ?? match.awayTeam}
          </span>
        </div>

        <p className="mt-4 text-[11.5px]" style={{ color: "var(--gn-cream-dim)" }}>
          <span suppressHydrationWarning>{fmtKst(match.matchTime)}</span>
          {match.venue ? ` · ${match.venue}` : ""}
        </p>
      </div>

      {/* 불판 도선 — 밴드와 종이의 이음매에 걸친다 (2026-08-24 시안 B 채택).
          종전 한 줄 배너가 안 보였던 건 색이 옅어서가 아니었다: `.gn-band + *` 가 다음
          형제에게 깔아 주는 버건디 잔광(#f7eef0)과 배너 채움(#fbf2f4)이 사실상 같은 색이라
          (대비 1.04:1) 표면 자체가 없었고, 모양은 같은 화면의 길안내 줄 셋과 한 글자도
          달라지지 않아 "넘겨도 되는 줄"로 학습됐다.
          경계선을 가로지르는 물체는 그 경계의 대비를 빌려 온다 — 윗절반이 다크 위라
          윤곽이 무조건 잡히고, 잔광 위에 놓여도 사라지지 않는다.
          클리핑은 `.gn-band-open` 이 푼다 (운동장 게시판 카드와 같은 문법 — 새 모양을
          발명하지 않는다). 잘려 나가는 건 워터마크뿐이라 위에서 따로 가둬 뒀다. */}
      {thread && (
        // ⚠️ 음수 마진은 **flex 아이템**에 건다. 블록 자식에 걸면 overflow 가 풀린 밴드
        //    밖으로 마진이 붕괴해 나가 다음 형제(main)만 20px 끌어올리고 알약은 걸치지
        //    않는다 (2026-08-24 실측: belowSeam 0px). 운동장 카드도 같은 이유로 그리드
        //    안에 들어 있다.
        <div className="mx-auto flex max-w-[1080px] justify-center px-4 sm:px-6">
          <div className="relative z-[2] mb-[-20px] max-w-full">
            <Link
              href={`/post/${thread.id}?utm_source=matchcenter`}
              className="inline-flex h-10 max-w-full items-center gap-[9px] rounded-full pr-[5px] pl-[15px] whitespace-nowrap no-underline transition-transform hover:-translate-y-0.5"
              style={{
                background: "var(--wc-paper)",
                border: "1px solid color-mix(in srgb, var(--wc-burgundy) 18%, var(--wc-paper))",
                boxShadow: "0 6px 20px rgba(74, 13, 25, 0.24)",
              }}
            >
              <span
                aria-hidden
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ background: "var(--wc-burgundy)" }}
              />
              <span
                className="min-w-0 truncate text-[12.5px] font-extrabold"
                style={{ color: "var(--wc-ink)" }}
              >
                경기 반응 보러
                {thread.commentCount > 0 ? ` · 댓글 ${thread.commentCount}` : ""}
              </span>
              <span
                className="inline-flex h-[30px] shrink-0 items-center rounded-full px-[13px] text-[11.5px] font-extrabold text-white"
                style={{ background: "var(--wc-burgundy)" }}
              >
                불판 →
              </span>
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}
