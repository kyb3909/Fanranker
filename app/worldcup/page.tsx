import type { Metadata } from "next"
import Image from "next/image"
import Link from "@/components/ui/app-link"
import { Crown, ArrowRight } from "lucide-react"
import { Countdown } from "@/components/worldcup/countdown"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"

export const metadata: Metadata = {
  title: "월드컵 승부예측 — 구너들의 대결",
  description:
    "월드컵 토너먼트 전까지 참가 신청하세요. 최종 1위 구너에게 데클런 라이스 친필 사인 유니폼을 드립니다.",
  alternates: { canonical: "/worldcup" },
  openGraph: {
    title: "월드컵 승부예측 — 구너들의 대결 | gongnori.fan",
    description: "아스날 팬 전용 월드컵 승부예측. 토너먼트 최고 점수 1위에 도전하세요.",
    url: "/worldcup",
  },
}

// 등록자 카운트 즉시 반영
export const dynamic = "force-dynamic"

const NOTICES = [
  "본 이벤트는 gongnori.fan 회원 중 아스날 구너를 대상으로 진행됩니다.",
  "참가 신청은 2026.06.29(월) 새벽 4시까지 가능하며, 신청 후에는 취소·변경이 불가합니다.",
  "정식 점수 집계와 랭킹 반영은 32강 토너먼트부터 시작됩니다.",
  "예측 점수는 무료 볼을 사용한 승부예측 결과를 기준으로 자동 집계됩니다.",
  "부정한 방법(다중 계정 등)으로 참여한 경우 순위에서 제외될 수 있습니다.",
  "경품 이미지는 실제 상품과 다소 차이가 있을 수 있습니다.",
]

const STEPS = [
  {
    num: "01",
    title: "참가 신청",
    body: "토너먼트 시작 전까지 참가 신청을 마치세요.",
  },
  {
    num: "02",
    title: "경기 예측",
    body: "당일만 사용 가능한 무료 볼 10개를 분배해서 경기 결과를 예측해보세요.",
  },
  {
    num: "03",
    title: "1위 결정",
    body: "토너먼트 기간 동안 모은 점수로 랭킹을 산정합니다. 최종 1위가 상품을 가져갑니다.",
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

  const WC_TS = new Date("2026-06-29T04:00:00+09:00").getTime()
  const dday = Math.ceil(Math.max(0, WC_TS - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <div className="min-h-screen" style={{ background: "var(--wc-paper)" }}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[840px] px-4 pt-8 sm:px-6">
        <div className="wc-panel flex flex-col items-center text-center">
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
            아스날 팬들을 위한
            <br />
            <span style={{ color: "var(--wc-burgundy)" }}>2026 월드컵 승부예측 이벤트</span>
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
            토너먼트 기간 동안 경기 결과를 예측하고 점수를 쌓아보세요. 최종 1위에게는{" "}
            <b style={{ color: "var(--wc-ink)" }}>데클런 라이스 친필 사인 유니폼</b>이 주어집니다.
          </p>

          {/* 이벤트 정보 박스 */}
          <div
            className="mb-[28px] w-full overflow-hidden rounded-xl"
            style={{ background: "#fff", border: "1px solid var(--wc-line)", display: "flex" }}
          >
            {[
              ["참가 신청", "~6.29(월) 새벽 4시"],
              ["이벤트 기간", "6.29(월) 새벽 4시 ~ 결승전 종료"],
              ["참가 대상", "아스날 팬 누구나"],
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

          {/* 정식 집계 시점 — 못박기 */}
          <div
            className="mb-[28px] w-full rounded-xl text-left"
            style={{
              background: "var(--wc-wine-tint)",
              border: "1px solid rgba(150,30,55,.2)",
              padding: "14px 16px",
            }}
          >
            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.65,
                color: "var(--wc-ink-2)",
                wordBreak: "keep-all",
              }}
            >
              <b style={{ color: "var(--wc-burgundy)", fontWeight: 800 }}>
                정식 점수 집계와 랭킹 반영은 32강 토너먼트부터
              </b>{" "}
              시작됩니다. 지금 미리 신청해두시면 32강부터 바로 참여하실 수 있어요.
            </p>
          </div>

          {/* 카운트다운 */}
          <div className="wc-cd-light mb-[30px]">
            <Countdown target="2026-06-29T04:00:00+09:00" label="이벤트 시작까지" />
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
            {isRegistered && (
              <Link href="/worldcup/my-predictions" className="wc-hbtn wc-hbtn-ghost">
                내 예측 기록
              </Link>
            )}
            <Link href="/worldcup/leaderboard" className="wc-hbtn wc-hbtn-ghost">
              리더보드
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

          {/* 진행 방식 — hero 카드에 통합 (경품 안내 위) */}
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

          {/* 경품 안내 — hero 카드에 통합 */}
          <div
            className="mt-[34px] w-full pt-[30px]"
            style={{ borderTop: "1px solid var(--wc-line)" }}
          >
            <div className="mb-[24px] text-center">
              <div className="wc-sec-eb" style={{ marginBottom: 8 }}>
                Prize
              </div>
              <h2
                className="text-[24px] font-extrabold sm:text-[28px]"
                style={{ letterSpacing: "-.03em" }}
              >
                경품 안내
              </h2>
              <p className="mt-[10px] text-[14.5px]" style={{ color: "var(--wc-mute)" }}>
                토너먼트 최고 점수를 기록한 단 한 명에게 드리는 상품입니다.
              </p>
            </div>
            <div
              className="grid w-full grid-cols-1 overflow-hidden rounded-xl text-left sm:grid-cols-[1.05fr_.95fr]"
              style={{ border: "1px solid var(--wc-line)" }}
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
                  ["경품", "친필 사인 유니폼 (정품, 액자 미포함)"],
                  ["인원", "최종 랭킹 1위 1명"],
                  ["발표", "결승전 종료 후 7일 이내 · 담벼락 공지"],
                  ["배송", "국내 무료 배송"],
                ].map(([k, v], i) => (
                  <div
                    key={k}
                    style={{
                      display: "flex",
                      gap: 16,
                      padding: "11px 0",
                      borderTop:
                        i === 0 ? "1px solid var(--wc-line-2)" : "1px solid var(--wc-line)",
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
        이 이벤트는 아스날 구너들만의 예측 대결입니다 ·{" "}
        <span style={{ fontStyle: "italic", color: "var(--wc-ink-2)" }}>
          Victoria Concordia Crescit
        </span>
      </div>
    </div>
  )
}
