import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { auth } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { PageBand } from "@/components/page-band"
import { RaceJoinButton } from "@/components/season/race-join-button"
import {
  computeRaceStanding,
  fetchMyRaceSlips,
  GUNNERS_SEASON,
  MIN_ACTIVE_DAYS,
  type RaceResultSlip,
} from "@/lib/event/gunners-season"

export const metadata: Metadata = {
  title: "내 예측 결과 — 2026/27 프리미어리그 개막 기념 승부예측 이벤트",
  description: "개막 기념 승부예측 이벤트에 들어간 내 축구 예측과 점수를 한 곳에서 봅니다.",
  alternates: { canonical: "/season/results" },
  robots: { index: false },
}

// 개인화 지면 — 캐시가 다른 유저에게 새면 안 된다
export const dynamic = "force-dynamic"

/**
 * /season/results — 개막 기념 승부예측 이벤트 **전용** 결과 지면 (2026-08-14 운영자 지시).
 *
 * /my-predictions 와 다른 페이지다. 그쪽은 전 종목·전 기간의 개인 기록이고,
 * 여기는 "이번 이벤트 점수를 만든 예측"만 본다. 그래서 집계 조건을 화면이 따로
 * 정의하지 않고 lib/event/gunners-season.ts 의 fetchMyRaceSlips 를 쓴다 —
 * 순위 계산과 같은 파일, 같은 필터. 두 화면이 각자 조건을 쓰면 "결과엔 5건인데
 * 순위는 3건 기준"이 되고, 상품이 걸린 이벤트에서 그건 곧바로 분쟁이다.
 *
 * 라이트 존이라 다크 카드·한쪽 액센트 보더 금지 (편집 금지 목록). 상단 밴드만 다크.
 */

const cardStyle = {
  background: "var(--wc-card)",
  border: "1px solid var(--wc-line)",
  boxShadow: "var(--wc-shadow-1)",
} as const

const fmtSlipTime = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso))

const STATUS_LABEL: Record<string, string> = {
  won: "적중",
  lost: "미적중",
  cancelled: "경기 취소",
  pending: "결과 대기",
}

function statusChipStyle(status: string) {
  if (status === "won") return { background: "var(--wc-wine-tint)", color: "var(--wc-burgundy)" }
  if (status === "cancelled" || status === "pending")
    return { background: "var(--wc-soft)", color: "var(--wc-warn)" }
  return { background: "var(--wc-soft)", color: "var(--wc-mute)" }
}

/** 소수 첫째 자리까지 — 순위는 원값으로 갈리는데 화면만 반올림하면 "같은 점수인데 왜 아래냐"가 된다 */
const fmtPoint = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n * 10) / 10}`

function EmptyShell({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action: React.ReactNode
}) {
  return (
    <div className="min-h-screen" style={{ background: "var(--wc-paper)" }}>
      <PageBand
        kicker="RESULTS"
        title="내 예측 결과"
        description="개막 기념 승부예측 이벤트에 들어간 내 축구 예측만 모아 봅니다."
      />
      <main className="mx-auto w-full max-w-[880px] px-4 pt-6 pb-16 sm:px-6">
        <section className="rounded-xl p-6 text-center" style={cardStyle}>
          <h2 className="text-[17px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
            {title}
          </h2>
          <p
            className="mx-auto mt-2 max-w-[420px] text-[13.5px]"
            style={{ color: "var(--wc-mute)", lineHeight: 1.65, wordBreak: "keep-all" }}
          >
            {body}
          </p>
          <div className="mt-5 flex justify-center">{action}</div>
        </section>
        <p className="mt-4 text-center">
          <Link
            href="/season?ref=event"
            className="text-[13px] font-bold"
            style={{ color: "var(--wc-burgundy)" }}
          >
            이벤트 안내로 돌아가기 →
          </Link>
        </p>
      </main>
    </div>
  )
}

function SlipCard({ slip }: { slip: RaceResultSlip }) {
  const label = STATUS_LABEL[slip.status] ?? "결과 대기"
  const settled = slip.status === "won" || slip.status === "lost"

  return (
    <li className="rounded-xl p-4" style={cardStyle}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span
            className="rounded px-2 py-[3px] text-[11.5px] font-extrabold"
            style={statusChipStyle(slip.status)}
          >
            {label}
          </span>
          <span className="text-[12px]" style={{ color: "var(--wc-mute)" }}>
            {fmtSlipTime(slip.createdAt)}
          </span>
        </span>
        <span
          className="text-[15px] font-extrabold tabular-nums"
          style={{ color: settled ? "var(--wc-ink)" : "var(--wc-mute)" }}
        >
          {settled ? `${fmtPoint(slip.net)}점` : "—"}
        </span>
      </div>

      <ul className="mt-2.5 flex flex-col gap-1.5">
        {slip.picks.map((p, i) => (
          <li
            key={`${slip.id}-${i}`}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
          >
            <span
              className="min-w-0 text-[13.5px] font-semibold"
              style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
            >
              {p.home} <span style={{ color: "var(--wc-mute)" }}>vs</span> {p.away}
              {p.homeScore !== null && p.awayScore !== null && (
                <span className="ml-1.5 tabular-nums" style={{ color: "var(--wc-mute)" }}>
                  {p.homeScore} : {p.awayScore}
                </span>
              )}
            </span>
            <span className="text-[12.5px]" style={{ color: "var(--wc-mute)" }}>
              내 예측 <b style={{ color: "var(--wc-ink-2)" }}>{p.pick}</b>
              {p.isCorrect === true && " · 맞음"}
              {p.isCorrect === false && " · 틀림"}
              {p.isCorrect === null && " · 대기"}
            </span>
          </li>
        ))}
        {slip.picks.length === 0 && (
          <li className="text-[12.5px]" style={{ color: "var(--wc-mute)" }}>
            경기 정보를 불러오지 못했습니다.
          </li>
        )}
      </ul>

      <p className="mt-2.5 text-[12px]" style={{ color: "var(--wc-mute)" }}>
        사용 볼 {slip.stake} · 배당 {Math.round(slip.totalOdds * 100) / 100}
      </p>
    </li>
  )
}

export default async function SeasonResultsPage() {
  const supabase = createServiceRoleClient()

  const { data: event } = await supabase
    .from("events")
    .select("id, status, registration_closes_at")
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

  // 참가 CTA 는 /season 과 같은 판정을 쓴다 — 여기서만 열려 있으면 눌렀을 때 API 가 거부한다
  const registrationOpen =
    event.status !== "draft" &&
    event.status !== "closed" &&
    new Date(event.registration_closes_at) > new Date()

  const joinCta = registrationOpen ? (
    <RaceJoinButton registrationOpen />
  ) : (
    <Link
      href="/season?ref=event"
      className="text-[13.5px] font-bold"
      style={{ color: "var(--wc-burgundy)" }}
    >
      이벤트 안내 보기 →
    </Link>
  )

  if (!userId) {
    return (
      <EmptyShell
        title="로그인하면 내 결과가 보입니다"
        body="개막 기념 승부예측 이벤트에 참가한 계정의 예측만 여기 모입니다. 참가 버튼을 누르면 로그인 창이 먼저 뜹니다."
        action={joinCta}
      />
    )
  }

  const results = await fetchMyRaceSlips(supabase, userId)

  if (!results.registered) {
    return (
      <EmptyShell
        title="아직 이벤트에 참가하지 않았습니다"
        body="참가한 다음에 한 축구 예측부터 순위에 들어갑니다. 참가는 9월 20일까지 언제든 할 수 있습니다."
        action={joinCta}
      />
    )
  }

  const standing = await computeRaceStanding(supabase, userId)
  const settled = results.won + results.lost
  const accuracy = settled > 0 ? Math.round((results.won / settled) * 100) : null

  return (
    <div className="min-h-screen" style={{ background: "var(--wc-paper)" }}>
      <PageBand
        kicker="RESULTS"
        title="내 예측 결과"
        description="개막 기념 승부예측 이벤트에 들어간 내 축구 예측만 모아 봅니다. 참가 전에 한 예측은 여기 없습니다."
      />

      <main className="mx-auto w-full max-w-[880px] space-y-4 px-4 pt-6 pb-16 sm:px-6">
        {/* ② 요약 — 순위 패널과 같은 분모(정산 완료분)를 쓴다 */}
        <section className="rounded-xl p-4" style={cardStyle}>
          <h2 className="text-[15px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
            요약
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <div>
              <p className="text-[20px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                {results.slips.length}
              </p>
              <p className="text-[11px]" style={{ color: "var(--wc-mute)" }}>
                예측 수
              </p>
            </div>
            <div>
              <p className="text-[20px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                {accuracy === null ? "—" : `${accuracy}%`}
              </p>
              <p className="text-[11px]" style={{ color: "var(--wc-mute)" }}>
                적중률 ({results.won}/{settled})
              </p>
            </div>
            <div>
              <p className="text-[20px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                {fmtPoint(results.netPoints)}
              </p>
              <p className="text-[11px]" style={{ color: "var(--wc-mute)" }}>
                점수
              </p>
            </div>
            <div>
              <p className="text-[20px] font-extrabold" style={{ color: "var(--wc-burgundy)" }}>
                {standing.me ? `${standing.me.rank}위` : "—"}
              </p>
              <p className="text-[11px]" style={{ color: "var(--wc-mute)" }}>
                / {standing.participants}명
              </p>
            </div>
          </div>
          {/* 상품 자격 — 점수와 다른 축이라 요약 숫자 아래 따로 놓는다.
              순위 패널(standing-panel.tsx EligibilityBar)과 같은 값·같은 문장을 쓴다 */}
          {standing.me && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--wc-line)" }}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-bold" style={{ color: "var(--wc-ink-2)" }}>
                  상품 자격 · 예측한 날{" "}
                  <b className="tabular-nums" style={{ color: "var(--wc-burgundy)" }}>
                    {Math.min(standing.me.activeDays, MIN_ACTIVE_DAYS)}일
                  </b>{" "}
                  / {MIN_ACTIVE_DAYS}일
                </span>
                <span
                  className="shrink-0 text-[11.5px] font-extrabold"
                  style={{
                    color: standing.me.eligible ? "var(--wc-go, #2f7d5b)" : "var(--wc-mute)",
                  }}
                >
                  {standing.me.eligible
                    ? "자격 있음"
                    : `${MIN_ACTIVE_DAYS - standing.me.activeDays}일 남음`}
                </span>
              </div>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full"
                style={{ background: "var(--wc-soft)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.round((standing.me.activeDays / MIN_ACTIVE_DAYS) * 100))}%`,
                    background: standing.me.eligible
                      ? "var(--wc-go, #2f7d5b)"
                      : "var(--wc-burgundy)",
                  }}
                />
              </div>
              <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
                서로 다른 {MIN_ACTIVE_DAYS}일에 예측해야 상품을 받을 수 있습니다. 순위는 자격과
                상관없이 점수 순으로 매겨집니다.
              </p>
            </div>
          )}
          {results.pending > 0 && (
            <p className="mt-3 text-[12.5px]" style={{ color: "var(--wc-mute)" }}>
              정산 대기 {results.pending}건은 정산이 끝나는 시점에 점수로 들어갑니다.
            </p>
          )}
          {results.cancelled > 0 && (
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--wc-mute)" }}>
              취소된 경기 {results.cancelled}건은 볼을 돌려드렸고 점수에는 영향이 없습니다.
            </p>
          )}
        </section>

        {/* ① 내 예측 결과 목록 */}
        {results.slips.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {results.slips.map((s) => (
              <SlipCard key={s.id} slip={s} />
            ))}
          </ul>
        ) : (
          <section className="rounded-xl p-6 text-center" style={cardStyle}>
            <p className="text-[13.5px]" style={{ color: "var(--wc-mute)" }}>
              참가한 뒤로 한 축구 예측이 아직 없습니다. 하나만 해도 순위표에 반영됩니다.
            </p>
            <p className="mt-4">
              <Link
                href="/prediction?ref=event"
                className="inline-block rounded-lg px-4 py-2.5 text-[13.5px] font-bold"
                style={{ background: "var(--wc-burgundy)", color: "#fff" }}
              >
                오늘 경기 예측하러 가기 →
              </Link>
            </p>
          </section>
        )}

        {/* ③ TOP 5 요약 */}
        <section className="rounded-xl p-4" style={cardStyle}>
          <h2 className="text-[15px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
            순위 상위 5명
          </h2>
          {standing.top.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {standing.top.map((r, i) => (
                <li
                  key={r.userId}
                  className="flex items-center justify-between gap-2 rounded-lg px-3 py-2"
                  style={
                    i === 0
                      ? { background: "color-mix(in srgb, var(--wc-gold) 22%, white)" }
                      : { background: "var(--wc-soft)" }
                  }
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="w-5 shrink-0 text-center text-[13px] font-extrabold"
                      style={{ color: i === 0 ? "var(--wc-gold-deep)" : "var(--wc-mute)" }}
                    >
                      {i + 1}
                    </span>
                    <span
                      className="truncate text-[13.5px] font-bold"
                      style={{ color: "var(--wc-ink)" }}
                    >
                      {r.nickname}
                    </span>
                  </span>
                  <span
                    className="shrink-0 text-[13px] font-extrabold tabular-nums"
                    style={{ color: "var(--wc-ink-2)" }}
                  >
                    {r.points.toLocaleString()}P
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px]" style={{ color: "var(--wc-mute)" }}>
              아직 아무도 예측하지 않았습니다. 지금 예측하면 1위입니다.
            </p>
          )}
        </section>

        <p className="pt-1 text-center">
          <Link
            href="/season?ref=event"
            className="text-[13px] font-bold"
            style={{ color: "var(--wc-burgundy)" }}
          >
            이벤트 안내로 돌아가기 →
          </Link>
        </p>
      </main>
    </div>
  )
}
