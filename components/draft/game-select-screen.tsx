"use client"

import Link from "next/link"
import { useState } from "react"
import { DRAFT_GAMES, type DraftCatalogEntry } from "@/lib/draft/games-catalog"

import "@/app/games/draft/draft-tokens.css"

const FILTERS: Array<{ key: "all" | DraftCatalogEntry["sport"]; label: string }> = [
  { key: "all", label: "전체" },
  { key: "football", label: "축구" },
  { key: "basketball", label: "농구" },
  { key: "strategy", label: "전략" },
  { key: "culture", label: "컬처" },
]

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
          fontStyle: "italic",
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

function FeaturedGameCard({ game }: { game: DraftCatalogEntry }) {
  return (
    <Link
      href={`/games/draft/${game.slug}`}
      style={{ textDecoration: "none", color: "inherit", display: "block", gridColumn: "span 2" }}
    >
      <div
        className="draft-card"
        style={{
          position: "relative",
          padding: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "row",
          flexWrap: "wrap",
          minHeight: 320,
          border: "none",
          boxShadow: "var(--draft-shadow-2)",
        }}
      >
        {/* left: editorial header on themed background */}
        <div
          style={{
            flex: "1 1 56%",
            minWidth: 280,
            padding: "32px 32px 26px",
            background: `linear-gradient(135deg, ${game.themeColor} 0%, ${game.themeColor}cc 60%, #0e0a09 100%)`,
            color: "white",
            position: "relative",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            className="draft-eyebrow"
            style={{ color: "rgba(255,255,255,0.7)", letterSpacing: "0.18em" }}
          >
            ─── 오늘의 추천 드래프트
          </div>
          <div style={{ fontSize: 72, marginTop: 20, marginBottom: 8, lineHeight: 1 }}>
            {game.emoji}
          </div>
          <h2
            style={{
              fontFamily: "var(--draft-font-title)",
              fontWeight: 900,
              fontSize: 36,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              marginBottom: 12,
            }}
          >
            {game.name}
          </h2>
          <p
            className="draft-serif"
            style={{
              fontSize: 15,
              fontStyle: "italic",
              lineHeight: 1.5,
              opacity: 0.9,
              maxWidth: 360,
            }}
          >
            {game.blurb}
          </p>
          <div style={{ flex: 1 }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginTop: 18,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                background: "white",
                color: game.themeColor,
                fontFamily: "var(--draft-font-title)",
                fontWeight: 800,
                border: "none",
                padding: "12px 18px",
                borderRadius: 999,
                letterSpacing: "-0.01em",
                fontSize: 15,
                display: "inline-block",
              }}
            >
              바로 드래프트 시작 →
            </span>
          </div>
        </div>

        {/* right: stats column */}
        <div
          style={{
            flex: "1 1 320px",
            padding: "32px 32px 26px",
            background: "var(--draft-card)",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div className="draft-eyebrow draft-eyebrow-burg">이번 시즌 통계</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            {[
              [game.plays.toLocaleString(), "누적 드래프트"],
              [game.poolSize.toString(), "선수 풀"],
              [`${game.currency}${game.budget}`, "예산"],
              [`${game.avgMinutes}분`, "평균 플레이"],
            ].map(([n, l]) => (
              <div key={l}>
                <div
                  className="draft-num"
                  style={{
                    fontFamily: "var(--draft-font-title)",
                    fontWeight: 900,
                    fontSize: 28,
                    letterSpacing: "-0.03em",
                    color: "var(--draft-ink)",
                  }}
                >
                  {n}
                </div>
                <div className="draft-eyebrow" style={{ fontSize: 10, marginTop: 2 }}>
                  {l}
                </div>
              </div>
            ))}
          </div>

          <div className="draft-rule" />

          <div>
            <div className="draft-eyebrow" style={{ marginBottom: 10 }}>
              포메이션 옵션
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {game.formationOptions.map((f) => (
                <span
                  key={f}
                  className="draft-pill"
                  style={{
                    fontFamily: "var(--draft-font-title)",
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

function HeroSection() {
  return (
    <div
      style={{
        padding: "40px 24px 16px",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        gap: 32,
      }}
      className="draft-hero-grid"
    >
      <style>{`
        @media (min-width: 900px) {
          .draft-hero-grid {
            grid-template-columns: 1fr 1fr !important;
            align-items: end !important;
            padding: 52px 40px 24px !important;
            gap: 48px !important;
          }
        }
      `}</style>

      <div>
        <div className="draft-eyebrow draft-eyebrow-burg" style={{ marginBottom: 12 }}>
          <span
            style={{
              display: "inline-block",
              width: 22,
              height: 1,
              background: "var(--draft-burgundy)",
              verticalAlign: "middle",
              marginRight: 8,
            }}
          />
          VOL.07 · PLAY
        </div>
        <h1
          style={{
            fontSize: "clamp(36px, 5vw, 64px)",
            lineHeight: 0.95,
            letterSpacing: "-0.035em",
            fontWeight: 900,
            fontFamily: "var(--draft-font-title)",
          }}
        >
          나만의
          <br />
          <span style={{ color: "var(--draft-burgundy)" }}>드림팀</span>을
          <br />
          드래프트 하세요.
        </h1>
        <p
          className="draft-serif"
          style={{
            marginTop: 14,
            fontSize: 16,
            color: "var(--draft-ink-soft)",
            maxWidth: 560,
            lineHeight: 1.55,
            fontStyle: "italic",
          }}
        >
          현역 EPL부터 아스널 인비저블, 슬램덩크 북산, 삼국지 위촉오까지 ― 한정된 예산으로 라인업을
          짠다. 솔로 vs AI 또는 친구와의 PvP.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="draft-rule-thick" style={{ width: 60 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            [DRAFT_GAMES.length.toString(), "드래프트 라이브러리"],
            ["스네이크", "픽 순서"],
            ["30초", "픽 제한"],
          ].map(([v, l]) => (
            <div key={l} style={{ borderLeft: "2px solid var(--draft-ink)", paddingLeft: 12 }}>
              <div
                className="draft-num"
                style={{
                  fontFamily: "var(--draft-font-title)",
                  fontWeight: 900,
                  fontSize: 22,
                  letterSpacing: "-0.03em",
                }}
              >
                {v}
              </div>
              <div className="draft-eyebrow" style={{ fontSize: 10, marginTop: 2 }}>
                {l}
              </div>
            </div>
          ))}
        </div>
        <p
          className="draft-serif"
          style={{
            fontSize: 13,
            color: "var(--draft-mute)",
            fontStyle: "italic",
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          &ldquo;축구는 11명이 22명에 맞서는 게 아니라 한 명의 매니저가 22명에 맞서는
          게임이다.&rdquo;
        </p>
      </div>
    </div>
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
              fontStyle: "italic",
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
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all")
  const featured = DRAFT_GAMES.find((g) => g.slug === "epl")!
  const others = DRAFT_GAMES.filter((g) => g.slug !== "epl")

  const visibleOthers = filter === "all" ? others : others.filter((g) => g.sport === filter)
  const featuredVisible = filter === "all" || featured.sport === filter

  return (
    <div className="draft-scope draft-kraft" style={{ minHeight: "100vh" }}>
      <HeroSection />

      <div style={{ padding: "8px 24px" }}>
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
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FILTERS.map((t) => (
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
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {featuredVisible && <FeaturedGameCard game={featured} />}
          {visibleOthers.map((g) => (
            <GameCard key={g.slug} game={g} />
          ))}
        </div>
        {!featuredVisible && visibleOthers.length === 0 && (
          <div
            className="draft-serif"
            style={{
              padding: "32px 0",
              textAlign: "center",
              fontStyle: "italic",
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
