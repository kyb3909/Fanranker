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

function GameStripe({ color }: { color: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 6,
        background: color,
        borderRadius: "14px 0 0 14px",
      }}
    />
  )
}

function GameBadge({ badge }: { badge: NonNullable<DraftCatalogEntry["badge"]> }) {
  const bg =
    badge === "HOT"
      ? "var(--draft-burgundy)"
      : badge === "NEW"
        ? "var(--draft-ink)"
        : "var(--draft-mute)"
  return (
    <div
      style={{
        position: "absolute",
        top: 14,
        right: 14,
        padding: "3px 8px",
        borderRadius: 4,
        background: bg,
        color: "white",
        fontFamily: "var(--draft-font-title)",
        fontWeight: 900,
        fontSize: 10,
        letterSpacing: "0.08em",
      }}
    >
      {badge}
    </div>
  )
}

function GameCard({ game }: { game: DraftCatalogEntry }) {
  const [hover, setHover] = useState(false)
  const dim = !game.active

  const cardInner = (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="draft-card"
      style={{
        position: "relative",
        padding: 22,
        paddingLeft: 28,
        transition: "transform .2s, box-shadow .2s, border-color .2s",
        transform: hover && !dim ? "translateY(-3px)" : "none",
        boxShadow:
          hover && !dim
            ? `0 16px 32px rgba(26,20,22,.12), inset 0 0 0 2px ${game.themeColor}33`
            : "var(--draft-shadow-1)",
        opacity: dim ? 0.55 : 1,
        cursor: dim ? "not-allowed" : "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 220,
        overflow: "hidden",
      }}
    >
      <GameStripe color={game.themeColor} />
      {game.badge && <GameBadge badge={game.badge} />}

      <div style={{ fontSize: 42, lineHeight: 1, marginBottom: 4 }}>{game.emoji}</div>

      <h3
        style={{
          fontSize: 18,
          fontFamily: "var(--draft-font-title)",
          fontWeight: 900,
          letterSpacing: "-0.025em",
        }}
      >
        {game.name}
      </h3>

      <p
        className="draft-serif"
        style={{
          fontSize: 13,
          color: "var(--draft-ink-soft)",
          fontStyle: "normal",
          lineHeight: 1.5,
          fontWeight: 400,
          flex: 1,
        }}
      >
        {game.blurb}
      </p>

      <div
        className="draft-num"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          fontSize: 11,
          color: "var(--draft-mute)",
          fontFamily: "var(--draft-font-title)",
          fontWeight: 600,
          letterSpacing: "0.02em",
        }}
      >
        <span>
          <strong style={{ color: "var(--draft-ink)" }}>{game.rosterSize}</strong>인
        </span>
        <span style={{ color: "var(--draft-rule)" }}>│</span>
        <span>
          <strong style={{ color: "var(--draft-ink)" }}>
            {game.currency}
            {game.budget}
          </strong>
        </span>
        <span style={{ color: "var(--draft-rule)" }}>│</span>
        <span>
          풀 <strong style={{ color: "var(--draft-ink)" }}>{game.poolSize || "–"}</strong>
        </span>
        {game.avgMinutes > 0 && (
          <>
            <span style={{ color: "var(--draft-rule)" }}>│</span>
            <span>
              ~<strong style={{ color: "var(--draft-ink)" }}>{game.avgMinutes}</strong>분
            </span>
          </>
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 4,
        }}
      >
        {game.plays > 0 ? (
          <span
            className="draft-num"
            style={{
              fontSize: 11,
              color: "var(--draft-mute)",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <span className="draft-dot-live" style={{ width: 6, height: 6, marginRight: 6 }} />
            누적 {game.plays.toLocaleString()}회 플레이
          </span>
        ) : (
          <span
            style={{
              fontSize: 11,
              color: "var(--draft-mute)",
              fontFamily: "var(--draft-font-title)",
              fontWeight: 700,
              letterSpacing: "0.06em",
            }}
          >
            {dim ? "COMING SOON" : "NEW"}
          </span>
        )}
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: hover && !dim ? game.themeColor : "var(--draft-soft)",
            color: hover && !dim ? "white" : "var(--draft-ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            fontWeight: 700,
            transition: "all .2s",
          }}
        >
          →
        </span>
      </div>
    </div>
  )

  if (dim) {
    return (
      <div aria-disabled="true" role="group" aria-label={`${game.name} (준비 중)`}>
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

function HistoryEmpty() {
  return (
    <div style={{ padding: "16px 24px 32px" }}>
      <div className="draft-rule" style={{ marginBottom: 18 }} />
      <div className="draft-eyebrow" style={{ marginBottom: 10 }}>
        02 · 내 기록
      </div>
      <div
        className="draft-card"
        style={{
          padding: "20px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--draft-font-title)",
              fontWeight: 800,
              fontSize: 16,
              letterSpacing: "-0.02em",
            }}
          >
            아직 드래프트 기록이 없어요.
          </div>
          <div
            className="draft-serif"
            style={{
              fontSize: 13,
              fontStyle: "normal",
              color: "var(--draft-mute)",
              marginTop: 4,
            }}
          >
            위 카드 중 하나를 골라 첫 드래프트를 시작해보세요.
          </div>
        </div>
      </div>
    </div>
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
              fontFamily: "var(--draft-font-title)",
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
                  className={`draft-pill ${filter === t.key ? "draft-pill-burg" : ""}`}
                  style={{
                    cursor: "pointer",
                    fontFamily: "var(--draft-font-body)",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {visibleGames.map((g) => (
            <GameCard key={g.slug} game={g} />
          ))}
        </div>
        {visibleGames.length === 0 && (
          <div
            className="draft-serif"
            style={{
              padding: "32px 0",
              textAlign: "center",
              fontStyle: "normal",
              color: "var(--draft-mute)",
            }}
          >
            해당 분류에 게임이 없어요.
          </div>
        )}
      </div>

      <HistoryEmpty />
    </div>
  )
}
