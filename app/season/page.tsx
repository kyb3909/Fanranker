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
  title: "구너스 레이스 — 앙리의 14번, 주인은 한 명",
  description:
    "티에리 앙리가 사인한 14번 유니폼 한 장. 8월 22일부터 9월 30일까지, 전 리그 예측으로 겨루는 구너들의 레이스.",
  alternates: { canonical: "/season" },
  openGraph: {
    title: "구너스 레이스 | gongnori.fan",
    description:
      "리그는 38경기가 아니라 380경기다. 앙리의 14번을 건 구너들의 레이스, 8월 22일 시작.",
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
    title: "참가 버튼을 누른다",
    body: "그게 전부입니다. 고를 팀도, 적을 것도 없습니다.",
  },
  {
    num: "02",
    title: "하던 대로 예측한다",
    body: "참가한 다음부터 9월 30일까지 한 축구 예측이 그대로 점수가 됩니다. 매일 받는 무료 볼만 써도 됩니다.",
  },
  {
    num: "03",
    title: "순위는 매일 열려 있다",
    body: "내 등수와 상위 5명은 언제든 볼 수 있습니다. 마지막 날까지 뒤집힙니다.",
  },
] as const

/**
 * 이벤트 규칙 — 6항목 고정 (참가 자격 / 점수 계산 / 순위 결정 / 상품 지급 /
 * 제외·부정행위 / 기간·집계 대상). 기획 검수(workspace/copy-planner-20260814.md §2)의
 * 구조를 따른다.
 *
 * ⚠️ 원칙: **코드가 하는 일만 쓴다.** 각 줄의 근거는 아래 주석의 파일:동작.
 * 문장을 고칠 때는 근거부터 확인할 것 — 구현 안 된 걸 약속하면 그게 최악의 버그다.
 *   · 신청 이후 예측만 집계        lib/event/gunners-season.ts (registered_at 컷)
 *   · net 손익 / 동점 4단계         같은 파일 sort 체인
 *   · 축구만 · 지난 대회 배제       같은 파일 sport='축구' + event_id 필터
 *   · 볼 1~10 · 구매 불가           app/api/betman/prediction (zod max 10), reset_user_daily_tokens (일 10)
 *   · 취소 경기 처리                lib/betman/settle.ts (전부 취소=환불 / 일부 취소=배당 재계산)
 *   · 참가 상시                     events.registration_closes_at = end_at (2026-08-14 운영자 확정)
 */
const RULES: { title: string; lines: string[] }[] = [
  {
    title: "참가 자격",
    lines: [
      "로그인한 뒤 이 페이지의 참가 버튼을 한 번 누르면 참가가 끝납니다. 팀을 고르거나 따로 적을 것은 없습니다.",
      "참가 접수는 9월 30일까지 언제든 열려 있습니다. 마감일은 따로 두지 않습니다.",
      "계정당 한 번만 참가할 수 있고, 참가 취소와 재등록은 되지 않습니다.",
      "운영진과 운영 봇 계정은 상품 대상에서 빠집니다.",
    ],
  },
  {
    title: "점수 계산",
    lines: [
      "참가한 다음에 한 축구 예측만 점수가 됩니다. 참가 전에 한 예측은 들어가지 않습니다.",
      "맞히면 사용한 볼에 배당이 붙어 점수가 오르고, 틀리면 사용한 볼만큼 내려갑니다. 10볼로 배당 2.5짜리 예측을 했다면 맞을 때 +15점, 틀릴 때 −10점입니다.",
      "정산이 끝난 예측만 점수가 됩니다. 정산 전에는 0점으로 두고 정산되는 시점에 반영합니다.",
      "예측한 경기가 전부 취소되면 볼을 전액 돌려드리고 점수는 그대로입니다. 일부만 취소되면 그 경기를 빼고 배당을 다시 계산해 판정합니다.",
      "볼은 매일 10개까지 무료로 충전되고 살 수 없습니다. 하루에 올릴 수 있는 점수의 상한이 모두에게 같다는 뜻입니다.",
      "리그별 가중치도, 아스날 경기 보너스도 없습니다.",
    ],
  },
  {
    title: "순위 결정",
    lines: [
      "점수가 높은 순입니다. 상위 5명과 내 순위는 기간 내내 볼 수 있습니다.",
      "동점이면 적중한 예측이 많은 쪽이 위입니다. 그것도 같으면 더 적은 예측으로 같은 점수를 만든 쪽, 셋 다 같으면 계정 식별자 순으로 정합니다. 무작위 추첨이 아닙니다.",
      "참가만 하고 예측을 하지 않아도 0점으로 순위표에 올라갑니다.",
      "점수는 소수점까지 계산하고 화면에는 반올림해 보여줍니다.",
      "지난 대회(2026 월드컵 등)의 예측 기록은 이번 집계에 들어가지 않습니다.",
    ],
  },
  {
    title: "상품 지급",
    lines: [
      "앙리의 14번(티에리 앙리 친필 사인 유니폼) 한 장을 최종 1위 한 명에게 보냅니다. 정품 인증서가 함께 갑니다. 사이즈와 시즌 사양은 별도 공지에 적습니다.",
      "9월 30일 23시 59분(KST)까지 한 예측이 대상입니다. 그 시점에 정산이 남아 있으면 남은 정산이 끝난 뒤 최종 순위를 확정하고 따로 공지합니다.",
      "상품 가액이 5만원을 넘어 제세공과금 22%가 발생하며, 주최 측이 부담합니다.",
      "수령을 위해 이름·연락처·주소를 받고 상품 발송과 세무 신고에만 씁니다.",
      "상품은 현금이나 다른 물품으로 바꿔 드리지 않습니다. 만 19세 미만은 법정대리인 동의가 있어야 받을 수 있습니다.",
    ],
  },
  {
    title: "제외 및 부정행위",
    lines: [
      "한 사람이 계정을 둘 이상 쓰거나, 참가자끼리 짜고 예측하거나, 자동화 도구를 쓰거나, 남의 계정을 쓰면 순위에서 뺍니다.",
      "어뷰징으로 판단되면 관련된 계정을 전부 뺍니다.",
      "제외 여부는 운영자가 최종 판단하고, 근거는 요청하시면 개별로 안내합니다.",
    ],
  },
  {
    title: "기간과 집계 대상",
    lines: [
      "레이스 기간은 2026년 8월 22일 00시부터 9월 30일 23시 59분까지입니다 (KST).",
      "집계 대상은 축구 예측입니다. 야구·농구·배구는 점수에 들어가지 않습니다.",
      "예측은 경기 시작 전까지 할 수 있습니다.",
    ],
  },
]

/**
 * 추첨 보조 상품 — 실제로 도는 cron 두 개를 그대로 옮긴 것.
 * app/api/cron/season-chicken-draw (매일 23:10 KST),
 * app/api/cron/season-weekly-draw-snapshot (매주 월 00:05 KST, 5명).
 * ⚠️ cron 을 내리면 이 블록도 같이 내릴 것 — 봇이 자유게시판에 당첨자를 발표하므로
 *    화면에서만 지우면 규칙 없는 경품이 나가고, 화면에만 남기면 없는 경품을 약속한다.
 */
const DRAWS: { title: string; lines: string[] }[] = [
  {
    title: "매일 밤 치킨",
    lines: [
      "참가자 중 그날(전날 23시 ~ 당일 23시, KST) 열 자 이상 댓글을 하나라도 쓴 사람이 자동 응모됩니다.",
      "댓글을 몇 개 쓰든 한 사람당 한 표입니다. 매일 밤 11시 10분에 한 명을 뽑습니다.",
      "당첨자는 자유게시판 발표 글로 알리고, 기프티콘은 운영자가 개별 연락으로 전달합니다.",
    ],
  },
  {
    title: "매주 스팀 기프트카드",
    lines: [
      "참가자 중 이벤트 활동 포인트 30점 이상, 글·댓글 3회 이상이면 자동 응모됩니다.",
      "매주 월요일 0시 5분에 다섯 명을 뽑아 자유게시판에 발표합니다. 한 사람당 한 표입니다.",
      "예측 성적과는 무관합니다. 순위가 낮아도 자격만 채우면 응모됩니다.",
    ],
  },
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
              {fmtDate(event.start_at)} ~ {fmtDate(event.end_at)}
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

          {/* 이벤트 전용 결과 페이지로 — 마이페이지(전 종목·전 기간)와 다른 지면이다 */}
          <div className="flex justify-end">
            <Link
              href="/season/results?ref=event"
              className="text-[13px] font-bold"
              style={{ color: "var(--wc-burgundy)" }}
            >
              내 예측 결과 보기 →
            </Link>
          </div>

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
              오늘 경기 예측하러 가기
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
              이번 아스날 경기
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
                다음 아스날 경기는 일정 나오는 대로 올립니다.
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
                    {n.title}
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* ④ 지금 뜨는 글 — 허브가 막다른 골목이 되지 않게 (핵심 전환 루프) */}
          <section className="rounded-xl p-4" style={cardStyle}>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                지금 읽히는 글
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
                  8.22 개막 · 구너들의 전 리그 레이스
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

                {/* 히어로의 명제는 하나. "심장/눈"은 배점 규칙 옆(순위 규칙 섹션)이 제자리다
                    — 둘을 붙여 두면 서로 잡아먹는다 (카피 검수 §2-1) */}
                <p
                  className="mb-6 text-[16px] font-extrabold"
                  style={{ color: "var(--gn-cream)", wordBreak: "keep-all" }}
                >
                  리그는 38경기가 아니라 380경기다
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
                    티에리 앙리가 직접 사인한 유니폼. 한 장뿐입니다.
                  </p>
                  <p
                    className="mt-1 text-[12.5px]"
                    style={{ color: "var(--gn-cream-dim)", wordBreak: "keep-all" }}
                  >
                    9월 30일, 순위표 맨 위에 있는 사람에게 갑니다. 정품 인증서 동봉.
                  </p>
                </div>

                <div className="mb-6 flex flex-wrap items-center gap-3">
                  <HeroCountdown
                    target={started && !isClosed ? event.end_at : event.start_at}
                    label={started && !isClosed ? "레이스 종료까지" : "개막까지"}
                  />
                </div>

                {!isDraft && !isClosed ? (
                  <RaceJoinButton registrationOpen={registrationOpen} />
                ) : isDraft ? (
                  <p className="text-[13px] font-bold" style={{ color: "var(--gn-cream-dim)" }}>
                    참가 등록은 오픈과 동시에 시작됩니다
                  </p>
                ) : (
                  <p className="text-[13px] font-bold" style={{ color: "var(--gn-cream-dim)" }}>
                    이번 레이스는 끝났습니다
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
                    THIERRY HENRY · No.14 · SIGNED
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
              {/* 접수 마감일을 따로 두지 않는다(운영자 확정 2026-08-14 — DB
                  registration_closes_at = end_at). 마감 날짜를 적으면 기간과 두 줄이
                  되어 "언제까지 신청?"을 다시 묻게 만든다 */}
              {!isDraft && (
                <span className="text-[13px] font-bold" style={{ color: "var(--gn-cream-dim)" }}>
                  참가 접수 <b style={{ color: "var(--gn-cream)" }}>기간 내 상시</b>
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
              JOIN
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
            타팀 팬도 참가할 수 있습니다. 다만 9월 30일에도 타팀 팬일지는 보장 못 합니다.
          </p>
          {!isDraft && !isClosed && (
            <div className="mt-7 text-center">
              <RaceJoinButton registrationOpen={registrationOpen} />
            </div>
          )}
        </section>

        {/* 순위 규칙 — 전 리그 프레이밍 + 공정성 (신뢰 장치) */}
        <section className="mt-12">
          <div className="mb-[18px] text-center">
            <div className="wc-sec-eb" style={{ marginBottom: 8 }}>
              SCORING
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
              아스날 38경기만 봐서는 아스날 시즌을 모릅니다. 시티가 어디서 미끄러지는지, 토트넘이
              어디서 무너지는지 구너는 원래 다 보고 있습니다. 그걸 점수로 만들었을 뿐입니다.
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
              {/* 수식(stake×(배당−1))을 숫자 예시로 바꿨다 — 오해가 가장 비싼 자리인데
                  수식이 나오는 순간 아무도 안 읽는다 (카피 검수 §2-4) */}
              <li>
                <b style={{ color: "var(--wc-burgundy)" }}>딴 만큼 오르고, 잃은 만큼 내려갑니다.</b>{" "}
                맞히면 사용한 볼에 배당이 붙어 점수가 오릅니다. 틀리면 사용한 볼만큼 내려갑니다.
                10볼로 배당 2.5짜리 예측을 했다면 맞을 때 +15점, 틀릴 때 −10점. 많이 예측한다고
                오르지 않는 이유입니다.
              </li>
              <li>
                <b style={{ color: "var(--wc-burgundy)" }}>아스날은 심장으로, 나머지는 눈으로.</b>{" "}
                아스날 경기라고 점수를 더 주지 않습니다. 전 경기 배점이 같습니다. 어차피 심장으로
                찍으실 텐데요.
              </li>
              <li>
                <b>따로 응모할 건 없습니다.</b> 참가한 다음부터 9월 30일까지 한 축구 예측이 순위에
                들어갑니다. 정산이 끝난 예측만 점수가 됩니다.
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
                    {n.title}
                  </span>
                  <span className="shrink-0 text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
                    {formatRelativeTime(new Date(n.created_at))}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 추첨 상품 — 앙리의 14번과 **다른 구역**이다 (경품 표 혼합 금지).
            유니폼은 히어로 단독 무대, 여기는 순위와 무관한 추첨. 실제로 cron 두 개가
            매일·매주 돌면서 봇이 자유게시판에 당첨자를 발표하므로 규칙이 화면에 있어야 한다. */}
        <section className="mt-12">
          <div className="mb-[18px] text-center">
            <div className="wc-sec-eb" style={{ marginBottom: 8 }}>
              DRAWS
            </div>
            <h2
              className="text-[24px] font-extrabold sm:text-[28px]"
              style={{ letterSpacing: "-.03em", wordBreak: "keep-all" }}
            >
              순위와 별개로 도는 추첨
            </h2>
            <p
              className="mx-auto mt-[10px] max-w-[620px] text-[14.5px]"
              style={{ color: "var(--wc-mute)", lineHeight: 1.65, wordBreak: "keep-all" }}
            >
              레이스와 따로 매일 밤과 매주 월요일에 추첨이 있습니다. 앙리의 14번은 여기 포함되지
              않습니다.
            </p>
          </div>
          <div className="grid gap-[18px] sm:grid-cols-2">
            {DRAWS.map((d) => (
              <div key={d.title} className="rounded-xl p-4" style={cardStyle}>
                <h3 className="text-[15.5px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                  {d.title}
                </h3>
                <ul
                  className="mt-2.5 flex flex-col gap-1.5"
                  style={{ listStyle: "none", margin: 0, padding: 0 }}
                >
                  {d.lines.map((l) => (
                    <li
                      key={l}
                      className="flex gap-2 text-[13.5px]"
                      style={{ lineHeight: 1.62, color: "var(--wc-ink-2)", wordBreak: "keep-all" }}
                    >
                      <span style={{ flexShrink: 0 }}>·</span>
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* 이벤트 규칙 — 6항목 고정 */}
        <section className="mt-12 pb-14">
          <div className="wc-panel">
            <h3
              className="mb-[14px] text-[15.5px] font-extrabold"
              style={{ color: "var(--wc-mute)" }}
            >
              이벤트 규칙
            </h3>
            <div className="flex flex-col gap-[18px]">
              {RULES.map((r) => (
                <div key={r.title}>
                  <p
                    className="mb-1.5 text-[13.5px] font-extrabold"
                    style={{ color: "var(--wc-ink-2)" }}
                  >
                    {r.title}
                  </p>
                  <ul
                    className="flex flex-col gap-1.5"
                    style={{ listStyle: "none", margin: 0, padding: 0 }}
                  >
                    {r.lines.map((l) => (
                      <li
                        key={l}
                        className="flex gap-2 text-[13px]"
                        style={{
                          lineHeight: 1.6,
                          color: "var(--wc-mute-2)",
                          wordBreak: "keep-all",
                        }}
                      >
                        <span style={{ flexShrink: 0 }}>·</span>
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
