"use client"

import Link from "next/link"
import { useState } from "react"
import { DRAFT_GAMES, type DraftCatalogEntry } from "@/lib/draft/games-catalog"

import "@/app/games/draft/draft-tokens.css"

// 종목 라벨 — 활성 게임이 있는 분류만 필터로 동적 노출.
const SPORT_LABELS: Record<DraftCatalogEntry["sport"], string> = {
  football: "축구",
  basketball: "농구",
  strategy: "전략",
  culture: "컬처",
  cycling: "사이클",
}

// 상단 배지 — HOT/NEW 만 (SOON 은 푸터에서 "COMING SOON" 으로 처리).
// 아웃라인 텍스트 배지: HOT=버건디 / NEW=ink. 컬러 fill 없음.
function GameBadge({ badge }: { badge: "HOT" | "NEW" }) {
  const color = badge === "HOT" ? "var(--draft-burgundy)" : "var(--draft-ink)"
  return (
    <span
      style={{
        color,
        border: "1px solid currentColor",
        borderRadius: 4,
        padding: "1px 5px",
        fontWeight: 800,
        fontSize: 9,
        letterSpacing: "0.1em",
        lineHeight: 1.5,
      }}
    >
      {badge}
    </span>
  )
}

function GameCard({ game }: { game: DraftCatalogEntry }) {
  const [hover, setHover] = useState(false)
  const dim = !game.active
  const topBadge = game.badge === "HOT" || game.badge === "NEW" ? game.badge : null

  const cardInner = (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="draft-card"
      style={{
        padding: 20,
        borderRadius: 12,
        transition: "transform .18s, box-shadow .18s",
        transform: hover && !dim ? "translateY(-2px)" : "none",
        // 중립 그림자 + 1px 라인만 (컬러 글로우 금지)
        boxShadow:
          hover && !dim
            ? "0 6px 18px rgba(24,18,21,.08), 0 0 0 1px var(--draft-rule)"
            : "var(--draft-shadow-1)",
        opacity: dim ? 0.55 : 1,
        cursor: dim ? "not-allowed" : "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 11,
        minHeight: 198,
      }}
    >
      {/* 상단행: 이모지(좌, plain) + HOT/NEW 배지(우) */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <span style={{ fontSize: 24, lineHeight: 1, filter: "saturate(0.85)" }}>{game.emoji}</span>
        {topBadge && <GameBadge badge={topBadge} />}
      </div>

      <h3 style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em" }}>{game.name}</h3>

      <p
        style={{
          fontSize: 13,
          color: "var(--draft-ink-soft)",
          lineHeight: 1.55,
          wordBreak: "keep-all",
          flex: 1,
        }}
      >
        {game.blurb}
      </p>

      {/* 얇은 구분선 */}
      <div className="draft-rule" />

      {/* 스탯행 — tabular-nums, 값만 ink+800. 각 span nowrap/keep-all (단어 중간 줄바꿈 방지) */}
      <div
        className="draft-num"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          fontSize: 12,
          color: "var(--draft-mute)",
          fontWeight: 600,
        }}
      >
        <span style={{ whiteSpace: "nowrap", wordBreak: "keep-all" }}>
          <b style={{ color: "var(--draft-ink)", fontWeight: 800 }}>{game.rosterSize}</b>인
        </span>
        <span style={{ color: "var(--draft-rule)" }}>│</span>
        <span style={{ whiteSpace: "nowrap", wordBreak: "keep-all" }}>
          <b style={{ color: "var(--draft-ink)", fontWeight: 800 }}>
            {game.currency}
            {game.budget}
          </b>
        </span>
        <span style={{ color: "var(--draft-rule)" }}>│</span>
        <span style={{ whiteSpace: "nowrap", wordBreak: "keep-all" }}>
          풀 <b style={{ color: "var(--draft-ink)", fontWeight: 800 }}>{game.poolSize || "–"}</b>
        </span>
        {game.avgMinutes > 0 && (
          <>
            <span style={{ color: "var(--draft-rule)" }}>│</span>
            <span style={{ whiteSpace: "nowrap", wordBreak: "keep-all" }}>
              ~<b style={{ color: "var(--draft-ink)", fontWeight: 800 }}>{game.avgMinutes}</b>분
            </span>
          </>
        )}
      </div>

      {/* 푸터: 좌 메타 + 우 화살표 원 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            fontSize: 11,
            color: "var(--draft-mute)",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {dim ? "Coming soon" : game.plays > 0 ? `누적 ${game.plays.toLocaleString()}회` : "New"}
        </span>
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: hover && !dim ? "var(--draft-ink)" : "var(--draft-neutral)",
            color: hover && !dim ? "#fff" : "var(--draft-ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            fontWeight: 700,
            transform: hover && !dim ? "translateX(2px)" : "none",
            transition: "all .18s",
          }}
        >
          →
        </span>
      </div>
    </div>
  )

  if (dim) {
    return (
      <div
        aria-disabled="true"
        role="group"
        aria-label={`${game.name} (준비 중)`}
        style={{ pointerEvents: "none" }}
      >
        {cardInner}
      </div>
    )
  }

  return (
    <Link
      href={`/games/draft/${game.slug}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
      aria-label={`${game.name} 드래프트 시작`}
    >
      {cardInner}
    </Link>
  )
}

export function GameSelectScreen() {
  const [filter, setFilter] = useState<"all" | DraftCatalogEntry["sport"]>("all")
  const catalog = DRAFT_GAMES.filter((g) => !g.hidden)
  // 활성 게임이 있는 종목만 필터로 노출. 단일 종목이면 필터 행 자체를 숨김.
  const availableSports = [...new Set(catalog.map((g) => g.sport))]
  const filters: Array<{ key: "all" | DraftCatalogEntry["sport"]; label: string }> =
    availableSports.length > 1
      ? [
          { key: "all", label: "전체" },
          ...availableSports.map((s) => ({ key: s, label: SPORT_LABELS[s] })),
        ]
      : []
  const visibleGames = filter === "all" ? catalog : catalog.filter((g) => g.sport === filter)

  return (
    <div className="draft-scope draft-kraft" style={{ minHeight: "100vh" }}>
      <div style={{ padding: "32px 24px 8px" }}>
        <div className="draft-rule" />
      </div>

      <div style={{ padding: "24px 24px 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 18,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h2
            style={{
              fontSize: 24,
              letterSpacing: "-0.025em",
              fontWeight: 900,
            }}
          >
            <span
              className="draft-eyebrow draft-eyebrow-burg"
              style={{ marginRight: 12, position: "relative", top: -3 }}
            >
              01
            </span>
            모든 드래프트
          </h2>
          {filters.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {filters.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setFilter(t.key)}
                  className={`draft-pill ${filter === t.key ? "draft-pill-on" : ""}`}
                  style={{
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    fontFamily: "var(--draft-font-body)",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 카드 폭 캡(340px) + 좌측 정렬 — 카드 1개여도 풀폭으로 늘어지지 않고, 여러 개면 보드처럼 타일 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 340px))",
            gap: 16,
            justifyContent: "start",
          }}
        >
          {visibleGames.map((g) => (
            <GameCard key={g.slug} game={g} />
          ))}
        </div>
        {visibleGames.length === 0 && (
          <div
            style={{
              padding: "32px 0",
              textAlign: "center",
              color: "var(--draft-mute)",
            }}
          >
            해당 분류에 게임이 없어요.
          </div>
        )}
      </div>
    </div>
  )
}
