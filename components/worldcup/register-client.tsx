"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useUser, SignInButton } from "@clerk/nextjs"
import { Lock } from "lucide-react"

const GROUPS = [
  {
    slug: "gooner",
    name: "Gooner",
    clubKor: "아스날",
    color: "#EF0107",
    youtuber: "아스날 채널",
    motto: "Victoria Concordia Crescit",
  },
  {
    slug: "kop",
    name: "Kopite",
    clubKor: "리버풀",
    color: "#C8102E",
    youtuber: "리버풀 채널",
    motto: "You'll Never Walk Alone",
  },
  {
    slug: "blues",
    name: "Blue",
    clubKor: "첼시",
    color: "#034694",
    youtuber: "첼시 채널",
    motto: "Pride of London",
  },
] as const

export function RegisterClient() {
  const router = useRouter()
  const { isSignedIn, isLoaded } = useUser()
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isLoaded) {
    return <div className="bg-muted h-64 animate-pulse rounded-lg" />
  }

  /** 비로그인 분기 — 베이스라인 보존 (시안엔 없는 분기). 시안 .reg-warn 톤만 차용. */
  if (!isSignedIn) {
    return (
      <div className="space-y-6">
        <div className="wc-reg-signin">
          <div className="wc-reg-signin-row">
            <Lock className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--wc-burgundy)" }} />
            <div>
              <div className="wc-reg-signin-h">로그인 후 등록 가능</div>
              <p className="wc-reg-signin-b">
                gongnori.fan 계정으로 로그인하면 그룹을 선택하고 등록을 마칠 수 있어요.
              </p>
            </div>
          </div>
          <SignInButton mode="modal">
            <button type="button" className="wc-btn-on-warn">
              로그인하기
            </button>
          </SignInButton>
        </div>

        {/* 그룹 미리보기 (비활성) — 베이스라인 분기 보존 */}
        <div className="wc-reg-grid">
          {GROUPS.map((g) => (
            <div
              key={g.slug}
              className="wc-reg-card disabled"
              style={{ ["--gp" as string]: g.color } as React.CSSProperties}
            >
              <span aria-hidden className="wc-reg-card-bg" />
              <div className="wc-reg-card-top">
                <div>
                  <div className="wc-reg-card-name">{g.name}</div>
                  <div className="wc-reg-card-sub">{g.clubKor} 팬덤</div>
                </div>
                <Lock className="h-5 w-5" style={{ color: "var(--wc-mute-2)" }} />
              </div>
              <p className="wc-reg-card-motto">{g.motto}</p>
              <p className="wc-reg-card-foot">유입 · {g.youtuber}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-[12px]" style={{ color: "var(--wc-mute)" }}>
          로그인하면 그룹을 선택하고 등록을 진행할 수 있습니다.
        </p>
      </div>
    )
  }

  const handleSubmit = async () => {
    if (!selectedGroup || !agreed) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/event/worldcup/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_slug: selectedGroup }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        already_registered?: boolean
      }
      if (!res.ok) {
        // 이미 등록된 경우 done 페이지로 이동 (사용자에게 자연스러움)
        if (json.already_registered) {
          router.push(`/worldcup/register/done?group=${selectedGroup}`)
          return
        }
        setError(json.error || "등록 중 오류가 발생했습니다.")
        setSubmitting(false)
        return
      }
      router.push(`/worldcup/register/done?group=${selectedGroup}`)
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.")
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Z2.4 참가 규칙 */}
      <div className="wc-reg-rules">
        <div className="wc-reg-rules-h">
          <span aria-hidden>★</span>
          참가 규칙
        </div>
        <ul className="wc-reg-rules-list">
          <li className="alert">
            <span>
              <strong>한 번 선택한 그룹은 절대 변경할 수 없습니다.</strong> 신중하게 골라주세요.
            </span>
          </li>
          <li>
            <span>일반 베팅 시스템과 동일한 룰. 보유한 토큰·골드로 월드컵 경기에 베팅합니다.</span>
          </li>
          <li>
            <span>
              월드컵 기간 적중률·수익률로 그룹 내 1위 결정 → <strong>상품 증정</strong>.
            </span>
          </li>
          <li>
            <span>그룹 평균 적중률·수익률로 &quot;이번 시즌의 축잘알 팬덤&quot;을 선정.</span>
          </li>
        </ul>
      </div>

      {/* Z2.5 그룹 선택 카드 */}
      <div className="wc-reg-grid">
        {GROUPS.map((g) => {
          const isSelected = selectedGroup === g.slug
          return (
            <button
              key={g.slug}
              type="button"
              onClick={() => setSelectedGroup(g.slug)}
              className={`wc-reg-card ${isSelected ? "on" : ""}`}
              style={{ ["--gp" as string]: g.color } as React.CSSProperties}
              aria-pressed={isSelected}
            >
              <span aria-hidden className="wc-reg-card-bg" />
              <div className="wc-reg-card-top">
                <div>
                  <div className="wc-reg-card-name">{g.name}</div>
                  <div className="wc-reg-card-sub">{g.clubKor} 팬덤</div>
                </div>
                <span aria-hidden className={`wc-radio ${isSelected ? "on" : ""}`}>
                  {isSelected ? "✓" : ""}
                </span>
              </div>
              <p className="wc-reg-card-motto">{g.motto}</p>
              <p className="wc-reg-card-foot">유입 · {g.youtuber}</p>
            </button>
          )
        })}
      </div>

      {/* Z2.6 동의 체크박스 */}
      <label className="wc-reg-check">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          한 번 선택한 그룹은 변경할 수 없으며, 1위 결정은 그룹 내 적중률·수익률 기준으로 산정됨에
          동의합니다.
        </span>
      </label>

      {/* 에러 메시지 */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border p-3 text-[13px]"
          style={{
            background: "rgba(192, 58, 58, 0.06)",
            borderColor: "var(--wc-down)",
            color: "var(--wc-down)",
          }}
        >
          {error}
        </div>
      )}

      {/* Z2.7 등록 CTA */}
      <button
        type="button"
        className="wc-reg-cta"
        disabled={!selectedGroup || !agreed || submitting}
        onClick={handleSubmit}
      >
        {submitting ? "등록 중..." : "등록 완료"}
      </button>
    </div>
  )
}
