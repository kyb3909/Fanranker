import type { Metadata } from "next"
import Image from "next/image"
import Link from "@/components/ui/app-link"
import { Crown, ArrowRight } from "lucide-react"
import { Countdown } from "@/components/worldcup/countdown"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"

export const metadata: Metadata = {
  title: "월드컵 승부예측 구너 대결",
  description:
    "월드컵 32강 토너먼트 전까지 참가 신청. 최고 점수를 기록한 구너에게 데클런 라이스 사인 유니폼 증정.",
  alternates: { canonical: "/worldcup" },
  openGraph: {
    title: "월드컵 승부예측 구너 대결 | gongnori.fan",
    description: "아스날 구너 전용. 월드컵 토너먼트 최고 점수 1위에 도전하세요.",
    url: "/worldcup",
  },
}

// 등록자 카운트 즉시 반영
export const dynamic = "force-dynamic"

const STEPS = [
  {
    num: "01",
    title: "참가 신청",
    body: "월드컵 32강 토너먼트 전까지 참가 신청을 하세요. 모든 신청은 무료입니다.",
  },
  {
    num: "02",
    title: "경기 예측",
    body: "매일 무료로 받는 볼 10개로 월드컵 경기를 예측하세요. 맞힌 만큼 점수가 쌓입니다.",
  },
  {
    num: "03",
    title: "1위 결정",
    body: "토너먼트 기간 동안 모은 점수로 랭킹을 산정합니다. 최고 득점 구너가 1등 상품을 가져갑니다.",
  },
] as const

export default async function WorldcupPage() {
  // 등록자 카운트 — 소셜 증명
  const supabase = createServiceRoleClient()
  const { count } = await supabase
    .from("event_registrations")
    .select("*", { count: "exact", head: true })
  const regCount = count ?? 0

  // 현재 유저가 이미 등록한 구너인지 — 등록 후엔 CTA 를 "경기 예측하러 가기" 로 전환
  const user = await currentUser()
  let isRegistered = false
  if (user) {
    const { data: reg } = await supabase
      .from("event_registrations")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
    isRegistered = !!reg
  }

  const WC_TS = new Date("2026-06-11T18:00:00+09:00").getTime()
  const dday = Math.ceil(Math.max(0, WC_TS - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <div className="min-h-screen" style={{ background: "var(--wc-paper)" }}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        style={{
          background: "linear-gradient(180deg, var(--wc-card), var(--wc-paper))",
          borderBottom: "1px solid var(--wc-line)",
        }}
      >
        <div
          className="mx-auto flex flex-col items-center px-6 text-center"
          style={{ maxWidth: 760, padding: "56px 24px 52px" }}
        >
          {/* 상단 칩 2개 */}
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
              D-{dday}
            </span>
          </div>

          {/* 타이틀 */}
          <h1
            className="font-title mb-[14px]"
            style={{
              fontSize: "clamp(34px, 5vw, 50px)",
              fontWeight: 900,
              letterSpacing: "-.03em",
              lineHeight: 1.2,
              wordBreak: "keep-all",
            }}
          >
            2026 월드컵 승부예측
            <br />
            <span style={{ color: "var(--wc-burgundy)" }}>구너들의 대결</span>
          </h1>

          {/* 소개문 */}
          <p
            className="mb-[28px] max-w-[520px]"
            style={{
              fontSize: 16,
              lineHeight: 1.7,
              color: "var(--wc-mute)",
              wordBreak: "keep-all",
            }}
          >
            토너먼트 기간 동안 예측으로 점수를 쌓고, 최고 득점 구너에게 드리는 단 하나의{" "}
            <b style={{ color: "var(--wc-ink)" }}>데클런 라이스 친필 사인 유니폼</b>에 도전하세요.
          </p>

          {/* 이벤트 정보 박스 */}
          <div
            className="mb-[28px] w-full overflow-hidden rounded-xl"
            style={{ background: "#fff", border: "1px solid var(--wc-line)", display: "flex" }}
          >
            {[
              ["이벤트 기간", "2026.06.11(목) ~ 결승전 종료"],
              ["참가 신청", "32강 시작 전까지"],
              ["참가 대상", "아스날 구너 누구나"],
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

          {/* 카운트다운 */}
          <div className="wc-cd-light mb-[30px]">
            <Countdown target="2026-06-11T18:00:00+09:00" label="이벤트 시작까지" />
          </div>

          {/* CTA 버튼 행 */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {isRegistered ? (
              <Link href="/worldcup/games" className="wc-hbtn wc-hbtn-primary">
                경기 예측하러 가기 <ArrowRight className="h-[17px] w-[17px]" />
              </Link>
            ) : (
              <Link href="/worldcup/register" className="wc-hbtn wc-hbtn-primary">
                참가 신청하기 <ArrowRight className="h-[17px] w-[17px]" />
              </Link>
            )}
            <Link href="/worldcup/leaderboard" className="wc-hbtn wc-hbtn-ghost">
              구너 현황
            </Link>
          </div>

          {/* 신청 카운트 문구 */}
          <span className="mt-[14px] text-[13px] font-semibold" style={{ color: "var(--wc-mute)" }}>
            {isRegistered ? (
              <span style={{ color: "var(--wc-go)", fontWeight: 700 }}>✓ 참가 신청 완료</span>
            ) : regCount > 0 ? (
              <>
                현재 <b style={{ color: "var(--wc-burgundy)" }}>{regCount.toLocaleString()}명</b>{" "}
                신청 완료
              </>
            ) : (
              "1호 신청자가 되어보세요"
            )}
          </span>
        </div>
      </section>

      {/* ── 경품 안내 ────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1120px] px-6 py-[60px]">
        <div className="mb-[30px] text-center">
          <div className="wc-sec-eb" style={{ marginBottom: 8 }}>
            Prize
          </div>
          <h2
            className="text-[26px] font-extrabold sm:text-[30px]"
            style={{ letterSpacing: "-.03em" }}
          >
            경품 안내
          </h2>
          <p className="mt-[10px] text-[14.5px]" style={{ color: "var(--wc-mute)" }}>
            토너먼트 최고 득점 구너 단 한 명을 위한 상품입니다.
          </p>
        </div>
        <div
          className="mx-auto overflow-hidden rounded-xl"
          style={{
            maxWidth: 900,
            display: "grid",
            gridTemplateColumns: "1.05fr .95fr",
            background: "#fff",
            border: "1px solid var(--wc-line)",
            boxShadow: "var(--wc-shadow-2)",
          }}
        >
          <div className="relative" style={{ minHeight: 290, background: "var(--wc-soft)" }}>
            <span
              className="wc-pill-gold absolute"
              style={{ top: 16, left: 16, zIndex: 2, boxShadow: "var(--wc-shadow-1)" }}
            >
              <Crown className="h-[13px] w-[13px]" /> 1등 경품
            </span>
            <Image
              src="/worldcup/prize-rice-jersey.webp"
              alt="데클런 라이스 사인 유니폼"
              width={1190}
              height={794}
              sizes="(min-width: 1024px) 45vw, 100vw"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>
          <div
            style={{
              padding: "32px 34px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 800,
                letterSpacing: ".1em",
                color: "var(--wc-burgundy)",
                marginBottom: 8,
              }}
            >
              ARSENAL No.41
            </div>
            <div
              className="font-title"
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: "-.02em",
                lineHeight: 1.32,
                marginBottom: 18,
                wordBreak: "keep-all",
              }}
            >
              데클런 라이스
              <br />
              친필 사인 유니폼
            </div>
            {[
              ["경품", "친필 사인 유니폼 (정품, 액자 포함)"],
              ["인원", "최종 랭킹 1위 구너 1명"],
              ["발표", "결승전 종료 후 7일 이내 · 담벼락 공지"],
              ["배송", "국내 무료 배송"],
            ].map(([k, v], i) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  gap: 16,
                  padding: "11px 0",
                  borderTop: i === 0 ? "1px solid var(--wc-line-2)" : "1px solid var(--wc-line)",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 40,
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--wc-mute-2)",
                  }}
                >
                  {k}
                </span>
                <span
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    color: "var(--wc-mute)",
                    fontWeight: 500,
                    wordBreak: "keep-all",
                  }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 진행 방식 ────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1120px] px-6 pb-3">
        <div className="mb-6">
          <div className="wc-sec-eb" style={{ marginBottom: 8 }}>
            How it works
          </div>
          <h2
            className="text-[26px] font-extrabold sm:text-[30px]"
            style={{ letterSpacing: "-.03em" }}
          >
            진행 방식
          </h2>
        </div>
        <div className="grid gap-[18px] sm:grid-cols-3">
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

      {/* ── 사전 등록 CTA 밴드 ───────────────────────────────── */}
      <section className="mx-auto max-w-[1120px] px-6 pt-10 pb-14">
        <div className="wc-cta-band">
          <div aria-hidden className="wc-cta-orb" />
          <div className="relative flex max-w-[560px] flex-col items-start gap-[13px]">
            <div
              className="text-[12.5px] font-extrabold uppercase"
              style={{ letterSpacing: ".14em", color: "rgba(255,255,255,.72)" }}
            >
              {isRegistered ? "You're in" : "Pre-register"}
            </div>
            <h2
              className="text-[21px] font-extrabold text-white sm:text-[25px]"
              style={{ letterSpacing: "-.03em", lineHeight: 1.3 }}
            >
              {isRegistered
                ? "참가 신청 완료 — 경기가 열리면 예측하세요"
                : "지금 신청하고 구너 대결에 합류하세요"}
            </h2>
            <div className="text-[14px]" style={{ color: "rgba(255,255,255,.82)" }}>
              {isRegistered ? (
                "경기가 열리면 결과를 예측하고 점수를 쌓으세요."
              ) : (
                <>
                  신청은 무료 · 한 번 신청하면 변경 불가
                  {regCount > 0 && ` · 현재 ${regCount.toLocaleString()}명 신청 완료`}
                </>
              )}
            </div>
          </div>
          <Link
            href={isRegistered ? "/worldcup/games" : "/worldcup/register"}
            className="wc-cta-btn"
          >
            {isRegistered ? "경기 예측하러 가기" : "참가 신청하기"}{" "}
            <ArrowRight className="h-[18px] w-[18px]" />
          </Link>
        </div>
        <div className="mt-[26px] text-center text-[13px]" style={{ color: "var(--wc-mute)" }}>
          이 이벤트는 아스날 구너들만의 예측 대결입니다 ·{" "}
          <span style={{ fontStyle: "italic", color: "var(--wc-ink-2)" }}>
            Victoria Concordia Crescit
          </span>
        </div>
      </section>
    </div>
  )
}
