import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { ArrowRight } from "lucide-react"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { auth } from "@clerk/nextjs/server"
import { HeroCountdown } from "@/components/season/hero-countdown"
import { RaceJoinButton } from "@/components/season/race-join-button"
import { RaceMyPanel, RaceTopPanel } from "@/app/event/gunners-season/standing-panel"
import { findArsenalNextMatch, GUNNERS_SEASON } from "@/lib/event/gunners-season"
import { fetchSeasonSlipCount } from "@/lib/event/season-stats"
import { NEWS_BOT_USER_ID } from "@/lib/news/publish"
import { formatRelativeTime } from "@/lib/utils/date"

export const metadata: Metadata = {
  title: "구너스 레이스 — 앙리의 14번을 건 시즌 예측 레이스",
  description:
    "아스날은 심장으로, 나머지는 눈으로. 전 리그 예측으로 겨루는 구너들의 레이스 — 1위에게 티에리 앙리 친필 사인 14번 유니폼. 8/22 개막.",
  alternates: { canonical: "/season" },
  openGraph: {
    title: "구너스 레이스 | gongnori.fan",
    description: "리그는 38경기가 아니라 380경기다 — 시즌 레이스 1위가 앙리의 14번을 가져갑니다.",
    url: "/season",
  },
}

// S0/S1/S2 분기가 유저별(auth + 등록 여부)이라 요청마다 판정한다
export const dynamic = "force-dynamic"

/** 어그로체 디스플레이 — 매치데이 밴드와 동일 (이미 Bold 라 font-weight 얹지 말 것) */
const DISPLAY = "var(--font-display-ko), var(--font-title)"

/**
 * /season — 구너스 레이스 (2026-08-22 ~ 09-30). 아스날 단독 전환 2026-08-14.
 *
 * 한 URL, 상태별 인라인 전환 (workspace/event-design-FINAL-20260814.md — 리다이렉트 금지):
 * - S0 비로그인 / S1 로그인·미신청: 세일즈 스프레드 — 다크 히어로에 "앙리의 14번"
 *   단독 무대(경품 표 혼합 금지) + 참가 방법 3단계 + 원클릭 참가(팀 선택 없음).
 * - S2 신청 완료: 히어로가 컴팩트 밴드(~110px)로 접히고 레이스 허브 —
 *   ①내 순위 ②오늘 픽 스트립 ③메인 매치+아스날 소식 ④지금 뜨는 글 ⑤TOP5.
 *   콘텐츠 링크는 전부 ?ref=event (설계 1원칙: 예측은 입구, 목적지는 게시물).
 * - S3 종료 후 결과 화면은 후속 작업.
 *
 * 3파전 문법(팀 선택·팬덤 대결 카피·kop/blues 시각 요소)은 전량 제거됐다.
 * 톤: 느낌표·홈쇼핑 어휘 금지 — 물건이 셀수록 카피는 낮은 목소리 (구너 검수 §5).
 * 다크는 히어로 선언 존만, 라이트 존 다크 카드·한쪽 액센트 보더 금지.
 */

const STEPS = [
  {
    num: "01",
    title: "참가 등록",
    body: "버튼 하나로 끝. 팀 선택은 없습니다 — 구너라고 선언하면 그게 참가입니다.",
  },
  {
    num: "02",
    title: "평소처럼 예측",
    body: "따로 할 일이 없습니다. 기간 내 축구 픽이 자동으로 레이스에 집계됩니다. 매일 충전되는 무료 볼 10개면 충분합니다.",
  },
  {
    num: "03",
    title: "시즌 종료, 1위 확정",
    body: "9/30 레이스가 끝나면 1위가 앙리의 14번을 가져갑니다. TOP 5와 내 순위는 상시 공개됩니다.",
  },
] as const

const NOTICES = [
  "앙리의 14번(티에리 앙리 친필 사인 유니폼)은 이벤트 종료 시점 레이스 1위 1명에게 지급되며, 정품 인증서(COA)가 함께 제공됩니다. 사이즈·시즌 사양은 상세 공지 참조.",
  "순위는 이벤트 기간(8/22~9/30) 내 축구 승부예측의 net 손익으로 집계합니다 — 적중 시 stake×(배당−1), 실패 시 −stake. 정산이 완료된 예측만 점수에 반영됩니다.",
  "참가 등록자만 순위에 집계됩니다. 등록 전에 한 기간 내 예측도 등록하면 함께 집계됩니다.",
  "다계정·승부 담합 등 어뷰징이 확인되면 모든 계정이 순위에서 제외됩니다.",
  "5만원 초과 상품 수령 시 신원·배송 정보를 수집하며(제세공과금 처리), 미성년자는 법정대리인 동의가 필요합니다.",
]

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  })

function formatKickoff(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso))
}

const cardStyle = {
  background: "var(--wc-card)",
  border: "1px solid var(--wc-line)",
  boxShadow: "var(--wc-shadow-1)",
} as const

interface NewsRow {
  id: string
  title: string
  created_at: string
}

export default async function SeasonEventPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  // 운영자 미리보기 (?preview=1) — draft 상태에서 오픈된 세일즈 지면 확인.
  // 등록 API 는 여전히 draft 를 거부하므로 실제 참가는 불가. 표본 숫자는 리본으로 명시.
  const params = await searchParams
  const preview = params.preview === "1"

  const supabase = createServiceRoleClient()

  const { data: event } = await supabase
    .from("events")
    .select("id, status, start_at, end_at, registration_closes_at")
    .eq("slug", GUNNERS_SEASON.dbSlug)
    .maybeSingle()

  if (!event) {
    return (
      <div
        className="min-h-screen px-4 pt-16 text-center"
        style={{ background: "var(--wc-paper)" }}
      >
        <p style={{ color: "var(--wc-mute)" }}>이벤트 준비 중입니다.</p>
      </div>
    )
  }

  const { userId } = await auth()

  const [regCountRes, slipCount, myRegRes, newsRes] = await Promise.all([
    // 참가자 수 — 실시간 공개 항목 (아스날 단독이라 합계만)
    supabase
      .from("event_registrations")
      .select("user_id", { count: "exact", head: true })
      .eq("event_id", event.id),
    // 이벤트 슬립 누적 수 — 동적 귀속 RPC (등록자·기간 내, pending 포함)
    fetchSeasonSlipCount(supabase),
    userId
      ? supabase
          .from("event_registrations")
          .select("user_id")
          .eq("event_id", event.id)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null as { user_id: string } | null }),
    // 아스날 최신 소식 2 — 봇 기사 (표기 흔들림: 아스널/아스날). S0~S2 공통 —
    // 어느 상태에서도 페이지가 막다른 골목이 되지 않게 한다.
    supabase
      .from("posts")
      .select("id, title, created_at")
      .eq("user_id", NEWS_BOT_USER_ID)
      .is("deleted_at", null)
      .or("title.ilike.%아스널%,title.ilike.%아스날%")
      .order("created_at", { ascending: false })
      .limit(2),
  ])

  const totalRegs = regCountRes.count ?? 0
  const registered = !!myRegRes.data
  const arsenalNews = (newsRes.data ?? []) as NewsRow[]

  // 미리보기 표본 숫자 — 실데이터가 있으면 실데이터 우선
  const previewTotalRegs = preview && totalRegs === 0 ? 129 : totalRegs
  const previewSlipCount = preview && (slipCount ?? 0) === 0 ? 2431 : (slipCount ?? 0)

  const isDraft = event.status === "draft" && !preview
  const isClosed = event.status === "closed"
  const registrationOpen =
    !isDraft && !isClosed && new Date(event.registration_closes_at) > new Date()

  const msToStart = preview ? -1 : new Date(event.start_at).getTime() - Date.now()
  const started = msToStart <= 0

  /* ══════════════ S2 — 레이스 허브 (신청 완료) ══════════════ */
  if (registered && !preview) {
    const [arsenal, hotPostsRes] = await Promise.all([
      findArsenalNextMatch(supabase),
      // 지금 뜨는 글 — 온도순 (담벼락과 같은 신호)
      supabase
        .from("posts")
        .select("id, title, comment_count, temperature, created_at")
        .is("deleted_at", null)
        .order("temperature", { ascending: false, nullsFirst: false })
        .limit(5),
    ])
    const hotPosts = (hotPostsRes.data ?? []) as {
      id: string
      title: string
      comment_count: number | null
      created_at: string
    }[]
    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(event.end_at).getTime() - Date.now()) / 86_400_000)
    )

    return (
      <div className="min-h-screen" style={{ background: "var(--wc-paper)" }}>
        {/* 컴팩트 밴드 (~110px) — 세일즈 히어로가 접힌 형태 자체가 "당신은 이미
            참가자"라는 신호. 시계는 정적 D-n 하나만 (카운트다운 중복 금지) */}
        <section className="gn-band" aria-label="구너스 레이스">
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-8 pb-1.5">
              <span
                className="gn-num text-[13px] font-bold uppercase"
                style={{ letterSpacing: "0.2em", color: "var(--gn-bg-100)" }}
              >
                Race for No.14
              </span>
              <h1
                className="text-[30px] leading-none sm:text-[42px]"
                style={{
                  fontFamily: DISPLAY,
                  fontWeight: 700,
                  color: "var(--gn-cream)",
                  letterSpacing: "-0.035em",
                }}
              >
                구너스 레이스
              </h1>
              {!isClosed && (
                <span
                  className="gn-num ml-auto hidden text-[15px] font-bold sm:block"
                  style={{ letterSpacing: "0.1em", color: "var(--gn-cream-dim)" }}
                >
                  종료까지 D-{daysLeft}
                </span>
              )}
            </div>
            <p
              className="pb-7 text-[13px] font-bold"
              style={{ color: "var(--gn-cream-dim)", wordBreak: "keep-all" }}
            >
              {fmtDate(event.start_at)} ~ {fmtDate(event.end_at)} · 시즌 종료 시 1위가 앙리의 14번을
              가져갑니다
              {totalRegs > 0 && (
                <>
                  {" "}
                  · 참가 구너{" "}
                  <b className="gn-num text-[15px]" style={{ color: "var(--gn-cream)" }}>
                    {totalRegs.toLocaleString()}
                  </b>
                </>
              )}
              {(slipCount ?? 0) > 0 && (
                <>
                  {" "}
                  · 누적 예측{" "}
                  <b className="gn-num text-[15px]" style={{ color: "var(--gn-cream)" }}>
                    {(slipCount ?? 0).toLocaleString()}
                  </b>
                </>
              )}
            </p>
          </div>
        </section>

        <main className="mx-auto w-full max-w-[880px] space-y-4 px-4 pt-6 pb-16 sm:px-6">
          {/* ① 내 순위 — 재방문의 목적지 (개인화라 클라이언트 SWR) */}
          <RaceMyPanel />

          {/* ② 다음 행동 스트립 — 버건디 = 행동의 색 */}
          <Link
            href="/prediction?ref=event"
            className="flex items-center justify-between gap-3 rounded-xl px-5 py-4 transition-transform active:scale-[.99]"
            style={{
              background: "linear-gradient(100deg, var(--wc-burgundy), var(--wc-burgundy-deep))",
              color: "#fff",
              boxShadow: "0 12px 30px -12px rgba(150,30,55,.55)",
            }}
          >
            <span className="text-[15px] font-extrabold" style={{ wordBreak: "keep-all" }}>
              오늘 픽하러 가기{" "}
              <span className="font-semibold" style={{ color: "rgba(255,255,255,.75)" }}>
                — 기간 내 축구 픽이 전부 레이스 점수입니다
              </span>
            </span>
            <ArrowRight className="h-[18px] w-[18px] shrink-0" aria-hidden />
          </Link>

          {/* ③ 메인 매치 + 아스날 소식 — 배점은 동일, 강조만 (보너스 없음 확정) */}
          <section
            className="rounded-xl p-4"
            style={{
              background: "var(--wc-wine-tint)",
              border: "1px solid var(--wc-line)",
              boxShadow: "var(--wc-shadow-1)",
            }}
          >
            <p className="text-[12px] font-extrabold" style={{ color: "var(--wc-burgundy)" }}>
              ★ 메인 매치
            </p>
            {arsenal ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[17px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                    {arsenal.home} <span style={{ color: "var(--wc-mute)" }}>vs</span>{" "}
                    {arsenal.away}
                  </p>
                  <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--wc-mute)" }}>
                    {formatKickoff(arsenal.matchTime)}
                    {arsenal.league ? ` · ${arsenal.league}` : ""}
                  </p>
                </div>
                <Link
                  href="/prediction?ref=event"
                  className="rounded-lg px-4 py-2.5 text-[13.5px] font-bold"
                  style={{ background: "var(--wc-burgundy)", color: "#fff" }}
                >
                  예측하러 가기 →
                </Link>
              </div>
            ) : (
              <p className="mt-2 text-[13.5px]" style={{ color: "var(--wc-mute)" }}>
                다가오는 아스날 경기가 등록되면 여기에 표시됩니다.
              </p>
            )}
            {/* 예측 전에도 읽을거리 먼저 — 콘텐츠 전환 루프의 상시 진입점 */}
            {arsenalNews.length > 0 && (
              <div
                className="mt-3 space-y-1 border-t pt-2.5"
                style={{ borderColor: "var(--wc-line)" }}
              >
                {arsenalNews.map((n) => (
                  <Link
                    key={n.id}
                    href={`/post/${n.id}?ref=event`}
                    className="block truncate text-[13px] font-semibold hover:underline"
                    style={{ color: "var(--wc-ink-2)" }}
                  >
                    📰 {n.title}
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* ④ 지금 뜨는 글 — 허브가 막다른 골목이 되지 않게 (핵심 전환 루프) */}
          <section className="rounded-xl p-4" style={cardStyle}>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                🔥 지금 뜨는 글
              </h2>
              <Link
                href="/?ref=event"
                className="text-[12.5px] font-bold"
                style={{ color: "var(--wc-burgundy)" }}
              >
                담벼락 가기 →
              </Link>
            </div>
            <ul className="mt-3 divide-y" style={{ borderColor: "var(--wc-line)" }}>
              {hotPosts.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/post/${p.id}?ref=event`}
                    className="flex items-baseline justify-between gap-3 py-2.5"
                  >
                    <span
                      className="min-w-0 truncate text-[13.5px] font-semibold"
                      style={{ color: "var(--wc-ink)" }}
                    >
                      {p.title}
                      {(p.comment_count ?? 0) > 0 && (
                        <span
                          className="ml-1.5 text-[12px] font-bold"
                          style={{ color: "var(--wc-burgundy)" }}
                        >
                          {p.comment_count}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
                      {formatRelativeTime(new Date(p.created_at))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* ⑤ 구너 랭킹 TOP 5 */}
          <RaceTopPanel />
        </main>
      </div>
    )
  }

  /* ══════════════ S0/S1 — 세일즈 스프레드 (신청 전) ══════════════ */
  return (
    <div className="min-h-screen" style={{ background: "var(--wc-paper)" }}>
      {preview && (
        <div
          className="px-4 py-2 text-center text-[12.5px] font-bold text-white"
          style={{ background: "var(--wc-ink)" }}
        >
          미리보기 모드 — 표시된 참가·예측 숫자는 표본입니다 (실제 등록은 오픈 후 가능)
        </div>
      )}

      {/* ══ 다크 히어로 — 앙리의 14번 단독 무대 (선언 영역이라 다크 허용).
          배경 장식은 걷어낸다 — 다크 존의 어둠 자체가 벨벳 (편집 설계 §2.1) ══ */}
      <section className="gn-band" aria-label="구너스 레이스">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <div
            className="relative overflow-hidden rounded-b-[16px]"
            style={{ background: "var(--gn-night-soft)" }}
          >
            {/* 스큐 버건디 플레이트 + 세로 라벨 — 매치데이 밴드의 TOP STORY 문법 */}
            <div
              aria-hidden
              className="absolute top-0 bottom-0 -left-8 z-[2] w-[74px] opacity-90 sm:-left-9 sm:w-[118px]"
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
                GOONERS RACE
              </span>
            </div>

            {/* pl 은 스큐 플레이트의 "위쪽" 폭 기준 — skewX(-8deg) 가 상단을 오른쪽으로
                ~tan(8°)×(높이/2) ≈ 37px 밀어내므로, 플레이트 명목 폭(118px)만 보고 잡으면
                첫 줄 텍스트가 경사면과 겹친다 (2026-08-03 운영자 발견) */}
            <div className="relative grid gap-8 py-9 pr-4 pl-[72px] sm:py-12 sm:pr-8 sm:pl-[140px] lg:grid-cols-[1.05fr_.95fr] lg:gap-6">
              {/* ── 좌: 선언 ── */}
              <div>
                <p
                  className="mb-3 flex flex-wrap items-center gap-2.5 text-[12.5px] font-extrabold"
                  style={{ color: "var(--gn-bg-100)", letterSpacing: "0.14em" }}
                >
                  아스날 팬 전용 · 전 리그 예측 레이스
                  <span
                    className="gn-num rounded px-1.5 py-[2px] text-[10.5px]"
                    style={{
                      border: "1px solid var(--gn-night-line)",
                      color: "var(--gn-cream-dim)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {isClosed
                      ? "종료"
                      : isDraft
                        ? "오픈 준비 중"
                        : started
                          ? "진행 중"
                          : registrationOpen
                            ? "사전 등록 중"
                            : "오픈 예정"}
                  </span>
                </p>

                <h1
                  className="mb-4"
                  style={{
                    fontFamily: DISPLAY,
                    fontWeight: 700,
                    fontSize: "clamp(40px, 6vw, 64px)",
                    lineHeight: 1.08,
                    letterSpacing: "-0.02em",
                    color: "var(--gn-cream)",
                  }}
                >
                  구너스 레이스
                </h1>

                <p
                  className="mb-1.5 text-[16px] font-extrabold"
                  style={{ color: "var(--gn-cream)", wordBreak: "keep-all" }}
                >
                  리그는 38경기가 아니라 380경기다
                </p>
                <p
                  className="mb-6 text-[13.5px] font-bold"
                  style={{ color: "var(--gn-cream-dim)", wordBreak: "keep-all" }}
                >
                  아스날은 심장으로, 나머지는 눈으로 — 남의 경기를 읽는 눈이 레이스를 가립니다
                </p>

                {/* 앙리의 14번 — 획득 어법, COA 는 각주가 아니라 본문 (구너 검수 P0) */}
                <div
                  className="mb-6 rounded-xl px-4 py-3.5"
                  style={{
                    background: "rgba(255,255,255,.05)",
                    border: "1px solid var(--gn-night-line)",
                  }}
                >
                  <p
                    className="text-[15px] font-bold"
                    style={{ fontFamily: DISPLAY, fontWeight: 700, color: "var(--wc-gold)" }}
                  >
                    앙리의 14번
                  </p>
                  <p
                    className="mt-1 text-[14.5px] font-bold"
                    style={{ color: "var(--gn-cream)", wordBreak: "keep-all" }}
                  >
                    티에리 앙리 친필 사인 유니폼 — 단 1장. 1명. 1위가 가져갑니다.
                  </p>
                  <p
                    className="mt-1 text-[12.5px]"
                    style={{ color: "var(--gn-cream-dim)", wordBreak: "keep-all" }}
                  >
                    정품 인증서(COA)와 함께 배송됩니다. 추첨이 아니라 랭킹 1위의 몫입니다.
                  </p>
                </div>

                <div className="mb-6 flex flex-wrap items-center gap-3">
                  <HeroCountdown
                    target={started && !isClosed ? event.end_at : event.start_at}
                    label={started && !isClosed ? "레이스 종료까지" : "개막까지"}
                  />
                </div>

                {!isDraft && !isClosed ? (
                  <RaceJoinButton signedIn={!!userId} registrationOpen={registrationOpen} />
                ) : isDraft ? (
                  <p className="text-[13px] font-bold" style={{ color: "var(--gn-cream-dim)" }}>
                    참가 등록은 오픈과 동시에 시작됩니다
                  </p>
                ) : (
                  <p className="text-[13px] font-bold" style={{ color: "var(--gn-cream-dim)" }}>
                    이번 레이스는 종료되었습니다
                  </p>
                )}
              </div>

              {/* ── 우: 유니폼 스틸 — 커버 오브젝트. 사진 등장은 히어로 1회뿐 ── */}
              <div className="relative mt-1 lg:mt-0">
                <span
                  aria-hidden
                  className="gn-num pointer-events-none absolute -top-6 right-0 leading-none font-bold select-none"
                  style={{ fontSize: "clamp(96px, 10vw, 140px)", color: "rgba(245,239,231,.07)" }}
                >
                  14
                </span>
                <div
                  className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-[14px]"
                  style={{
                    border: "1px solid var(--gn-night-line)",
                    aspectRatio: "4 / 5",
                    boxShadow: "0 24px 60px -24px rgba(0,0,0,.65)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/season/event-banner-henry.webp"
                    alt="티에리 앙리 친필 사인 14번 유니폼"
                    className="h-full w-full object-cover"
                    style={{ objectPosition: "50% 32%" }}
                    loading="eager"
                  />
                  <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(to top, rgba(9,8,11,.78) 0%, rgba(9,8,11,.12) 34%, rgba(9,8,11,0) 55%)",
                    }}
                  />
                  {/* 박물관 플레이트 캡션 — 가짜 손글씨(Nanum Pen) 금지, 사인은 사진 속에만 */}
                  <p
                    className="absolute inset-x-0 bottom-0 z-[1] px-4 pb-3.5 text-center text-[10.5px] font-bold"
                    style={{ color: "rgba(245,239,231,.85)", letterSpacing: "0.14em" }}
                  >
                    THIERRY HENRY · No.14 · 친필 사인 — 정품 확인서 포함
                  </p>
                </div>
              </div>
            </div>

            {/* ── 다크 존 하단 스탯 스트립 (실시간 공개 항목만, 0 비노출) ── */}
            <div
              className="relative flex flex-wrap items-center gap-x-8 gap-y-1 rounded-t-[12px] px-5 py-3.5 pl-[64px] sm:pl-[110px]"
              style={{
                background: "rgba(255,255,255,.05)",
                borderTop: "1px solid var(--gn-night-line)",
              }}
            >
              {previewTotalRegs > 0 && (
                <span className="text-[13px] font-bold" style={{ color: "var(--gn-cream-dim)" }}>
                  참가 구너{" "}
                  <b className="gn-num text-[17px]" style={{ color: "var(--gn-cream)" }}>
                    {previewTotalRegs.toLocaleString()}
                  </b>
                </span>
              )}
              {previewSlipCount > 0 && (
                <span className="text-[13px] font-bold" style={{ color: "var(--gn-cream-dim)" }}>
                  누적 예측{" "}
                  <b className="gn-num text-[17px]" style={{ color: "var(--gn-cream)" }}>
                    {previewSlipCount.toLocaleString()}
                  </b>
                </span>
              )}
              <span className="text-[13px] font-bold" style={{ color: "var(--gn-cream-dim)" }}>
                레이스 기간{" "}
                <b style={{ color: "var(--gn-cream)" }}>
                  {fmtDate(event.start_at)} ~ {fmtDate(event.end_at)}
                </b>
              </span>
              {!isDraft && (
                <span className="text-[13px] font-bold" style={{ color: "var(--gn-cream-dim)" }}>
                  참가 등록{" "}
                  <b style={{ color: "var(--gn-cream)" }}>
                    ~{fmtDate(event.registration_closes_at)}
                  </b>
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ══ 라이트 존 ══ */}
      <main className="mx-auto w-full max-w-[1080px] px-4 pt-9 sm:px-6">
        {/* 참가 방법 3단계 */}
        <section>
          <div className="mb-[24px] text-center">
            <div className="wc-sec-eb" style={{ marginBottom: 8 }}>
              How it works
            </div>
            <h2
              className="text-[24px] font-extrabold sm:text-[28px]"
              style={{ letterSpacing: "-.03em" }}
            >
              참가 방법
            </h2>
          </div>
          <div className="grid w-full gap-[18px] text-left sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.num} className="wc-step-card">
                <div className="wc-step-num">{s.num}</div>
                <div
                  className="mb-[9px] text-[18px] font-extrabold"
                  style={{ letterSpacing: "-.02em" }}
                >
                  {s.title}
                </div>
                <p className="text-[14.5px]" style={{ lineHeight: 1.62, color: "var(--wc-ink-2)" }}>
                  {s.body}
                </p>
              </div>
            ))}
          </div>
          {/* 타팀 팬 — 자기선언 허용, 카피로 뒤집기 (구너 검수 §2) */}
          <p
            className="mt-4 text-center text-[13px]"
            style={{ color: "var(--wc-mute)", wordBreak: "keep-all" }}
          >
            타팀 팬도 참가할 수 있습니다. 다만 6주 뒤에도 타팀 팬일 수 있을지는 보장 못 합니다.
          </p>
          {!isDraft && !isClosed && (
            <div className="mt-7 text-center">
              <RaceJoinButton signedIn={!!userId} registrationOpen={registrationOpen} />
            </div>
          )}
        </section>

        {/* 순위 규칙 — 전 리그 프레이밍 + 공정성 (신뢰 장치) */}
        <section className="mt-12">
          <div className="mb-[18px] text-center">
            <div className="wc-sec-eb" style={{ marginBottom: 8 }}>
              Ranking
            </div>
            <h2
              className="text-[24px] font-extrabold sm:text-[28px]"
              style={{ letterSpacing: "-.03em", wordBreak: "keep-all" }}
            >
              왜 전 리그인가
            </h2>
            <p
              className="mx-auto mt-[10px] max-w-[620px] text-[14.5px]"
              style={{ color: "var(--wc-mute)", lineHeight: 1.65, wordBreak: "keep-all" }}
            >
              리그는 우리 38경기로 끝나지 않습니다. 시티가 미끄러지는 밤, 토트넘이 무너지는 오후 —
              남의 경기를 읽는 눈이 진짜 축구 보는 눈입니다. 그래서 레이스는 전 리그입니다.
            </p>
          </div>
          <div
            className="rounded-xl"
            style={{
              background: "var(--wc-wine-tint)",
              border: "1px solid rgba(150,30,55,.2)",
              padding: "18px 20px",
            }}
          >
            <ul
              className="flex flex-col gap-2.5 text-[14px]"
              style={{ lineHeight: 1.65, color: "var(--wc-ink-2)", wordBreak: "keep-all" }}
            >
              <li>
                <b style={{ color: "var(--wc-burgundy)" }}>
                  많이 찍는다고 올라가지 않습니다. 잘 찍어야 올라갑니다.
                </b>{" "}
                순위는 net 손익 — 적중하면 stake×(배당−1)을 얻고, 빗나가면 stake 를 잃습니다.
              </li>
              <li>
                <b style={{ color: "var(--wc-burgundy)" }}>아스날 경기 보너스는 없습니다.</b> 배점은
                전 경기 동일합니다. 어차피 심장으로 찍을 거잖아요.
              </li>
              <li>
                기간 내 <b>축구 승부예측 전부</b>가 자동 집계됩니다 — 따로 응모하거나 등록할 픽이
                없습니다.
              </li>
              <li>
                TOP 5와 내 순위는 <b>상시 공개</b>됩니다. 역전은 마지막 주에도 일어날 수 있어요.
              </li>
            </ul>
          </div>
        </section>

        {/* 아스날 소식 — 신청 전에도 읽을거리 먼저 (막다른 골목 금지) */}
        {arsenalNews.length > 0 && (
          <section className="mt-12">
            <div className="mb-[18px] text-center">
              <div className="wc-sec-eb" style={{ marginBottom: 8 }}>
                Arsenal news
              </div>
              <h2
                className="text-[24px] font-extrabold sm:text-[28px]"
                style={{ letterSpacing: "-.03em" }}
              >
                아스날 소식
              </h2>
            </div>
            <div
              className="overflow-hidden rounded-xl"
              style={{ border: "1px solid var(--wc-line)", background: "#fff" }}
            >
              {arsenalNews.map((n, i) => (
                <Link
                  key={n.id}
                  href={`/post/${n.id}?ref=event`}
                  className="flex items-baseline justify-between gap-3 px-5 py-3.5 hover:underline"
                  style={{ borderTop: i > 0 ? "1px solid var(--wc-line)" : "none" }}
                >
                  <span
                    className="min-w-0 truncate text-[14px] font-semibold"
                    style={{ color: "var(--wc-ink)" }}
                  >
                    📰 {n.title}
                  </span>
                  <span className="shrink-0 text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
                    {formatRelativeTime(new Date(n.created_at))}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 유의사항 */}
        <section className="mt-12 pb-14">
          <div className="wc-panel">
            <h3
              className="mb-[14px] text-[15.5px] font-extrabold"
              style={{ color: "var(--wc-mute)" }}
            >
              유의사항
            </h3>
            <ul
              className="flex flex-col gap-2"
              style={{ listStyle: "none", margin: 0, padding: 0 }}
            >
              {NOTICES.map((n) => (
                <li
                  key={n}
                  className="flex gap-2 text-[13px]"
                  style={{ lineHeight: 1.6, color: "var(--wc-mute-2)", wordBreak: "keep-all" }}
                >
                  <span style={{ flexShrink: 0 }}>·</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  )
}
