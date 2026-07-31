import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { ArrowRight } from "lucide-react"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { HeroCountdown } from "@/components/season/hero-countdown"
import { TeamPicker, type SeasonGroup } from "@/components/season/team-picker"

export const metadata: Metadata = {
  title: "시즌 오픈 팬덤 대항전",
  description:
    "리버풀 vs 첼시 vs 아스날 — 시즌 개막 4주, 팬덤의 자존심을 건 승부예측 대항전. 활동하면 유니폼·치킨 추첨 자격이 생깁니다.",
  alternates: { canonical: "/season" },
  openGraph: {
    title: "시즌 오픈 팬덤 대항전 | gongnori.fan",
    description: "내 팀을 골라 참가하고, 예측으로 팬덤의 자존심을 지켜라.",
    url: "/season",
  },
}

// 참가자 카운트 즉시 반영
export const dynamic = "force-dynamic"

const EVENT_SLUG = "season-open-2026"

/** 구단 크레스트 (Wikimedia 공식 원본 래스터) — 운영 판단으로 표시 (2026-07-31) */
const CRESTS: Record<string, string> = {
  kop: "/season/crest-liverpool.png",
  blues: "/season/crest-chelsea.png",
  gooner: "/season/crest-arsenal.png",
}

/**
 * 히어로 크레스트 광학 보정 [기본px, lg px] — 같은 박스여도 원형(첼시)은 면적이 꽉 차
 * 방패형보다 커 보이고 옆 패널을 침범해 보인다. 원형만 한 단계 줄인다.
 */
const CREST_HERO_PX: Record<string, [number, number]> = {
  kop: [92, 112],
  blues: [74, 90],
  gooner: [88, 106],
}

/** 어그로체 디스플레이 — 매치데이 밴드와 동일 (이미 Bold 라 font-weight 얹지 말 것) */
const DISPLAY = "var(--font-display-ko), var(--font-title)"

/**
 * 시즌 오픈 이벤트 랜딩 — 디자인 시안 A "홈 문법 그대로" (2026-07-31 승인,
 * ~/.gstack/.../season-redesign-20260731/approved.json).
 * 히어로 = 매치데이 밴드 문법(다크 선언 존 + 스큐 버건디 플레이트 + 세로 라벨 +
 * 어그로체 대형 타이포 + 3색 팀 패널 콜라주), 본문 = 라이트 페이퍼 존 흰 카드.
 * 기억점: "팬덤 전쟁의 긴장감". 구단 엠블럼은 라이선스 문제로 쓰지 않는다 —
 * 팀 컬러 패널 + 팬덤명 타이포로 대결 구도를 만든다.
 *
 * 공개 정책 (설계 §3): 참가자 수·누적 예측 수는 실시간, 팀 순위·평균 성적은 주 1회만.
 * 컴플라이언스 (약관 제6조의2): 경품은 활동 포인트 기준 "추첨" — 순위 직결 확정 지급 아님.
 */

const STEPS = [
  {
    num: "01",
    title: "팀 선택 참가",
    body: "리버풀·첼시·아스날 중 내 팀을 고르면 끝. 다른 팀 팬도 셋 중 하나를 골라 참전할 수 있어요. 이벤트 중 팀 변경은 불가.",
  },
  {
    num: "02",
    title: "매일 예측 + 활동",
    body: "매일 충전되는 무료 볼 10개로 경기를 예측하고, 매치데이 글에 댓글을 남겨보세요. 활동이 곧 추첨 응모권입니다.",
  },
  {
    num: "03",
    title: "팬덤 순위 발표",
    body: "팀 순위는 매주 월요일에 공개됩니다. 4주 뒤 승리 팬덤에게는 미스터리 상품이 걸려 있어요.",
  },
] as const

const PRIZES = [
  ["유니폼", "이번 시즌 유니폼 (선택한 팀 것)", "5명", "활동 포인트 달성자 중 추첨"],
  ["스팀 기프트카드", "5만원권", "10명", "활동 포인트 달성자 중 추첨"],
  [
    "데일리 치킨",
    "매일 밤 11시, 그날 댓글 쓴 사람 중 추첨",
    "매일 1명",
    "그날 댓글 1개 이상 = 응모권 1장",
  ],
  ["미스터리 상품", "2주차에 공개", "1명", "승리 팬덤의 예측 상위 20명 중 추첨"],
  ["한정 호칭 '창단 멤버'", "프로필에 영구 표시", "전원", "응모 기준 달성자 전원"],
] as const

const NOTICES = [
  "경품은 이벤트 기간 내 활동 포인트 기준으로 추첨하며, 예측 성적 순위에 따라 확정 지급되지 않습니다.",
  "예측만으로는 응모할 수 없습니다 — 커뮤니티 활동(댓글·글)이 최소 3회 필요합니다.",
  "한 번 선택한 팀은 이벤트 종료까지 변경할 수 없습니다.",
  "이벤트 기간 중 삭제된 글·댓글의 포인트는 회수되며, 무성의한 도배는 검수 후 당첨이 취소될 수 있습니다.",
  "다계정 참여가 확인되면 모든 계정이 실격됩니다.",
  "5만원 초과 경품 당첨자는 수령 시 신원·배송 정보를 수집하며(제세공과금 처리), 미성년자는 법정대리인 동의가 필요합니다.",
  "포인트 수치·응모 기준점은 이벤트 오픈 시 확정 공지됩니다.",
]

export default async function SeasonEventPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  // 운영자 미리보기 (?preview=1) — draft 상태에서 오픈된 모습 확인. 등록 API 는
  // 여전히 draft 를 거부하므로 실제 참가는 불가. 표본 숫자는 리본으로 명시.
  const params = await searchParams
  const preview = params.preview === "1"

  const supabase = createServiceRoleClient()

  const { data: event } = await supabase
    .from("events")
    .select("id, name, description, status, start_at, end_at, registration_closes_at")
    .eq("slug", EVENT_SLUG)
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

  const { data: groups } = await supabase
    .from("event_groups")
    .select("id, slug, name, club_kor, color, motto, sort_order")
    .eq("event_id", event.id)
    .order("sort_order", { ascending: true })

  // 팀별 참가자 수 — 실시간 공개 항목 (순위·성적은 주 1회)
  const { data: regs } = await supabase
    .from("event_registrations")
    .select("group_id")
    .eq("event_id", event.id)
  const countByGroup = new Map<string, number>()
  for (const r of regs ?? []) {
    countByGroup.set(r.group_id, (countByGroup.get(r.group_id) ?? 0) + 1)
  }
  const totalRegs = (regs ?? []).length

  // 이벤트 슬립 누적 수 — 실시간 공개 항목
  const { count: slipCount } = await supabase
    .from("prediction_slips")
    .select("*", { count: "exact", head: true })
    .eq("event_id", event.id)

  const user = await currentUser()
  let myGroupSlug: string | null = null
  if (user) {
    const { data: myReg } = await supabase
      .from("event_registrations")
      .select("group_id")
      .eq("event_id", event.id)
      .eq("user_id", user.id)
      .maybeSingle()
    if (myReg) {
      myGroupSlug = (groups ?? []).find((g) => g.id === myReg.group_id)?.slug ?? null
    }
  }

  // 미리보기 표본 숫자 — 실데이터가 있으면 실데이터 우선
  const previewCounts: Record<string, number> = { kop: 138, blues: 121, gooner: 147 }

  const pickerGroups: SeasonGroup[] = (groups ?? []).map((g) => ({
    slug: g.slug,
    name: g.name,
    club_kor: g.club_kor,
    color: g.color,
    motto: g.motto ?? "",
    crest: CRESTS[g.slug] ?? null,
    regCount:
      (countByGroup.get(g.id) ?? 0) > 0
        ? (countByGroup.get(g.id) ?? 0)
        : preview
          ? (previewCounts[g.slug] ?? 0)
          : 0,
  }))
  const previewTotalRegs =
    preview && totalRegs === 0 ? Object.values(previewCounts).reduce((a, b) => a + b, 0) : totalRegs
  const previewSlipCount = preview && (slipCount ?? 0) === 0 ? 2431 : (slipCount ?? 0)

  const isDraft = event.status === "draft" && !preview
  const isClosed = event.status === "closed"
  const registrationOpen =
    !isDraft && !isClosed && new Date(event.registration_closes_at) > new Date()

  const msToStart = preview ? -1 : new Date(event.start_at).getTime() - Date.now()
  const started = msToStart <= 0

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("ko-KR", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      timeZone: "Asia/Seoul",
    })

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

      {/* ══ 다크 히어로 — 매치데이 밴드 문법 (선언 영역이라 다크 허용) ══ */}
      <section className="gn-band" aria-label="시즌 오픈 팬덤 대항전">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <div
            className="relative overflow-hidden rounded-b-[16px]"
            style={{
              // 생성 애셋: 버건디 스플래터 + 군중 실루엣 그런지 (2026-07-31, 시안 A 질감)
              backgroundImage:
                "linear-gradient(rgba(22,20,26,.42), rgba(22,20,26,.58)), url(/season/hero-bg.webp)",
              backgroundSize: "cover",
              backgroundPosition: "center bottom",
            }}
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
                SEASON OPEN
              </span>
            </div>

            <div className="relative grid gap-8 py-9 pl-[64px] sm:py-12 sm:pl-[110px] lg:grid-cols-[1.05fr_.95fr] lg:gap-4">
              {/* ── 좌: 선언 ── */}
              <div>
                <p
                  className="mb-3 flex items-center gap-2.5 text-[12.5px] font-extrabold"
                  style={{ color: "var(--gn-bg-100)", letterSpacing: "0.14em" }}
                >
                  시즌의 시작, 팬덤의 자존심을 걸어라
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
                  }}
                >
                  <span style={{ color: "var(--gn-cream)" }}>시즌 오픈</span>
                  <br />
                  <span style={{ color: "#e0475f" }}>팬덤 대항전</span>
                </h1>

                <p
                  className="mb-6 flex items-center gap-3 text-[14.5px] font-bold"
                  style={{ color: "var(--gn-cream-dim)", wordBreak: "keep-all" }}
                >
                  <span
                    aria-hidden
                    className="h-px w-8"
                    style={{ background: "var(--gn-night-line)" }}
                  />
                  어느 팬덤으로 싸울 건가요
                  <span
                    aria-hidden
                    className="h-px w-8"
                    style={{ background: "var(--gn-night-line)" }}
                  />
                </p>

                <div className="mb-6 flex flex-wrap items-center gap-3">
                  <HeroCountdown
                    target={started && !isClosed ? event.end_at : event.start_at}
                    label={started && !isClosed ? "대항전 종료까지" : "개막까지"}
                  />
                  <span
                    className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-3 text-[12.5px] font-bold"
                    style={{
                      background: "rgba(255,255,255,.06)",
                      border: "1px solid var(--gn-night-line)",
                      color: "var(--gn-cream-dim)",
                      wordBreak: "keep-all",
                    }}
                  >
                    팀 순위는 <b style={{ color: "var(--gn-cream)" }}>매주 월요일</b> 발표
                  </span>
                </div>

                {!isDraft && !isClosed && (
                  <Link
                    href="/prediction"
                    className="inline-flex items-center gap-2 rounded-[12px] px-6 py-3.5 text-[15.5px] font-extrabold transition-transform active:scale-[.98]"
                    style={{
                      background: "linear-gradient(100deg, var(--wc-burgundy), var(--gn-bg-700))",
                      color: "var(--gn-cream)",
                      boxShadow: "0 12px 30px -12px rgba(150,30,55,.7)",
                    }}
                  >
                    오늘 경기 예측하러 가기 <ArrowRight className="h-[17px] w-[17px]" aria-hidden />
                  </Link>
                )}
                {isDraft && (
                  <p className="text-[13px] font-bold" style={{ color: "var(--gn-cream-dim)" }}>
                    참가 등록은 오픈과 동시에 시작됩니다
                  </p>
                )}
              </div>

              {/* ── 우: 3색 깃발 콜라주 (생성 애셋 — 엠블럼 없이 컬러·군중·깃발로
                  대결 구도, 팬덤명 타이포는 HTML 오버레이) ── */}
              <div
                aria-hidden
                className="relative mt-1 min-h-[190px] overflow-hidden rounded-[14px] lg:mt-0 lg:min-h-[300px]"
                style={{ border: "1px solid var(--gn-night-line)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/season/hero-collage.webp"
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="eager"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(9,8,11,.72) 0%, rgba(9,8,11,.12) 45%, rgba(9,8,11,0) 70%)",
                  }}
                />
                <div className="absolute inset-0 grid grid-cols-3 items-center pt-2 pb-3.5">
                  {pickerGroups.map((g) => (
                    <div key={g.slug} className="flex h-full flex-col items-center justify-between">
                      <div className="flex flex-1 items-center">
                        {CRESTS[g.slug] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={CRESTS[g.slug]}
                            alt=""
                            className="object-contain"
                            style={{
                              height: `clamp(${CREST_HERO_PX[g.slug]?.[0] ?? 92}px, 9vw, ${CREST_HERO_PX[g.slug]?.[1] ?? 112}px)`,
                              width: `clamp(${CREST_HERO_PX[g.slug]?.[0] ?? 92}px, 9vw, ${CREST_HERO_PX[g.slug]?.[1] ?? 112}px)`,
                              filter: "drop-shadow(0 6px 18px rgba(0,0,0,.6))",
                            }}
                            loading="eager"
                          />
                        )}
                      </div>
                      <div className="flex flex-col items-center gap-0.5">
                        <span
                          style={{
                            fontFamily: DISPLAY,
                            fontWeight: 700,
                            fontSize: "clamp(20px, 2vw, 28px)",
                            color: "rgba(245,239,231,.96)",
                            letterSpacing: "-0.01em",
                            textShadow: "0 2px 14px rgba(0,0,0,.75)",
                          }}
                        >
                          {g.name}
                        </span>
                        <span
                          className="text-[10.5px] font-bold"
                          style={{
                            color: "rgba(245,239,231,.72)",
                            textShadow: "0 1px 8px rgba(0,0,0,.8)",
                          }}
                        >
                          {g.club_kor}
                        </span>
                      </div>
                    </div>
                  ))}
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
                  참여 팬{" "}
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
                이벤트 기간{" "}
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
        {/* 팀 선택 */}
        <div className="mb-3 text-center">
          <p
            className="mb-1.5 text-[12px] font-extrabold"
            style={{ color: "var(--wc-burgundy)", letterSpacing: "0.18em" }}
          >
            ★ ★ ★&nbsp;&nbsp;3개 팬덤, 4주간의 승부&nbsp;&nbsp;★ ★ ★
          </p>
          <h2
            className="text-[26px] sm:text-[30px]"
            style={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--wc-ink)",
            }}
          >
            어느 팬덤으로 싸울 건가요?
          </h2>
        </div>
        <TeamPicker
          groups={pickerGroups}
          myGroupSlug={myGroupSlug}
          registrationOpen={registrationOpen}
        />

        {/* 기간·참여·보상 3열 정보 행 (시안 A 하단 문법) */}
        <div
          className="mt-4 grid gap-px overflow-hidden rounded-xl sm:grid-cols-3"
          style={{ background: "var(--wc-line)", border: "1px solid var(--wc-line)" }}
        >
          {[
            ["대항전 기간", "4주간", `${fmtDate(event.start_at)} ~ ${fmtDate(event.end_at)}`],
            ["참여 방법", "예측하고, 떠들어라", "매일 무료 볼 10개 + 매치데이 댓글이 응모권"],
            ["보상 안내", "활동하면 추첨 자격", "유니폼·스팀·매일 밤 치킨 — 예측만으론 응모 불가"],
          ].map(([k, t, d]) => (
            <div key={k} className="px-5 py-4" style={{ background: "var(--wc-card, #fff)" }}>
              <p className="mb-1 text-[11.5px] font-bold" style={{ color: "var(--wc-mute-2)" }}>
                {k}
              </p>
              <p className="text-[15px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                {t}
              </p>
              <p
                className="mt-0.5 text-[12.5px]"
                style={{ color: "var(--wc-mute)", wordBreak: "keep-all" }}
              >
                {d}
              </p>
            </div>
          ))}
        </div>

        {/* 순위 규칙 — 예측력 */}
        <section className="mt-12">
          <div className="mb-[18px] text-center">
            <div className="wc-sec-eb" style={{ marginBottom: 8 }}>
              Ranking
            </div>
            <h2
              className="text-[24px] font-extrabold sm:text-[28px]"
              style={{ letterSpacing: "-.03em" }}
            >
              순위는 &lsquo;예측력&rsquo;으로 가립니다
            </h2>
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
                <b style={{ color: "var(--wc-burgundy)" }}>어려운 경기를 맞힐수록 크게 오릅니다.</b>{" "}
                모두가 맞히는 쉬운 픽은 점수가 거의 오르지 않아요.
              </li>
              <li>
                <b style={{ color: "var(--wc-burgundy)" }}>한 방 몰아주기로는 못 올라갑니다.</b>{" "}
                대박 한 번보다 꾸준한 적중이 유리하도록 설계했습니다.
              </li>
              <li>
                정산된 예측이 <b>5회 이상</b>인 참가자만 순위에 들어갑니다 — 팀 순위도 이 참가자들의
                평균으로 계산해요.
              </li>
              <li>
                팀 순위·평균 성적은 <b>매주 월요일에만 공개</b>됩니다. 역전은 마지막 주에도 일어날
                수 있어요.
              </li>
            </ul>
          </div>
        </section>

        {/* 진행 방식 */}
        <section className="mt-12">
          <div className="mb-[24px] text-center">
            <div className="wc-sec-eb" style={{ marginBottom: 8 }}>
              How it works
            </div>
            <h2
              className="text-[24px] font-extrabold sm:text-[28px]"
              style={{ letterSpacing: "-.03em" }}
            >
              진행 방식
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
        </section>

        {/* 상품 안내 — 활동 기준 추첨 (컴플라이언스: 순위 직결 아님) */}
        <section className="mt-12">
          <div className="mb-[20px] text-center">
            <div className="wc-sec-eb" style={{ marginBottom: 8 }}>
              Prize
            </div>
            <h2
              className="text-[24px] font-extrabold sm:text-[28px]"
              style={{ letterSpacing: "-.03em" }}
            >
              상품 안내
            </h2>
            <p className="mt-[10px] text-[14.5px]" style={{ color: "var(--wc-mute)" }}>
              활동 포인트를 달성한 참가자 대상 추첨입니다. 예측만으로는 응모할 수 없어요 — 커뮤니티
              활동 3회가 필요합니다.
            </p>
          </div>
          <div
            className="w-full overflow-hidden rounded-xl text-left"
            style={{ border: "1px solid var(--wc-line)", background: "#fff" }}
          >
            {PRIZES.map(([tier, desc, n, how], i) => (
              <div
                key={tier}
                className="grid grid-cols-[96px_1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[130px_1fr_90px_1fr]"
                style={{ borderTop: i > 0 ? "1px solid var(--wc-line)" : "none" }}
              >
                <span className="text-[13.5px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                  {tier}
                </span>
                <span
                  className="text-[13px]"
                  style={{ color: "var(--wc-mute)", wordBreak: "keep-all" }}
                >
                  {desc}
                </span>
                <span
                  className="tnum text-right text-[13px] font-bold"
                  style={{ color: "var(--wc-burgundy)" }}
                >
                  {n}
                </span>
                <span
                  className="col-span-3 text-[12.5px] sm:col-span-1"
                  style={{ color: "var(--wc-mute-2)", wordBreak: "keep-all" }}
                >
                  {how}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* 유의사항 */}
        <section className="mt-12 pb-10">
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

      <div className="pb-[56px] text-center text-[13px]" style={{ color: "var(--wc-mute)" }}>
        세 팬덤의 자존심이 여기서 갈립니다 — 당신의 팀은 어디입니까
      </div>
    </div>
  )
}
