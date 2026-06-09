"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useUser, SignInButton } from "@clerk/nextjs"
import { Lock, Check, ShieldCheck } from "lucide-react"

// 아스날 구너 전용 — 그룹/채널 선택 없음 (모두 아스날 팬). 등록 = 약관 동의 한 단계.
const TERMS = [
  "이 이벤트의 예측은 게임 내 사이버 재화(토큰·골드)로만 진행되며, 현금으로 충전·환급·교환되지 않습니다.",
  "적중 보상은 게임 점수로만 지급됩니다 — 현금성 보상이 아닙니다.",
  "따라서 본 이벤트는 사행 행위(도박)가 아닌 적법한 게임 콘텐츠입니다.",
  "한 번 등록하면 참가 정보를 변경할 수 없습니다.",
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
              로그인 후 참가할 수 있어요
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--wc-ink-2)", marginTop: 4 }}>
              gongnori.fan 계정으로 로그인하면 바로 참가를 마칠 수 있습니다.
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
      {/* 참가 약관 카드 */}
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--wc-line)",
          borderRadius: 18,
          padding: "22px 24px",
          boxShadow: "var(--wc-shadow-1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 15,
            fontWeight: 800,
            color: "var(--wc-ink)",
            letterSpacing: "-.01em",
            marginBottom: 14,
          }}
        >
          <ShieldCheck className="h-[18px] w-[18px]" style={{ color: "var(--wc-burgundy)" }} />
          참가 전 꼭 확인하세요
        </div>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 11,
          }}
        >
          {TERMS.map((t) => (
            <li
              key={t}
              style={{
                display: "flex",
                gap: 10,
                fontSize: 14,
                lineHeight: 1.6,
                color: "var(--wc-ink-2)",
              }}
            >
              <span
                aria-hidden
                style={{
                  flexShrink: 0,
                  marginTop: 7,
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "var(--wc-burgundy)",
                }}
              />
              <span>{t}</span>
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
          위 내용을 모두 확인했으며,{" "}
          <b style={{ color: "var(--wc-ink)", fontWeight: 700 }}>동의하고 참가합니다.</b>
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
        {submitting ? "등록 중..." : "동의하고 참가하기"}
      </button>
      <p className="text-center text-[12.5px]" style={{ color: "var(--wc-mute)" }}>
        등록은 무료이며, 한 번 등록하면 변경할 수 없습니다.
      </p>
    </div>
  )
}
