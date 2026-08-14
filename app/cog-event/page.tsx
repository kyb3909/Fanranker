import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { ArrowRight } from "lucide-react"
import { auth } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { CogSidePicker, type CogSide } from "@/components/cog/side-picker"

/**
 * /cog-event — 유튜브 채널 코그(COG) 제휴 제안용 시청자 팬덤 대결 (스탠바이).
 *
 * 코그의 두 크리에이터 구도(첼루키=첼시 / 리빅=리버풀)를 시청자 팬덤 대결로 옮긴 것.
 * **아직 채널과 합의 전이라 GNB 미노출 · noindex — 직접 URL 전용** (app/season/big4 관례).
 * 아스날 단독 이벤트(/season, slug season-open-2026)와는 완전히 다른 이벤트다 — 섞지 말 것.
 *
 * DB: events.slug = 'cog-duel-2026' (status='draft'), event_groups = blues/kop.
 * status 가 draft 인 동안 등록 API 가 400 을 돌려주므로 화면이 열려 있어도 참가는 안 된다.
 * 운영자 확인용으로 ?preview=1 을 주면 참가 UI 까지 열린 모습을 볼 수 있다(등록은 여전히 불가).
 *
 * ⚠️ 점수·라운드 집계는 **이 작업 범위가 아니다.** 채널 합의 후 붙일 자리이므로
 *    화면에는 없는 숫자를 만들어 보여주지 않는다 — "채널 공개 시점부터 집계"라고만 적는다.
 *
 * 톤: 느낌표·홈쇼핑 어휘 금지. 다크는 상단 선언 밴드만, 라이트 존 다크 카드·
 * 한쪽 액센트 보더 금지 (팀 컬러는 상단 스트라이프·칩으로만).
 */

export const metadata: Metadata = {
  title: "첼루키 vs 리빅 — 코그 시청자 팬덤 대결",
  description:
    "첼시 팬과 리버풀 팬이 두 진영으로 나뉘어 겨루는 승부예측 대결. 매일 무료로 받는 볼 10개로 참여합니다.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/cog-event" },
}

// 참가 여부(auth + 등록)로 화면이 갈리므로 요청마다 판정한다
export const dynamic = "force-dynamic"

const EVENT_SLUG = "cog-duel-2026"

/** 어그로체 디스플레이 — 밴드·히어로 공용 (이미 Bold 라 font-weight 를 더 얹지 말 것) */
const DISPLAY = "var(--font-display-ko), var(--font-title)"

/** 진영별 소속 크리에이터 — DB event_groups.source_channel 과 짝을 이룬다 */
const CREATOR_BY_SLUG: Record<string, string> = {
  blues: "첼루키",
  kop: "리빅",
}

/**
 * 대결 규칙 — 확정된 것만 적는다.
 * 라운드 정산·점수 집계는 미구현이라 "채널 공개 시점부터"로 못박아 둔다.
 * 볼/점수 계산 규칙은 기존 승부예측 엔진 그대로다
 * (app/api/betman/prediction: 슬립당 볼 1~10, reset_user_daily_tokens: 매일 10개).
 */
const RULES: { title: string; lines: string[] }[] = [
  {
    title: "진영 선택",
    lines: [
      "첼시 팬과 리버풀 팬 중 하나를 골라 참가합니다.",
      "한 번 고른 진영은 이벤트가 끝날 때까지 바꿀 수 없습니다. 이기고 있는 쪽으로 갈아타는 것을 막기 위한 규칙입니다.",
      "계정당 한 번만 참가할 수 있고, 참가 취소와 재등록은 되지 않습니다.",
    ],
  },
  {
    title: "라운드 대결",
    lines: [
      "라운드별로 결과를 정산해 이긴 팬덤을 가립니다.",
      "이긴 진영에서 추첨으로 한 명을 뽑아 이번 시즌 유니폼을 드립니다.",
      "라운드 정산은 채널 공개 시점부터 집계됩니다. 그 전에 한 예측은 대결 성적에 들어가지 않습니다.",
    ],
  },
  {
    title: "예측에 쓰는 볼",
    lines: [
      "볼은 매일 10개가 무료로 채워집니다. 돈으로 살 수 없고, 남은 볼은 다음 날로 넘어가지 않습니다.",
      "한 예측에 볼 1~10개를 겁니다. 한 경기에 몰지 여러 경기에 나눠 걸지가 전략입니다.",
      "맞히면 «건 볼 × (배당 − 1)»만큼 점수를 얻고, 틀리면 건 볼만큼 그대로 마이너스입니다. 10볼을 배당 2.5에 걸면 맞을 때 +15점, 틀릴 때 −10점입니다.",
    ],
  },
  {
    title: "준비된 경품",
    lines: [
      "위르겐 클롭 사인 모자.",
      "존 테리 사인 주장 완장.",
      "지급 시점과 방식은 채널 공개에 맞춰 따로 공지합니다.",
    ],
  },
]

const cardStyle = {
  background: "var(--wc-card)",
  border: "1px solid var(--wc-line)",
  boxShadow: "var(--wc-shadow-1)",
} as const

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  })

/** 하단 스탠바이 안내 — 공개 전 페이지임을 숨기지 않는다 */
function StandbyNote() {
  return (
    <p
      className="mt-10 pb-14 text-center text-[12.5px]"
      style={{ color: "var(--wc-mute)", wordBreak: "keep-all" }}
    >
      코그 채널 제휴 준비 중 · 공개 전 페이지입니다.
    </p>
  )
}

function RulesSection() {
  return (
    <section className="mt-12">
      <div className="wc-panel">
        <h2 className="mb-[14px] text-[15.5px] font-extrabold" style={{ color: "var(--wc-mute)" }}>
          대결 규칙
        </h2>
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
                    style={{ lineHeight: 1.6, color: "var(--wc-mute-2)", wordBreak: "keep-all" }}
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
  )
}

export default async function CogEventPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const preview = params.preview === "1"

  const supabase = createServiceRoleClient()

  const { data: event } = await supabase
    .from("events")
    .select("id, name, status, start_at, end_at, registration_closes_at")
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

  const [groupsRes, myRegRes] = await Promise.all([
    supabase
      .from("event_groups")
      .select("id, slug, name, club_kor, color, motto")
      .eq("event_id", event.id),
    userId
      ? supabase
          .from("event_registrations")
          .select("group_id")
          .eq("event_id", event.id)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null as { group_id: string } | null }),
  ])

  const groups = groupsRes.data ?? []

  // 진영별 참가자 수 — 읽기 전용 집계. 진영이 둘뿐이라 count 쿼리 두 번이면 충분하다.
  const counts = await Promise.all(
    groups.map((g) =>
      supabase
        .from("event_registrations")
        .select("user_id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .eq("group_id", g.id)
        .then((r) => r.count ?? 0)
    )
  )

  // 화면 순서를 DB 반환 순서에 맡기지 않는다 — 첼시(첼루키)를 왼쪽에 고정
  const ORDER = ["blues", "kop"]
  const sides: CogSide[] = groups
    .map((g, i) => ({
      slug: g.slug,
      club_kor: g.club_kor,
      name: g.name,
      color: g.color,
      motto: g.motto,
      creator: CREATOR_BY_SLUG[g.slug] ?? "",
      regCount: counts[i] ?? 0,
    }))
    .sort((a, b) => ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug))

  const isDraft = event.status === "draft" && !preview
  const isClosed = event.status === "closed"
  const registrationOpen =
    !isDraft && !isClosed && new Date(event.registration_closes_at) > new Date()

  const myGroupId = myRegRes.data?.group_id ?? null
  const mySide = myGroupId
    ? (sides.find((s) => s.slug === groups.find((g) => g.id === myGroupId)?.slug) ?? null)
    : null

  const period = `${fmtDate(event.start_at)} ~ ${fmtDate(event.end_at)}`

  /* ══════════════ 신청 완료 ══════════════ */
  if (mySide) {
    return (
      <div className="min-h-screen" style={{ background: "var(--wc-paper)" }}>
        {/* 컴팩트 밴드 — 세일즈 히어로가 접힌 형태 자체가 "당신은 이미 참가자"라는 신호 */}
        <section className="gn-band" aria-label="코그 시청자 팬덤 대결">
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-8 pb-1.5">
              <span
                className="gn-num text-[13px] font-bold uppercase"
                style={{ letterSpacing: "0.2em", color: "var(--gn-bg-100)" }}
              >
                COG · Viewer Duel
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
                첼루키 vs 리빅
              </h1>
            </div>
            <p
              className="pb-7 text-[13px] font-bold"
              style={{ color: "var(--gn-cream-dim)", wordBreak: "keep-all" }}
            >
              {period}
            </p>
          </div>
        </section>

        <main className="mx-auto w-full max-w-[880px] px-4 pt-6 sm:px-6">
          {/* 내 진영 */}
          <section className="overflow-hidden rounded-xl" style={cardStyle}>
            <span aria-hidden className="block" style={{ height: 5, background: mySide.color }} />
            <div className="p-5">
              <p className="text-[12px] font-extrabold" style={{ color: "var(--wc-mute)" }}>
                내 진영 · {mySide.creator}
              </p>
              <p
                className="mt-1.5 text-[30px] leading-none"
                style={{ fontFamily: DISPLAY, fontWeight: 700, color: mySide.color }}
              >
                {mySide.club_kor}
              </p>
              <p
                className="mt-2 text-[12.5px] font-semibold italic"
                style={{ color: "var(--wc-mute)" }}
              >
                {mySide.motto}
              </p>
            </div>
          </section>

          {/* 두 진영 참가자 수 — 실제로 센 숫자만 (점수 집계는 아직 없다) */}
          <section className="mt-4 grid gap-3 sm:grid-cols-2">
            {sides.map((s) => (
              <div key={s.slug} className="overflow-hidden rounded-xl" style={cardStyle}>
                <span aria-hidden className="block" style={{ height: 3, background: s.color }} />
                <div className="flex items-baseline justify-between gap-3 px-5 py-4">
                  <span className="text-[14.5px] font-extrabold" style={{ color: s.color }}>
                    {s.club_kor}
                  </span>
                  <span className="text-[13px] font-bold" style={{ color: "var(--wc-mute-2)" }}>
                    참가{" "}
                    <b className="gn-num text-[17px]" style={{ color: "var(--wc-ink)" }}>
                      {s.regCount.toLocaleString()}
                    </b>
                  </span>
                </div>
              </div>
            ))}
          </section>

          <p
            className="mt-3 text-center text-[12.5px]"
            style={{ color: "var(--wc-mute)", wordBreak: "keep-all" }}
          >
            라운드 정산은 채널 공개 시점부터 집계됩니다.
          </p>

          {/* 다음 행동 — 버건디 = 행동의 색 */}
          <Link
            href="/prediction?ref=cog"
            className="mt-4 flex items-center justify-between gap-3 rounded-xl px-5 py-4 transition-transform active:scale-[.99]"
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

          <RulesSection />
          <StandbyNote />
        </main>
      </div>
    )
  }

  /* ══════════════ 미신청 — 진영 선택이 주인공 ══════════════ */
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

      {/* ══ 다크 선언 존 — 대결 구도 선언 (실제 클럽 엠블럼 없이 색과 이름만) ══ */}
      <section className="gn-band" aria-label="코그 시청자 팬덤 대결">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <div className="pt-9 pb-8">
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
                {isClosed ? "종료" : isDraft ? "채널 공개 준비 중" : "참가 접수 중"}
              </span>
            </p>

            <h1
              className="mb-4"
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: "clamp(40px, 6vw, 62px)",
                lineHeight: 1.08,
                letterSpacing: "-0.02em",
                color: "var(--gn-cream)",
              }}
            >
              첼루키 vs 리빅
            </h1>

            <p
              className="max-w-[560px] text-[16px] font-extrabold"
              style={{ color: "var(--gn-cream)", wordBreak: "keep-all" }}
            >
              첼시 팬과 리버풀 팬이 두 진영으로 나뉘어 겨룹니다. 매일 무료로 받는 볼 10개로
              예측하고, 라운드마다 이긴 팬덤을 가립니다.
            </p>
            <p
              className="mt-2 text-[13px] font-bold"
              style={{ color: "var(--gn-cream-dim)", wordBreak: "keep-all" }}
            >
              이벤트 기간 {period}
            </p>
          </div>

          {/* 두 진영 컬러 플레이트 — 엠블럼 없이 색과 이름만 (big4 티저 문법) */}
          <div className="grid grid-cols-2 overflow-hidden rounded-t-[12px]">
            {sides.map((s) => (
              <div
                key={s.slug}
                className="flex h-[92px] flex-col items-center justify-center sm:h-[110px]"
                style={{
                  background: `linear-gradient(160deg, ${s.color} 0%, ${s.color}cc 60%, var(--gn-night-soft) 150%)`,
                }}
              >
                <span
                  className="text-[24px] leading-none sm:text-[30px]"
                  style={{ fontFamily: DISPLAY, fontWeight: 700, color: "var(--gn-cream)" }}
                >
                  {s.club_kor}
                </span>
                <span
                  className="mt-1.5 text-[11px] font-extrabold"
                  style={{ letterSpacing: "0.2em", color: "rgba(245,239,231,.8)" }}
                >
                  {s.creator}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ 라이트 존 — 진영 선택이 화면의 주인공 ══ */}
      <main className="mx-auto w-full max-w-[1080px] px-4 pt-10 sm:px-6">
        <section>
          <div className="mb-[24px] text-center">
            <div className="wc-sec-eb" style={{ marginBottom: 8 }}>
              PICK YOUR SIDE
            </div>
            <h2
              className="text-[24px] font-extrabold sm:text-[28px]"
              style={{ letterSpacing: "-.03em", wordBreak: "keep-all" }}
            >
              어느 진영으로 참가하시겠습니까
            </h2>
            <p
              className="mx-auto mt-[10px] max-w-[560px] text-[14.5px]"
              style={{ color: "var(--wc-mute)", lineHeight: 1.65, wordBreak: "keep-all" }}
            >
              고른 진영은 되돌릴 수 없습니다. 이기고 있는 쪽으로 갈아탈 수 없다는 뜻입니다.
            </p>
          </div>

          <CogSidePicker sides={sides} registrationOpen={registrationOpen} />

          {isDraft && (
            <p
              className="mt-5 text-center text-[13px] font-bold"
              style={{ color: "var(--wc-mute-2)", wordBreak: "keep-all" }}
            >
              참가 접수는 코그 채널 공개에 맞춰 시작됩니다.
            </p>
          )}
        </section>

        <RulesSection />
        <StandbyNote />
      </main>
    </div>
  )
}
