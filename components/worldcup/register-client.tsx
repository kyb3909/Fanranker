"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useUser, SignInButton } from "@clerk/nextjs"
import { Lock, Check } from "lucide-react"

// 아스날 구너 전용 — 그룹/채널 선택 없음. 등록 = 규칙 확인 + 참가 한 단계.
// 방어적 고지 대신, 게임이 어떻게 굴러가는지 친근하게 설명한다.
const RULES = [
  {
    title: "매일 볼 10개, 공짜로",
    body: "매일 아침 볼 10개가 들어와요. 충전도 결제도 없이, 그 볼로만 참여합니다.",
  },
  {
    title: "예측하고 점수 쌓기",
    body: "볼로 월드컵 경기 결과를 맞혀보세요. 적중할 때마다 점수가 차곡차곡 쌓입니다.",
  },
  {
    title: "최고 점수 구너가 우승",
    body: "토너먼트가 끝날 때 점수가 가장 높은 구너 한 명이 데클런 라이스 사인 유니폼을 가져가요.",
  },
]

export function RegisterClient() {
  const router = useRouter()
  const { isSignedIn, isLoaded } = useUser()
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isLoaded) {
    return (
      <div className="h-64 animate-pulse rounded-2xl" style={{ background: "var(--wc-soft)" }} />
    )
  }

  // 비로그인 — 로그인 안내 카드
  if (!isSignedIn) {
    return (
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--wc-line)",
          borderRadius: 18,
          padding: 24,
          boxShadow: "var(--wc-shadow-1)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Lock
            className="h-5 w-5 shrink-0"
            style={{ color: "var(--wc-burgundy)", marginTop: 2 }}
          />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--wc-ink)" }}>
              로그인 후 참가 신청할 수 있어요
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--wc-ink-2)", marginTop: 4 }}>
              gongnori.fan 계정으로 로그인하면 바로 참가 신청을 마칠 수 있습니다.
            </p>
          </div>
        </div>
        <SignInButton mode="modal">
          <button
            type="button"
            className="wc-hbtn wc-hbtn-primary"
            style={{ alignSelf: "flex-start" }}
          >
            로그인하기
          </button>
        </SignInButton>
      </div>
    )
  }

  const handleSubmit = async () => {
    if (!agreed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/event/worldcup/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_slug: "gooner" }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        already_registered?: boolean
      }
      // 등록 완료 또는 이미 등록 → 바로 월드컵 경기/예측 화면으로
      if (res.ok || json.already_registered) {
        router.push("/worldcup/games")
        return
      }
      setError(json.error || "등록 중 오류가 발생했습니다.")
      setSubmitting(false)
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.")
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* 게임 규칙 — 친근하게 설명 */}
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--wc-line)",
          borderRadius: 18,
          padding: "22px 24px 24px",
          boxShadow: "var(--wc-shadow-1)",
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "var(--wc-ink)",
            letterSpacing: "-.01em",
            marginBottom: 16,
          }}
        >
          규칙은 간단해요
        </div>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {RULES.map((r, i) => (
            <li key={r.title} style={{ display: "flex", gap: 13 }}>
              <span
                aria-hidden
                style={{
                  flexShrink: 0,
                  width: 26,
                  height: 26,
                  borderRadius: 9,
                  background: "var(--wc-wine-tint)",
                  color: "var(--wc-burgundy)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                {i + 1}
              </span>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--wc-ink)" }}>
                  {r.title}
                </div>
                <p
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    color: "var(--wc-ink-2)",
                    marginTop: 2,
                  }}
                >
                  {r.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* 동의 체크박스 */}
      <button
        type="button"
        onClick={() => setAgreed((a) => !a)}
        aria-pressed={agreed}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 11,
          width: "100%",
          textAlign: "left",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 2,
        }}
      >
        <span
          style={{
            flexShrink: 0,
            width: 22,
            height: 22,
            borderRadius: 7,
            border: `1.5px solid ${agreed ? "var(--wc-burgundy)" : "#cfd2d7"}`,
            background: agreed ? "var(--wc-burgundy)" : "#fff",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all .12s",
          }}
        >
          {agreed && <Check className="h-[13px] w-[13px]" />}
        </span>
        <span style={{ fontSize: 14, lineHeight: 1.55, color: "var(--wc-ink-2)" }}>
          규칙을 확인했고,{" "}
          <b style={{ color: "var(--wc-ink)", fontWeight: 700 }}>구너로 참가 신청할게요.</b>
        </span>
      </button>

      {error && (
        <div
          role="alert"
          className="rounded-xl border p-3 text-[13px]"
          style={{
            background: "rgba(192, 58, 58, 0.06)",
            borderColor: "var(--wc-down)",
            color: "var(--wc-down)",
          }}
        >
          {error}
        </div>
      )}

      <button
        type="button"
        className="wc-hbtn wc-hbtn-primary"
        disabled={!agreed || submitting}
        onClick={handleSubmit}
        style={{
          width: "100%",
          height: 54,
          fontSize: 16,
          opacity: agreed && !submitting ? 1 : 0.5,
          cursor: agreed && !submitting ? "pointer" : "not-allowed",
          boxShadow: agreed ? "0 6px 16px rgba(158,28,48,.22)" : "none",
        }}
      >
        {submitting ? "신청 처리 중..." : "참가 신청하기"}
      </button>
      <p className="text-center text-[12.5px]" style={{ color: "var(--wc-mute)" }}>
        현금이 오가지 않는 무료 이벤트예요. 참가 신청은 한 번만 가능하고, 이후엔 변경할 수 없어요.
      </p>
    </div>
  )
}
