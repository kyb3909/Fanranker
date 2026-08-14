import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { ArrowRight } from "lucide-react"
import { auth } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { HeroCountdown } from "@/components/season/hero-countdown"
import { TeamPicker, type SeasonGroup } from "@/components/season/team-picker"

/**
 * /cog-event — 유튜브 채널 코그(COG) 제휴 제안용 시청자 팬덤 대결 (스탠바이).
 *
 * 화면은 시즌 오픈 대항전의 원본 디자인(2026-07-31 승인 시안 A)을 그대로 되살린 것이다:
 * 다크 선언 히어로(스큐 버건디 플레이트 + 어그로체 대형 타이포 + 팀 컬러 콜라주) +
 * 라이트 페이퍼 존 흰 카드. 달라지는 건 이벤트 사실뿐이다 — 진영 2개(첼시/리버풀),
 * 등록 API(/api/event/cog/register), 상품 구성(유니폼 + 클롭 모자 + 테리 완장).
 *
 * ⚠️ 아스날 단독 이벤트(/season, slug season-open-2026)와는 **완전히 다른 이벤트**다.
 *    lib/event/season-* 의 집계 함수는 slug 가 season-open-2026 으로 박혀 있어 여기서
 *    쓰면 남의 이벤트 숫자가 올라온다 — 그래서 이 페이지는 실측 가능한 것(진영별 참가자
 *    수)만 읽는다.
 *
 * ⚠️ 라운드 점수·팬덤 순위 집계는 **미구현이다.** 채널 합의 후 붙일 자리이므로 화면에
 *    없는 숫자를 만들어 보여주지 않는다 — "채널 공개 시점부터 집계"라고만 적는다.
 *
 * 스탠바이: 채널 합의 전이라 noindex · GNB/모바일탭/사이트맵 미노출 — 직접 URL 전용.
 * events.status = 'draft' 라 등록 API 가 400 을 돌려준다(화면이 열려 있어도 참가 불가).
 * 운영자 확인용 ?preview=1 로 오픈된 모습만 미리 볼 수 있다.
 */

export const metadata: Metadata = {
  title: "첼루키 vs 리빅 — 코그 시청자 팬덤 대결",
  description:
    "첼시 팬과 리버풀 팬이 두 진영으로 나뉘어 겨루는 승부예측 대결. 매일 무료로 받는 볼 10개로 참여합니다.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/cog-event" },
}

// 참가 여부(auth + 등록)·참가자 수가 화면을 가르므로 요청마다 판정한다
export const dynamic = "force-dynamic"

const EVENT_SLUG = "cog-duel-2026"

/** 구단 크레스트 (Wikimedia 공식 원본 래스터) — 운영 판단으로 표시 (2026-07-31) */
const CRESTS: Record<string, string> = {
  kop: "/season/crest-liverpool.png",
  blues: "/season/crest-chelsea.png",
}

/** 팀 카드 선수 포스터 (그런지 일러스트 — 특정 인물 아님, 초상권 회피) */
const PLAYERS: Record<string, string> = {
  kop: "/season/player-kop.webp",
  blues: "/season/player-blues.webp",
}

/** 히어로 크레스트 크기 [기본px, lg px] — 두 진영 동일 */
const CREST_HERO_PX: [number, number] = [92, 112]

/** 진영별 소속 크리에이터 — DB event_groups.source_channel 과 짝을 이룬다 */
const CREATOR_BY_SLUG: Record<string, string> = {
  blues: "첼루키",
  kop: "리빅",
}

/** 어그로체 디스플레이 — 매치데이 밴드와 동일 (이미 Bold 라 font-weight 얹지 말 것) */
const DISPLAY = "var(--font-display-ko), var(--font-title)"

const STEPS = [
  {
    num: "01",
    title: "진영 선택",
    body: "첼시와 리버풀 중 하나를 고릅니다. 한 번 고르면 끝까지 그 진영입니다.",
  },
  {
    num: "02",
    title: "예측하고 기도하라",
    body: "매일 무료로 충전되는 볼 10개를 나눠 겁니다. 어디에 몰지는 본인 몫입니다.",
  },
] as const

/**
 * 이벤트 3종 구성 (운영자 확정 2026-08-14).
 * 상품 상세는 **일부러 비워 둔다** — 배분 규칙이 정해지기 전에 숫자를 적으면
 * 나중에 말을 바꿔야 한다. "추후 공개"가 거짓말보다 낫다.
 */
const PRIZES = [
  [
    "이벤트 1 · 팬덤별 1위",
    "각 팬덤에서 점수 1위 한 명",
    "진영당 1명",
    "특별 상품 증정 — 추후 공개",
  ],
  [
    "이벤트 2 · 첼루키 vs 리빅",
    "두 진영의 맞대결 성적을 라운드마다 집계",
    "승리 진영",
    "결과는 라운드마다 공개",
  ],
  ["이벤트 3 · 1등", "히든 아이템 — 매주 힌트 공개", "1명", "승리 팬덤 · 글·댓글 쓴 분들 중 추첨"],
  ["이벤트 3 · 2등", "소속팀 유니폼", "2명", "승리 팬덤 · 글·댓글 쓴 분들 중 추첨"],
  ["이벤트 3 · 3등", "스팀 기프트카드 5만원권", "5명", "승리 팬덤 · 글·댓글 쓴 분들 중 추첨"],
] as const

const NOTICES = [
  "이벤트 3(1·2·3등)은 이벤트가 끝난 뒤 승리 팬덤을 대상으로 진행하는 추첨입니다. 성적 순위가 아니라 추첨으로 정해집니다.",
  "1등 히든 아이템이 무엇인지는 매주 힌트를 하나씩 공개합니다. 정체는 이벤트가 끝날 때 밝힙니다.",
  "이벤트 기간에 글을 쓰거나 댓글을 달며 함께한 분들 중에서 뽑습니다. 예측만 하고 활동이 없으면 추첨에서 빠집니다.",
  "한 번 선택한 진영은 이벤트가 끝날 때까지 변경할 수 없습니다.",
  "계정당 한 번만 참가할 수 있고, 참가 취소와 재등록은 되지 않습니다.",
  "성적 집계는 코그 채널 공개 시점부터 시작됩니다. 그 전에 한 예측은 들어가지 않습니다.",
  "상품 종류와 지급 방식은 채널 공개에 맞춰 따로 공지합니다.",
  "다계정 참여가 확인되면 모든 계정이 실격됩니다.",
  "5만원 초과 경품 당첨자는 수령 시 신원·배송 정보를 수집하며(제세공과금 처리), 미성년자는 법정대리인 동의가 필요합니다.",
]

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  })

export default async function CogEventPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  // 운영자 미리보기 (?preview=1) — draft 상태에서 오픈된 모습 확인. 등록 API 는
  // 여전히 draft 를 거부하므로 실제 참가는 불가. 표본 숫자는 만들지 않는다.
  const params = await searchParams
  const preview = params.preview === "1"

  const supabase = createServiceRoleClient()

  const { data: event } = await supabase
    .from("events")
    .select("id, status, start_at, end_at, registration_closes_at")
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

  const { userId } = await auth()

  const { data: groups } = await supabase
    .from("event_groups")
    .select("id, slug, name, club_kor, color, motto, sort_order")
    .eq("event_id", event.id)
    .order("sort_order", { ascending: true })

  // 진영별 참가자 수 — 이 화면에서 유일하게 실측된 숫자다 (점수·순위 집계는 미구현)
  const { data: regs } = await supabase
    .from("event_registrations")
    .select("group_id")
    .eq("event_id", event.id)
  const countByGroup = new Map<string, number>()
  for (const r of regs ?? []) {
    countByGroup.set(r.group_id, (countByGroup.get(r.group_id) ?? 0) + 1)
  }
  const totalRegs = (regs ?? []).length

  let myGroupSlug: string | null = null
  if (userId) {
    const { data: myReg } = await supabase
      .from("event_registrations")
      .select("group_id")
      .eq("event_id", event.id)
      .eq("user_id", userId)
      .maybeSingle()
    if (myReg) {
      myGroupSlug = (groups ?? []).find((g) => g.id === myReg.group_id)?.slug ?? null
    }
  }

  const pickerGroups: SeasonGroup[] = (groups ?? []).map((g) => ({
    slug: g.slug,
    name: g.name,
    club_kor: g.club_kor,
    color: g.color,
    motto: g.motto ?? "",
    crest: CRESTS[g.slug] ?? null,
    player: PLAYERS[g.slug] ?? null,
    regCount: countByGroup.get(g.id) ?? 0,
  }))

  const isDraft = event.status === "draft" && !preview
  const isClosed = event.status === "closed"
  const registrationOpen =
    !isDraft && !isClosed && new Date(event.registration_closes_at) > new Date()

  const started = preview ? true : new Date(event.start_at).getTime() - Date.now() <= 0
  const period = `${fmtDate(event.start_at)} ~ ${fmtDate(event.end_at)}`

  return (
    <div className="min-h-screen" style={{ background: "var(--wc-paper)" }}>
      {preview && (
        <div
          className="px-4 py-2 text-center text-[12.5px] font-bold text-white"
          style={{ background: "var(--wc-ink)" }}
        >
          미리보기 모드 — 채널 합의 전이라 실제 참가 등록은 되지 않습니다
        </div>
      )}

      {/* ══ 다크 히어로 — 매치데이 밴드 문법 (선언 영역이라 다크 허용) ══ */}
      <section className="gn-band" aria-label="코그 시청자 팬덤 대결">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <div
            className="relative overflow-hidden rounded-b-[16px]"
            style={{
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
                COG DUEL
              </span>
            </div>

            {/* pl 은 스큐 플레이트의 "위쪽" 폭 기준 — skewX(-8deg) 가 상단을 오른쪽으로
                ~37px 밀어내므로, 플레이트 명목 폭(118px)만 보고 잡으면 첫 줄이 경사면과 겹친다 */}
            <div className="relative grid gap-8 py-9 pl-[86px] sm:py-12 sm:pl-[140px] lg:grid-cols-[1.05fr_.95fr] lg:gap-4">
              {/* ── 좌: 선언 ── */}
              <div>
                <p
                  className="mb-3 flex flex-wrap items-center gap-2.5 text-[12.5px] font-extrabold"
                  style={{ color: "var(--gn-bg-100)", letterSpacing: "0.14em" }}
                >
                  COG · 시청자 팬덤 대결
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
                        ? "채널 공개 준비 중"
                        : started
                          ? "진행 중"
                          : registrationOpen
                            ? "참가 접수 중"
                            : "오픈 예정"}
                  </span>
                </p>

                <h1
                  className="mb-4"
                  style={{
                    fontFamily: DISPLAY,
                    fontWeight: 700,
                    // 모바일 하한이 원본(40px)보다 작다 — 제목이 "시즌 오픈"보다 길어서
                    // 40px 로는 390px 화면에서 3줄로 깨지고 스큐 플레이트와 겹친다.
                    fontSize: "clamp(30px, 5.6vw, 60px)",
                    lineHeight: 1.08,
                    letterSpacing: "-0.02em",
                  }}
                >
                  <span style={{ color: "var(--gn-cream)" }}>첼루키 vs 리빅</span>
                  <br />
                  <span style={{ color: "#e0475f" }}>시청자 팬덤 대결</span>
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
                  어느 진영으로 싸울 건가요
                  <span
                    aria-hidden
                    className="h-px w-8"
                    style={{ background: "var(--gn-night-line)" }}
                  />
                </p>

                <div className="mb-6 flex flex-wrap items-center gap-3">
                  <HeroCountdown
                    target={started && !isClosed ? event.end_at : event.start_at}
                    label={started && !isClosed ? "대결 종료까지" : "개막까지"}
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
                    매일 무료 볼 <b style={{ color: "var(--gn-cream)" }}>10개</b>로 참여
                  </span>
                </div>

                {!isDraft && !isClosed && (
                  <Link
                    href="/prediction?ref=cog"
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
                    참가 접수는 코그 채널 공개에 맞춰 시작됩니다
                  </p>
                )}
              </div>

              {/* ── 우: 깃발 콜라주 (생성 애셋 — 컬러·군중·깃발로 대결 구도,
                  팬덤명 타이포는 HTML 오버레이) ──
                  원본은 빨강|파랑|빨강 3분할이다. 두 진영이므로 150% 로 펼치면 패널 하나가
                  컨테이너의 50% 가 된다. 여기서는 **오른쪽 2패널(파랑|빨강)** 을 쓴다 —
                  화면 순서가 첼시|리버풀(=첼루키 vs 리빅)이라 색이 그 순서로 와야 한다.
                  ×1.1 오버스캔은 잘려나가는 첫 패널의 너덜한 사선 경계를 화면 밖으로 밀어낸다
                  (정확히 2/3 에서 자르면 왼쪽 위에 3번째 패널 조각이 비친다). */}
              <div
                aria-hidden
                className="relative mt-1 min-h-[190px] overflow-hidden rounded-[14px] lg:mt-0 lg:min-h-[300px]"
                style={{ border: "1px solid var(--gn-night-line)" }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: "url(/season/hero-collage.webp)",
                    backgroundSize: "165% 100%",
                    backgroundPosition: "right center",
                    backgroundRepeat: "no-repeat",
                  }}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(9,8,11,.72) 0%, rgba(9,8,11,.12) 45%, rgba(9,8,11,0) 70%)",
                  }}
                />
                <div className="absolute inset-0 grid grid-cols-2 items-center pt-2 pb-3.5">
                  {pickerGroups.map((g) => (
                    <div key={g.slug} className="flex h-full flex-col items-center justify-between">
                      <div className="flex flex-1 items-center">
                        {g.crest && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={g.crest}
                            alt=""
                            className="object-contain"
                            style={{
                              height: `clamp(${CREST_HERO_PX[0]}px, 9vw, ${CREST_HERO_PX[1]}px)`,
                              width: `clamp(${CREST_HERO_PX[0]}px, 9vw, ${CREST_HERO_PX[1]}px)`,
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
                          {g.club_kor}
                        </span>
                        <span
                          className="text-[10.5px] font-bold"
                          style={{
                            color: "rgba(245,239,231,.72)",
                            textShadow: "0 1px 8px rgba(0,0,0,.8)",
                          }}
                        >
                          {CREATOR_BY_SLUG[g.slug] ?? g.name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── 다크 존 하단 스탯 스트립 (실측 항목만, 0 비노출) ── */}
            <div
              className="relative flex flex-wrap items-center gap-x-8 gap-y-1 rounded-t-[12px] px-5 py-3.5 pl-[64px] sm:pl-[110px]"
              style={{
                background: "rgba(255,255,255,.05)",
                borderTop: "1px solid var(--gn-night-line)",
              }}
            >
              {totalRegs > 0 && (
                <span className="text-[13px] font-bold" style={{ color: "var(--gn-cream-dim)" }}>
                  참여 팬{" "}
                  <b className="gn-num text-[17px]" style={{ color: "var(--gn-cream)" }}>
                    {totalRegs.toLocaleString()}
                  </b>
                </span>
              )}
              <span className="text-[13px] font-bold" style={{ color: "var(--gn-cream-dim)" }}>
                이벤트 기간 <b style={{ color: "var(--gn-cream)" }}>{period}</b>
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
        {/* 진영 선택 */}
        <div className="mb-3 text-center">
          <p
            className="mb-1.5 text-[12px] font-extrabold"
            style={{ color: "var(--wc-burgundy)", letterSpacing: "0.18em" }}
          >
            ★ ★ ★&nbsp;&nbsp;두 진영, 라운드마다의 승부&nbsp;&nbsp;★ ★ ★
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
            어느 진영으로 싸울 건가요?
          </h2>
          <p
            className="mx-auto mt-[10px] max-w-[560px] text-[14px]"
            style={{ color: "var(--wc-mute)", lineHeight: 1.65, wordBreak: "keep-all" }}
          >
            고른 진영은 되돌릴 수 없습니다. 이기고 있는 쪽으로 갈아탈 수 없다는 뜻입니다.
          </p>
        </div>
        <TeamPicker
          groups={pickerGroups}
          myGroupSlug={myGroupSlug}
          registrationOpen={registrationOpen}
          registerEndpoint="/api/event/cog/register"
          unitLabel="진영"
        />
        {isDraft && (
          <p
            className="mt-5 text-center text-[13px] font-bold"
            style={{ color: "var(--wc-mute-2)", wordBreak: "keep-all" }}
          >
            참가 접수는 코그 채널 공개에 맞춰 시작됩니다.
          </p>
        )}

        {/* 기간·참여·보상 3열 정보 행 */}
        <div
          className="mt-4 grid gap-px overflow-hidden rounded-xl sm:grid-cols-3"
          style={{ background: "var(--wc-line)", border: "1px solid var(--wc-line)" }}
        >
          {[
            ["대결 기간", "약 4주", period],
            ["참여 방법", "예측하고 기도하라", "매일 채워지는 무료 볼 10개로 경기를 예측"],
            ["보상 안내", "각 팬덤 1위에게 특별 상품", "상품 내용은 추후 공개"],
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

        {/* 라운드 결과 — 집계가 붙기 전이라 빈 상태만 둔다 (없는 숫자를 만들지 않는다) */}
        <section className="mt-12">
          <div className="mb-[18px] text-center">
            <div className="wc-sec-eb" style={{ marginBottom: 8 }}>
              Round results
            </div>
            <h2
              className="text-[24px] font-extrabold sm:text-[28px]"
              style={{ letterSpacing: "-.03em" }}
            >
              라운드 결과
            </h2>
          </div>
          <div
            className="rounded-xl px-5 py-6 text-center text-[13.5px] font-semibold"
            style={{
              border: "1px dashed var(--wc-line-2)",
              color: "var(--wc-mute)",
              background: "var(--wc-card, #fff)",
              wordBreak: "keep-all",
            }}
          >
            라운드 성적은 코그 채널 공개 시점부터 집계됩니다 — 그 전에 한 예측은 대결 성적에
            들어가지 않습니다.
          </div>
        </section>

        {/* 점수 규칙 — 이미 돌고 있는 승부예측 엔진 그대로라 숫자를 적을 수 있다 */}
        <section className="mt-12">
          <div className="mb-[18px] text-center">
            <div className="wc-sec-eb" style={{ marginBottom: 8 }}>
              Scoring
            </div>
            <h2
              className="text-[24px] font-extrabold sm:text-[28px]"
              style={{ letterSpacing: "-.03em" }}
            >
              예측에 쓰는 볼
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
                <b style={{ color: "var(--wc-burgundy)" }}>볼은 매일 10개가 무료로 채워집니다.</b>{" "}
                돈으로 살 수 없고, 남은 볼은 다음 날로 넘어가지 않아요.
              </li>
              <li>
                한 예측에 볼 <b>1~10개</b>를 겁니다. 한 경기에 몰지, 여러 경기에 나눠 걸지가
                전략입니다.
              </li>
              <li>
                맞히면 <b>건 볼 × (배당 − 1)</b>만큼 점수를 얻고, 틀리면 건 볼만큼 그대로
                마이너스입니다. 10볼을 배당 2.5에 걸면 맞을 때 +15점, 틀릴 때 −10점.
              </li>
              <li>
                라운드 승패 판정 기준은 <b>채널 공개에 맞춰 확정 공지</b>합니다.
              </li>
            </ul>
          </div>
        </section>

        {/* 진행 방식 */}
        <section className="mt-12">
          <div className="mb-[24px] text-center">
            <div className="wc-sec-eb" style={{ marginBottom: 8 }}>
              Join
            </div>
            <h2
              className="text-[24px] font-extrabold sm:text-[28px]"
              style={{ letterSpacing: "-.03em" }}
            >
              참여 방법
            </h2>
          </div>
          {/* 단계가 2개다 — 3열 그리드를 그대로 두면 오른쪽 한 칸이 빈다 */}
          <div className="grid w-full gap-[18px] text-left sm:grid-cols-2">
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

        {/* 크리에이터 맞대결 선언 밴드 — 유니폼의 행방 (다크 = 선언 영역이라 허용).
            생성 애셋(duel-banner.webp): 빨강 vs 파랑 실루엣 사이에 무지 유니폼이 전리품처럼
            떠 있는 구도 — 리버풀 vs 첼시 구도에 그대로 맞는다.
            ⚠️ /season 은 제휴 무산으로 이 밴드가 CREATOR_DUEL_ENABLED=false 로 꺼져 있다.
               코그 대결은 두 크리에이터가 **대결의 전제**라 이 페이지에서만 켠다 —
               lib/event/season-config.ts 의 전역 상수를 true 로 바꾸지 말 것
               (켜는 순간 상대 없는 /season 에 못 지킬 약속이 걸린다). */}
        <section className="mt-12" aria-label="크리에이터 맞대결 — 유니폼의 행방">
          <div
            className="relative overflow-hidden rounded-2xl"
            style={{ border: "1px solid var(--wc-line)", background: "#0b0a0e" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/season/duel-banner.webp"
              alt=""
              className="w-full object-cover"
              style={{ aspectRatio: "16 / 10", objectPosition: "center 38%" }}
              loading="lazy"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(9,8,11,.92) 0%, rgba(9,8,11,.55) 26%, rgba(9,8,11,0) 55%)",
              }}
            />
            <div className="absolute right-0 bottom-0 left-0 px-5 pb-6 text-center sm:pb-8">
              <p
                className="text-[11px] font-extrabold"
                style={{
                  color: "rgba(245,239,231,.85)",
                  letterSpacing: "0.2em",
                  textShadow: "0 1px 10px rgba(0,0,0,.9)",
                }}
              >
                CREATOR DUEL
              </p>
              <h2
                className="mt-1.5"
                style={{
                  fontFamily: DISPLAY,
                  fontWeight: 700,
                  fontSize: "clamp(22px, 3.2vw, 34px)",
                  color: "rgba(245,239,231,.97)",
                  letterSpacing: "-0.01em",
                  textShadow: "0 2px 20px rgba(0,0,0,.8)",
                  wordBreak: "keep-all",
                }}
              >
                첼루키 vs 리빅, 이번 라운드는 어느 쪽인가
              </h2>
              <p
                className="mx-auto mt-2.5 max-w-[560px] text-[13.5px] sm:text-[14.5px]"
                style={{
                  lineHeight: 1.6,
                  color: "rgba(245,239,231,.78)",
                  wordBreak: "keep-all",
                }}
              >
                첼루키와 리빅이 라운드마다 시청자 팬덤을 걸고 맞붙습니다. 이긴 쪽 팬덤에 상품이
                갑니다.
              </p>
              <p className="mt-2 text-[12px] font-bold" style={{ color: "rgba(245,239,231,.5)" }}>
                결과 발표 일정은 채널 공개에 맞춰 공지합니다
              </p>
            </div>
          </div>
        </section>

        {/* 상품 안내 — 추첨 (컴플라이언스: 순위 직결 확정 지급 아님) */}
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
              이벤트는 세 갈래로 돌아갑니다. 이벤트 3은 종료 후 승리 팬덤을 대상으로 한 추첨이고,
              글을 쓰거나 댓글을 달며 함께한 분들 중에서 뽑습니다.
              <br />
              1등 히든 아이템은 <b style={{ color: "var(--wc-burgundy)" }}>
                매주 힌트를 하나씩
              </b>{" "}
              공개합니다.
            </p>
          </div>
          <div
            className="w-full overflow-hidden rounded-xl text-left"
            style={{ border: "1px solid var(--wc-line)", background: "var(--wc-card, #fff)" }}
          >
            {PRIZES.map(([tier, desc, n, how], i) => (
              <div
                key={tier}
                className="grid grid-cols-[96px_1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[150px_1fr_110px_1fr]"
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
        <section className="mt-12">
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

        {/* 스탠바이 — 공개 전 페이지임을 숨기지 않는다 */}
        <p
          className="mt-10 pb-14 text-center text-[12.5px]"
          style={{ color: "var(--wc-mute)", wordBreak: "keep-all" }}
        >
          코그 채널 제휴 준비 중 · 공개 전 페이지입니다.
        </p>
      </main>
    </div>
  )
}
