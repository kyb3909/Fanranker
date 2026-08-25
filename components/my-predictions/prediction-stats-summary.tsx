"use client"

import { type Stats } from "./prediction-types"

// 등급: 적중률(끝난 경기 기준) 기반 (순수 조회 — 문장 아님)
function gradeOf(rate: number): { letter: string; low: boolean } {
  if (rate >= 0.8) return { letter: "S", low: false }
  if (rate >= 0.65) return { letter: "A", low: false }
  if (rate >= 0.5) return { letter: "B", low: false }
  if (rate >= 0.35) return { letter: "C", low: true }
  return { letter: "D", low: true }
}

// 칭호: 축구 단일 (나중에 카테고리별 누적 통계로 확장). 순수 조회 — 상황별 문장 아님.
function titleOf(rate: number, settled: number): { name: string; role: string } {
  if (settled < 3) return { name: "축린이", role: "이제 시작하는 축구팬" }
  if (rate >= 0.8) return { name: "축신", role: "축구 예측의 신" }
  if (rate >= 0.65) return { name: "축잘알", role: "축구 예측 전문가" }
  if (rate >= 0.5) return { name: "축중수", role: "보는 눈이 제법 있는" }
  return { name: "축린이", role: "성장 중인 축구팬" }
}

/**
 * 게임 성적표 카드 — 적중률 메달 + 등급 도장 + (축구 이벤트면) 칭호 + 통계행 흡수.
 * 모든 텍스트는 숫자/등급/칭호 "조회값"뿐 (상황별 코멘트 없음).
 * eventSlug 있으면(월드컵=축구) 칭호 노출, 없으면(일반·종목혼재) 고정 헤드라인.
 */
export function PredictionStatsSummary({ stats, eventSlug }: { stats: Stats; eventSlug?: string }) {
  const total = stats.totalPredictions
  const settled = Number(stats.settled) || 0
  const winCount = stats.correctPredictions
  const pending = Math.max(0, total - settled)
  const hasSettled = settled > 0
  const rate = hasSettled ? winCount / settled : 0

  const earned = Number(stats.totalPointsEarned)
  const used = Number(stats.totalPointsUsed)
  const net = earned - used
  const scoreText = `${net >= 0 ? "+" : ""}${net.toFixed(2)}`
  const roiPct = used > 0 ? (net / used) * 100 : null
  const roiText = roiPct === null ? "—" : `${roiPct >= 0 ? "+" : ""}${roiPct.toFixed(1)}%`

  const grade = gradeOf(rate)
  // 끝난 경기 0건이면 등급 미정 → 중립(버건디) 톤으로 안전 표시
  const low = hasSettled ? grade.low : false
  const gradeLetter = hasSettled ? grade.letter : "—"
  const rateText = hasSettled ? `${Math.round(rate * 100)}%` : "—"

  const football = Boolean(eventSlug)
  const title = football ? titleOf(rate, settled) : null

  // ── 톤별 색 ──
  const cardBg = low
    ? "linear-gradient(165deg,#3b3035,#5b4a50 70%)"
    : "linear-gradient(165deg, var(--wc-burgundy-deep), var(--wc-burgundy) 70%)"
  const medalBg = low
    ? "radial-gradient(circle at 38% 32%, #ffffff, #d8d3ca 55%, #aab1bb)"
    : "radial-gradient(circle at 38% 32%, #fff5da, var(--wc-gold) 62%, var(--wc-gold-deep))"
  const medalInk = low ? "#3b3035" : "#5b3d00"
  const accent = low ? "#e8e5e0" : "var(--wc-gold)" // 도장 + 양수 통계 강조
  const roiColor = !low && roiPct !== null && roiPct >= 0 ? accent : "#fff"
  const scoreColor = !low && net >= 0 ? accent : "#fff"

  const stats4 = [
    { label: "총 예측", value: String(total), color: "#fff" },
    { label: "맞힌 경기", value: `${winCount} / ${settled}`, color: "#fff" },
    { label: "수익률", value: roiText, color: roiColor },
    { label: "획득 점수", value: scoreText, color: scoreColor },
  ]

  return (
    <div
      className="mb-6 overflow-hidden"
      style={{
        position: "relative",
        background: cardBg,
        color: "#fff",
        borderRadius: 18,
        boxShadow: "var(--wc-shadow-2)",
      }}
    >
      {/* 점 텍스처 (미세) */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          opacity: 0.1,
          pointerEvents: "none",
        }}
      />

      {/* 상단: 메달 · 본문 · 등급 도장 */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: "clamp(12px, 3.5vw, 18px)",
          padding: "clamp(16px, 4vw, 22px)",
        }}
      >
        {/* 적중률 메달 */}
        <div
          style={{
            flexShrink: 0,
            width: "clamp(92px, 26vw, 118px)",
            height: "clamp(92px, 26vw, 118px)",
            borderRadius: "50%",
            background: medalBg,
            color: medalInk,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "inset 0 2px 6px rgba(255,255,255,0.55), 0 4px 12px rgba(0,0,0,0.25)",
          }}
        >
          <div
            style={{
              width: "84%",
              height: "84%",
              borderRadius: "50%",
              border: "2px dashed rgba(0,0,0,0.18)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontSize: "clamp(24px, 7vw, 30px)",
                fontWeight: 900,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {rateText}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, marginTop: 4, opacity: 0.78 }}>
              적중률
            </span>
          </div>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.82, marginBottom: 6 }}>
            {hasSettled ? `${grade.letter}등급 · ` : ""}끝난 경기 {settled} · 대기 {pending}
          </div>
          <h2
            style={{
              fontSize: "clamp(22px, 6.2vw, 30px)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              margin: 0,
              wordBreak: "keep-all",
            }}
          >
            {football && title ? `⚽ ${title.name}` : "내 예측 성적"}
          </h2>
          {football && title && (
            <div style={{ fontSize: 13, opacity: 0.82, marginTop: 4 }}>{title.role}</div>
          )}
        </div>

        {/* 등급 도장 */}
        <div
          style={{
            flexShrink: 0,
            width: "clamp(64px, 19vw, 84px)",
            height: "clamp(64px, 19vw, 84px)",
            borderRadius: "50%",
            border: `2.5px solid ${accent}`,
            color: accent,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            transform: "rotate(-14deg)",
            opacity: hasSettled ? 1 : 0.6,
          }}
        >
          <span style={{ fontSize: "clamp(26px, 8vw, 34px)", fontWeight: 900, lineHeight: 1 }}>
            {gradeLetter}
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", marginTop: 2 }}>
            GRADE
          </span>
        </div>
      </div>

      {/* 하단 통계행 (카드 흡수) */}
      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          borderTop: "1px solid rgba(255,255,255,0.16)",
        }}
      >
        {stats4.map((c, i) => (
          <div
            key={c.label}
            style={{
              padding: "14px 6px",
              textAlign: "center",
              borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.12)" : "none",
            }}
          >
            <div
              style={{
                fontSize: "clamp(14px, 4.2vw, 18px)",
                fontWeight: 800,
                color: c.color,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1.2,
              }}
            >
              {c.value}
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
