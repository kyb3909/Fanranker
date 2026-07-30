import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { ArrowRight } from "lucide-react"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { Countdown } from "@/components/worldcup/countdown"
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

/**
 * 시즌 오픈 이벤트 랜딩 (Phase 1) — 팀 선택 참가 + 규칙/상품 안내.
 *
 * 공개 정책 (설계 §3): 참가자 수·누적 예측 수는 실시간, 팀 순위·평균 성적은 주 1회만.
 * 컴플라이언스 (약관 제6조의2): 경품은 활동 포인트 기준 "추첨" — 순위 직결 확정 지급 아님.
 * 순위(예측력)는 명예 타이틀과 팀 대항전 판정에 쓴다.
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

export default async function SeasonEventPage() {
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

  const pickerGroups: SeasonGroup[] = (groups ?? []).map((g) => ({
    slug: g.slug,
    name: g.name,
    club_kor: g.club_kor,
    color: g.color,
    motto: g.motto ?? "",
    regCount: countByGroup.get(g.id) ?? 0,
  }))

  const isDraft = event.status === "draft"
  const isClosed = event.status === "closed"
  const registrationOpen =
    !isDraft && !isClosed && new Date(event.registration_closes_at) > new Date()

  const msToStart = new Date(event.start_at).getTime() - Date.now()
  const dday = Math.floor(Math.max(0, msToStart) / (1000 * 60 * 60 * 24))
  const ddayLabel = isClosed
    ? "종료"
    : msToStart <= 0
      ? "진행 중"
      : dday > 0
        ? `D-${dday}`
        : "D-DAY"

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("ko-KR", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      timeZone: "Asia/Seoul",
    })

  return (
    <div className="min-h-screen" style={{ background: "var(--wc-paper)" }}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[840px] px-4 pt-8 sm:px-6">
        <div className="wc-panel flex flex-col items-center text-center">
          <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
            <span className="wc-pill-wine">EVENT</span>
            <span
              className="tnum inline-flex items-center"
              style={{
                height: 28,
                padding: "0 12px",
                background: "var(--wc-ink)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 999,
              }}
            >
              {isDraft ? "오픈 준비 중" : ddayLabel}
            </span>
          </div>

          <h1
            className="font-title mb-[14px]"
            style={{
              fontSize: "clamp(32px, 5vw, 48px)",
              fontWeight: 900,
              letterSpacing: "-.03em",
              lineHeight: 1.2,
              wordBreak: "keep-all",
            }}
          >
            시즌 오픈
            <br />
            <span style={{ color: "var(--wc-burgundy)" }}>팬덤 대항전</span>
          </h1>

          <p
            className="mb-[28px] max-w-[540px]"
            style={{
              fontSize: 16,
              lineHeight: 1.7,
              color: "var(--wc-mute)",
              wordBreak: "keep-all",
            }}
          >
            리버풀 vs 첼시 vs 아스날. 시즌 개막 4주 동안 예측으로 팬덤의 자존심을 걸어보세요.
            활동하면 <b style={{ color: "var(--wc-ink)" }}>유니폼·치킨 추첨</b> 자격이 생기고, 4주
            뒤 <b style={{ color: "var(--wc-ink)" }}>승리 팬덤</b>이 가려집니다.
          </p>

          {/* 이벤트 정보 박스 */}
          <div
            className="mb-[28px] w-full overflow-hidden rounded-xl"
            style={{ background: "#fff", border: "1px solid var(--wc-line)", display: "flex" }}
          >
            {[
              ["이벤트 기간", `${fmtDate(event.start_at)} ~ ${fmtDate(event.end_at)}`],
              ["참가 등록", isDraft ? "오픈 시 공지" : `~${fmtDate(event.registration_closes_at)}`],
              ["참가 대상", "세 팀 중 하나를 고른 누구나"],
            ].map(([k, v], i) => (
              <div
                key={k}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  padding: "15px 8px",
                  alignItems: "center",
                  borderLeft: i > 0 ? "1px solid var(--wc-line)" : "none",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--wc-mute-2)" }}>
                  {k}
                </span>
                <span
                  className="text-center"
                  style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4, wordBreak: "keep-all" }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>

          {/* 팀 선택 */}
          <div className="mb-[10px] w-full text-left">
            <div className="wc-sec-eb mb-2 text-center">Pick your side</div>
            <h2
              className="mb-4 text-center text-[24px] font-extrabold sm:text-[26px]"
              style={{ letterSpacing: "-.03em" }}
            >
              어느 팬덤으로 싸울 건가요?
            </h2>
            <TeamPicker
              groups={pickerGroups}
              myGroupSlug={myGroupSlug}
              registrationOpen={registrationOpen}
            />
          </div>

          {/* 실시간 현황 — 참가자·누적 예측만 (팀 순위·성적은 주 1회 발표).
              0 카운트는 비노출 (워룸 규칙) — 오픈 전/초기엔 발표 정책 문구만. */}
          <div
            className="mb-[24px] flex w-full flex-wrap items-center justify-center gap-x-6 gap-y-1 rounded-xl px-4 py-3 text-[13px] font-bold"
            style={{ background: "var(--wc-soft)", color: "var(--wc-mute)" }}
          >
            {totalRegs > 0 && (
              <>
                <span>
                  총 참가{" "}
                  <b style={{ color: "var(--wc-burgundy)" }}>{totalRegs.toLocaleString()}명</b>
                </span>
                <span aria-hidden style={{ opacity: 0.4 }}>
                  |
                </span>
              </>
            )}
            {(slipCount ?? 0) > 0 && (
              <>
                <span>
                  누적 예측{" "}
                  <b style={{ color: "var(--wc-burgundy)" }}>
                    {(slipCount ?? 0).toLocaleString()}건
                  </b>
                </span>
                <span aria-hidden style={{ opacity: 0.4 }}>
                  |
                </span>
              </>
            )}
            <span>팀 순위는 매주 월요일 발표</span>
          </div>

          {/* 오픈 전 카운트다운 / 오픈 후 CTA */}
          {isDraft || msToStart > 0 ? (
            <div className="wc-cd-light mb-[8px]">
              <Countdown target={event.start_at} label="개막까지" />
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/prediction" className="wc-hbtn wc-hbtn-primary">
                오늘 경기 예측하러 가기 <ArrowRight className="h-[17px] w-[17px]" />
              </Link>
            </div>
          )}

          {/* 순위 규칙 — 예측력 (적중률·한 방 함정을 모두 보정) */}
          <div
            className="mt-[34px] w-full pt-[30px] text-left"
            style={{ borderTop: "1px solid var(--wc-line)" }}
          >
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
                  <b style={{ color: "var(--wc-burgundy)" }}>
                    어려운 경기를 맞힐수록 크게 오릅니다.
                  </b>{" "}
                  모두가 맞히는 쉬운 픽은 점수가 거의 오르지 않아요.
                </li>
                <li>
                  <b style={{ color: "var(--wc-burgundy)" }}>한 방 몰아주기로는 못 올라갑니다.</b>{" "}
                  대박 한 번보다 꾸준한 적중이 유리하도록 설계했습니다.
                </li>
                <li>
                  정산된 예측이 <b>5회 이상</b>인 참가자만 순위에 들어갑니다 — 팀 순위도 이
                  참가자들의 평균으로 계산해요.
                </li>
                <li>
                  팀 순위·평균 성적은 <b>매주 월요일에만 공개</b>됩니다. 역전은 마지막 주에도 일어날
                  수 있어요.
                </li>
              </ul>
            </div>
          </div>

          {/* 진행 방식 */}
          <div
            className="mt-[34px] w-full pt-[30px]"
            style={{ borderTop: "1px solid var(--wc-line)" }}
          >
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
                  <p
                    className="text-[14.5px]"
                    style={{ lineHeight: 1.62, color: "var(--wc-ink-2)" }}
                  >
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 상품 안내 — 활동 기준 추첨 (컴플라이언스: 순위 직결 아님) */}
          <div
            className="mt-[34px] w-full pt-[30px]"
            style={{ borderTop: "1px solid var(--wc-line)" }}
          >
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
                활동 포인트를 달성한 참가자 대상 추첨입니다. 예측만으로는 응모할 수 없어요 —
                커뮤니티 활동 3회가 필요합니다.
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
          </div>
        </div>
      </section>

      {/* ── 유의사항 ────────────────────────────────────────── */}
      <section className="mx-auto px-4 pb-10 sm:px-6" style={{ maxWidth: 880, paddingTop: 24 }}>
        <div className="wc-panel">
          <h3
            className="mb-[14px] text-[15.5px] font-extrabold"
            style={{ color: "var(--wc-mute)" }}
          >
            유의사항
          </h3>
          <ul className="flex flex-col gap-2" style={{ listStyle: "none", margin: 0, padding: 0 }}>
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

      <div className="pb-[56px] text-center text-[13px]" style={{ color: "var(--wc-mute)" }}>
        세 팬덤의 자존심이 여기서 갈립니다 — 당신의 팀은 어디입니까
      </div>
    </div>
  )
}
