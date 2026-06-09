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
    "월드컵 32강 전까지 사전 등록. 최고 점수를 기록한 구너에게 데클런 라이스 사인 유니폼 증정.",
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
    title: "사전 등록",
    body: "월드컵 32강 전까지 아스날 구너로 등록하세요. 등록은 무료이며, 한 번 등록하면 변경할 수 없습니다.",
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

  return (
    <div className="min-h-screen" style={{ background: "#f6f7f9" }}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-[1120px] items-center gap-10 px-6 pt-12 pb-14 lg:grid-cols-[1.04fr_.96fr] lg:gap-[52px]">
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-2.5">
            <span className="wc-pill-wine">WORLD CUP 2026</span>
            <span className="text-[13px] font-semibold" style={{ color: "var(--wc-mute)" }}>
              아스날 구너 전용
            </span>
          </div>
          <h1
            className="mb-[18px] text-[34px] font-extrabold sm:text-[52px]"
            style={{ letterSpacing: "-.035em", lineHeight: 1.12 }}
          >
            월드컵 승부예측,
            <br />
            <span style={{ color: "var(--wc-burgundy)" }}>구너들의 대결.</span>
          </h1>
          <p
            className="mb-[30px] max-w-[480px] text-[15.5px] sm:text-[16.5px]"
            style={{ lineHeight: 1.66, color: "var(--wc-ink-2)" }}
          >
            32강 전까지 구너로 등록하고, 토너먼트 내내 예측으로 점수를 쌓으세요. 최고 점수를 기록한
            단 한 명에게{" "}
            <b style={{ color: "var(--wc-ink)", fontWeight: 700 }}>데클런 라이스 사인 유니폼</b>을
            드립니다.
          </p>

          <div className="wc-cd-light mb-[30px]">
            <Countdown target="2026-06-11T18:00:00+09:00" label="이벤트 시작까지" />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isRegistered ? (
              <Link href="/worldcup/games" className="wc-hbtn wc-hbtn-primary">
                경기 예측하러 가기 <ArrowRight className="h-[17px] w-[17px]" />
              </Link>
            ) : (
              <Link href="/worldcup/register" className="wc-hbtn wc-hbtn-primary">
                사전 등록하기 <ArrowRight className="h-[17px] w-[17px]" />
              </Link>
            )}
            <Link href="/worldcup/leaderboard" className="wc-hbtn wc-hbtn-ghost">
              구너 현황
            </Link>
            <span className="text-[13px] font-semibold" style={{ color: "var(--wc-mute)" }}>
              {isRegistered ? (
                <span style={{ color: "var(--wc-go)", fontWeight: 700 }}>✓ 참가 완료</span>
              ) : regCount > 0 ? (
                <>
                  현재 <b style={{ color: "var(--wc-burgundy)" }}>{regCount.toLocaleString()}명</b>{" "}
                  등록 중
                </>
              ) : (
                "1호 등록의 주인공이 되세요"
              )}
            </span>
          </div>
        </div>

        {/* 1등 상품 카드 — 데클런 라이스 사인 유니폼 */}
        <figure className="wc-prize-card">
          <div
            className="relative"
            style={{
              background: "linear-gradient(180deg,#FAFAFA,#F1F2F4)",
              padding: "14px 14px 0",
            }}
          >
            <span
              className="wc-pill-gold absolute"
              style={{ top: 16, left: 16, zIndex: 2, boxShadow: "var(--wc-shadow-1)" }}
            >
              <Crown className="h-[13px] w-[13px]" /> 1등 상품
            </span>
            <Image
              src="/worldcup/prize-rice-jersey.webp"
              alt="데클런 라이스 사인 유니폼"
              width={1190}
              height={794}
              priority
              sizes="(min-width: 1024px) 45vw, 100vw"
              style={{
                width: "100%",
                aspectRatio: "1190 / 794",
                objectFit: "cover",
                borderRadius: "12px 12px 0 0",
              }}
            />
          </div>
          <div style={{ padding: "18px 22px 22px", borderTop: "1px solid var(--wc-line)" }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div
                  className="text-[18px] font-extrabold"
                  style={{ letterSpacing: "-.02em", lineHeight: 1.25 }}
                >
                  데클런 라이스 사인 유니폼
                </div>
                <div className="mt-1 text-[13.5px]" style={{ color: "var(--wc-ink-2)" }}>
                  친필 사인 · 정품 · 액자 증정
                </div>
              </div>
              <span
                className="shrink-0 text-[13px] font-bold tabular-nums"
                style={{
                  color: "var(--wc-mute)",
                  background: "#F0F2F5",
                  borderRadius: 8,
                  padding: "6px 10px",
                }}
              >
                #41
              </span>
            </div>
          </div>
        </figure>
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
                ? "이미 참가 중 — 월드컵 경기를 예측하세요"
                : "지금 등록하고 구너 대결에 합류하세요"}
            </h2>
            <div className="text-[14px]" style={{ color: "rgba(255,255,255,.82)" }}>
              {isRegistered ? (
                "경기가 열리면 예측 슬립을 작성해 점수를 쌓으세요."
              ) : (
                <>
                  등록은 무료 · 한 번 등록하면 변경 불가
                  {regCount > 0 && ` · 현재 ${regCount.toLocaleString()}명 등록 중`}
                </>
              )}
            </div>
          </div>
          <Link
            href={isRegistered ? "/worldcup/games" : "/worldcup/register"}
            className="wc-cta-btn"
          >
            {isRegistered ? "경기 예측하러 가기" : "사전 등록하기"}{" "}
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
