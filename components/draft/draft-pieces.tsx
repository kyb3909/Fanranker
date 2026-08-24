"use client"

import { Star } from "lucide-react"
import type { Player, Position } from "@/lib/draft/players"
import { POSITION_HEX } from "@/lib/draft/visual-helpers"
import type { DraftState } from "@/lib/draft/engine"

// ─────────────────────────────────────────────────────────
// PositionBadge — 정사각 색 배지 (포지션 코드)
// ─────────────────────────────────────────────────────────

export function PositionBadge({ pos, size = "md" }: { pos: Position; size?: "sm" | "md" }) {
  const px = size === "sm" ? 22 : 28
  const fs = size === "sm" ? 10 : 12
  return (
    <span
      style={{
        width: px,
        height: px,
        borderRadius: 8,
        background: POSITION_HEX[pos],
        color: "white",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        fontSize: fs,
        letterSpacing: "-0.02em",
        flexShrink: 0,
      }}
    >
      {pos}
    </span>
  )
}

// ─────────────────────────────────────────────────────────
// BudgetBar — 그라디언트 진행 바
// ─────────────────────────────────────────────────────────

export function BudgetBar({
  used,
  total,
  currency = "£",
}: {
  used: number
  total: number
  currency?: string
}) {
  const pct = Math.min(100, (used / total) * 100)
  const remaining = total - used
  const over = used > total

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <span className="draft-eyebrow">예산</span>
        <span
          className="draft-num"
          style={{
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          {currency}
          {used.toFixed(1)} / {currency}
          {total}
        </span>
      </div>
      <div
        style={{
          height: 8,
          background: "var(--draft-soft)",
          borderRadius: 999,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: over
              ? "var(--draft-burgundy)"
              : "linear-gradient(90deg, var(--draft-ink), var(--draft-burgundy))",
            transition: "width .35s ease-out",
          }}
        />
      </div>
      <div
        className="draft-num"
        style={{
          marginTop: 4,
          fontSize: 11,
          color: "var(--draft-mute)",
          textAlign: "right",
        }}
      >
        남은 예산{" "}
        <strong
          style={{
            color: over ? "var(--draft-burgundy)" : "var(--draft-ink)",
          }}
        >
          {currency}
          {remaining.toFixed(1)}
        </strong>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// PlayerPoolCard — 디자인의 카드형 선수 항목
// ─────────────────────────────────────────────────────────

interface PlayerPoolCardProps {
  player: Player
  canPick: boolean
  slotFull: boolean
  overBudget: boolean
  /**
   * 풀에서 도판으로 바로 끌어다 놓기 (2026-08-25 운영자 요청).
   * 카드를 누른 채 움직이면 보드가 드래그를 이어받는다 — 여기서는 시작만 알린다.
   */
  onDragStart?: (e: React.PointerEvent) => void
  /** 못 뽑는 이유를 보드가 직접 준다 (엔진 판정). 없으면 아래 기본 문구로 떨어진다. */
  reasonLabel?: string | null
  /** 우리 유저 픽 통계 (없으면 FPL 소유율 폴백) */
  pickStat?: { rate: number; avgRound: number; rankInPos: number; posPicked: number }
  statsGames?: number
  takenBy?: string | null
  pinned?: boolean
  onPick: () => void
  onTogglePin: () => void
}

export function PlayerPoolCard({
  player,
  canPick,
  slotFull,
  overBudget,
  takenBy,
  onDragStart,
  reasonLabel,
  pickStat,
  statsGames = 0,
  pinned = false,
  onPick,
  onTogglePin,
}: PlayerPoolCardProps) {
  const reason = takenBy
    ? `${takenBy} 픽`
    : (reasonLabel ?? null) || (slotFull ? "슬롯 꽉 참" : overBudget ? "예산 초과" : null)

  /**
   * ⚠️ 카드가 아니라 **행**이다 (2026-08-25 재작업).
   *
   * 종전엔 라운드 16px 흰 박스에 44px 그라디언트 타일 + 큰 한글 이니셜이었다.
   * 사이트 어디에도 그런 물건이 없다 — 매치센터 라인업도 순위표도 전부 **조용한 행**
   * (작은 틴트 칩 + 이름 + 헤어라인)이다. 박스가 60개 쌓이니 게임만 남의 집처럼 보였고,
   * 한 화면에 들어오는 선수도 적었다 (운영자: "전혀 다르지 않아. 선수 카드부터 개선해줘").
   *
   * 위계는 **가격**이 만든다 — 스타는 이름과 금액이 커지고, £4 벤치는 조용히 눕는다.
   * 종전엔 £15.5 와 £4.0 이 똑같은 크기라 60장이 균질한 벽이었다.
   */
  const tier = player.price >= 8 ? "star" : player.price >= 6 ? "mid" : "base"
  // ⚠️ 우리 유저 픽 데이터가 있으면 그게 정본이다 (운영자: "사람들이 뽑은 데이터로").
  //    표본이 너무 작으면(5판 미만) 순위가 소음이라 FPL 소유율로 폴백한다.
  const ourData = statsGames >= 5 && pickStat
  const isPopular = ourData
    ? pickStat.rankInPos <= 10
    : !!player.ownedRank && player.ownedRank <= 10
  const nameSize = tier === "star" ? 15.5 : tier === "mid" ? 14.5 : 14
  const priceSize = tier === "star" ? 20 : tier === "mid" ? 17 : 15

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 8px 9px 4px",
        // 박스 대신 헤어라인. 스타에만 아주 옅은 와인 틴트를 깔아 목록에서 떠오르게 한다.
        borderBottom: "1px solid var(--draft-line)",
        background: pinned
          ? "var(--draft-burgundy-soft)"
          : tier === "star"
            ? "rgba(150,30,55,0.028)"
            : "transparent",
        opacity: takenBy ? 0.4 : 1,
        transition: "background .12s",
        cursor: onDragStart && canPick ? "grab" : undefined,
        touchAction: "pan-y",
      }}
      onPointerDown={(e) => {
        if (onDragStart && canPick) onDragStart(e)
      }}
      onMouseEnter={(e) => {
        if (canPick) e.currentTarget.style.background = "var(--draft-neutral)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = pinned
          ? "var(--draft-burgundy-soft)"
          : tier === "star"
            ? "rgba(150,30,55,0.028)"
            : "transparent"
      }}
    >
      {/* 즐겨찾기 — 행 맨 앞. 종전엔 카드 우상단에 떠 있어 가격과 겹쳤다. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onTogglePin()
        }}
        aria-label={pinned ? "즐겨찾기 해제" : "즐겨찾기"}
        style={{
          background: "transparent",
          border: "none",
          color: pinned ? "var(--draft-burgundy)" : "var(--draft-line)",
          cursor: "pointer",
          padding: 2,
          flexShrink: 0,
          display: "flex",
        }}
      >
        <Star size={13} fill={pinned ? "currentColor" : "none"} />
      </button>

      {/* 포지션 칩 — 사이트 라인업의 등번호 칩과 같은 문법 (작은 틴트 사각) */}
      <span
        aria-label={player.position}
        style={{
          flexShrink: 0,
          width: 26,
          height: 20,
          borderRadius: 5,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${POSITION_HEX[player.position]}1a`,
          color: POSITION_HEX[player.position],
          fontFamily: "var(--font-cond), var(--draft-font-title)",
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: "0.04em",
        }}
      >
        {player.position}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: tier === "star" ? 800 : 700,
            fontSize: nameSize,
            letterSpacing: "-0.01em",
            color: "var(--draft-ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {player.nameKo}
        </div>
        <div
          style={{
            marginTop: 1,
            fontSize: 11,
            color: "var(--draft-mute)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {/* ⚠️ 종전엔 여기 구단 원색 점(#6cabdd 맨시티 하늘색 등)이 있었다. 그 색들은
              사이트 어디에도 안 쓰인다 — 팀 표시는 **글자로 충분하다** (운영자 지적). */}
          {player.teamKo}
          {/* 인기 신호 — 뽑을지 말지 정하는 자리가 여기다 (2026-08-25 운영자 요청).
              ⚠️ 60행에 막대를 다 그리면 목록이 다시 시끄러워진다. **포지션 상위권만**
                 뱃지로 알린다. 나머지는 소유율 숫자만 조용히. */}
          {!!player.owned && (
            <>
              <span style={{ margin: "0 5px", color: "var(--draft-line)" }}>·</span>
              {isPopular ? (
                <span
                  className="draft-num"
                  style={{
                    color: "var(--draft-burgundy)",
                    fontWeight: 700,
                    fontSize: 10.5,
                  }}
                >
                  {ourData
                    ? `유저 픽 ${pickStat.rankInPos}위 · 평균 ${pickStat.avgRound}R`
                    : `${player.position} 소유율 ${player.ownedRank}위`}
                </span>
              ) : (
                <span className="draft-num" style={{ fontSize: 10.5 }}>
                  {ourData ? `픽률 ${pickStat.rate.toFixed(0)}%` : `${player.owned.toFixed(1)}%`}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <div
          className="draft-num"
          style={{
            fontWeight: 700,
            fontSize: priceSize,
            lineHeight: 1,
            color: canPick ? "var(--draft-ink)" : "var(--draft-mute)",
          }}
        >
          £{player.price.toFixed(1)}
        </div>
        {reason && (
          <div
            style={{
              marginTop: 3,
              fontSize: 10,
              color: "var(--draft-mute)",
              whiteSpace: "nowrap",
            }}
          >
            {reason}
          </div>
        )}
      </div>

      {!reason && (
        <button
          type="button"
          disabled={!canPick}
          onClick={(e) => {
            e.stopPropagation()
            if (canPick) onPick()
          }}
          style={{
            flexShrink: 0,
            padding: "5px 11px",
            borderRadius: 999,
            background: canPick ? "var(--draft-burgundy)" : "transparent",
            color: canPick ? "#fff" : "var(--draft-mute)",
            border: canPick ? "none" : "1px solid var(--draft-line)",
            fontWeight: 700,
            fontSize: 11,
            cursor: canPick ? "pointer" : "not-allowed",
          }}
        >
          영입
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// AiPanel — 우측 다른 참가자 진행 카드
// ─────────────────────────────────────────────────────────

interface AiPanelProps {
  name: string
  isAI: boolean
  isMe: boolean
  isCurrent: boolean
  picks: Player[]
  budgetUsed: number
  budget: number
  rosterSize: number
}

export function AiPanel({
  name,
  isAI,
  isMe,
  isCurrent,
  picks,
  budgetUsed,
  budget,
  rosterSize,
}: AiPanelProps) {
  const recent = picks.slice(-3).reverse()
  const progressPct = Math.min(100, (picks.length / rosterSize) * 100)

  return (
    <div
      style={{
        background: "var(--draft-card)",
        borderRadius: 12,
        padding: 14,
        border: `${isCurrent ? 2 : 1}px solid ${
          isCurrent ? "var(--draft-burgundy)" : "var(--draft-line)"
        }`,
        boxShadow: isCurrent ? "0 0 0 4px rgba(150,30,55,0.13)" : "none",
        transition: "all .2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {/* ⚠️ 종전엔 이름 첫 글자를 넣은 30px 그라디언트 원이 있었다. 글자 한 자짜리
            아바타는 정보가 없고 사이트에도 없는 물건이다 — 실제 얼굴을 쓸 게 아니면
            없는 편이 낫다 (운영자 지적). 순서 표시는 아래 이름과 진행바로 충분하다. */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "var(--draft-ink)",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </span>
            {isMe && (
              <span
                style={{
                  fontSize: 9,
                  color: "var(--draft-burgundy)",
                  fontWeight: 900,
                  letterSpacing: "0.1em",
                }}
              >
                YOU
              </span>
            )}
            {isAI && !isMe && (
              <span
                style={{
                  fontSize: 9,
                  color: "var(--draft-mute)",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                }}
              >
                AI
              </span>
            )}
            {isCurrent && (
              <span
                className="draft-dot-live"
                style={{ width: 6, height: 6 }}
                aria-label="현재 픽 중"
              />
            )}
          </div>
          <div className="draft-num" style={{ fontSize: 10, color: "var(--draft-mute)" }}>
            {picks.length}/{rosterSize} · £{budgetUsed.toFixed(1)}/£{budget}
          </div>
        </div>
      </div>

      <div
        style={{
          height: 4,
          background: "var(--draft-soft)",
          borderRadius: 999,
          overflow: "hidden",
        }}
        aria-label={`진행률 ${progressPct.toFixed(0)}%`}
      >
        <div
          style={{
            width: `${progressPct}%`,
            height: "100%",
            background: "var(--draft-ink)",
            transition: "width .3s",
          }}
        />
      </div>

      <div
        style={{
          marginTop: 10,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {recent.map((p, i) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              opacity: 1 - i * 0.2,
            }}
          >
            <PositionBadge pos={p.position} size="sm" />
            <span
              style={{
                fontWeight: 700,
                flex: 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: "var(--draft-ink)",
              }}
            >
              {p.nameKo}
            </span>
            <span
              className="draft-num"
              style={{ color: "var(--draft-mute)", fontVariantNumeric: "tabular-nums" }}
            >
              £{p.price.toFixed(1)}
            </span>
          </div>
        ))}
        {picks.length === 0 && (
          <span
            className="draft-serif"
            style={{
              fontSize: 11,
              color: "var(--draft-mute)",
              fontStyle: "normal",
            }}
          >
            아직 픽 없음
          </span>
        )}
        {picks.length > 3 && (
          <span
            className="draft-num"
            style={{
              fontSize: 10,
              color: "var(--draft-mute)",
              fontWeight: 700,
            }}
          >
            +{picks.length - 3}명 더
          </span>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// SnakeOrder — 다크 톱바용 동그라미 행
// ─────────────────────────────────────────────────────────

interface SnakeOrderProps {
  state: DraftState
  mySeat: number
}

export function SnakeOrder({ state, mySeat }: SnakeOrderProps) {
  const total = state.snakeOrder.length
  const cur = state.currentPick
  const participants = state.participants.length

  // 현재 픽 주변 22개 윈도우
  const start = Math.max(0, Math.min(total - 22, cur - 8))
  const windowLen = Math.min(22, total - start)

  // round 변경점 표시: pick % participants 가 0 이고 새 round 시작
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      {Array.from({ length: windowLen }, (_, i) => {
        const idx = start + i
        const seat = state.snakeOrder[idx]
        const round = Math.floor(idx / participants)
        const prevRound = idx > 0 ? Math.floor((idx - 1) / participants) : round
        const newRound = i > 0 && round !== prevRound

        const done = idx < cur
        const current = idx === cur
        const me = seat === mySeat

        return (
          <div key={idx} style={{ display: "flex", alignItems: "center" }}>
            {newRound && (
              <span
                style={{
                  width: 1,
                  height: 14,
                  background: "rgba(246,228,232,0.2)",
                  marginLeft: 2,
                  marginRight: 2,
                }}
              />
            )}
            <div
              title={`Pick ${idx + 1} · R${round + 1} · ${me ? "나" : "AI"}`}
              style={{
                width: current ? 18 : 12,
                height: current ? 18 : 12,
                borderRadius: "50%",
                background: current
                  ? "var(--draft-burgundy)"
                  : done
                    ? me
                      ? "var(--draft-paper)"
                      : "#807370"
                    : "transparent",
                border: `1.5px solid ${
                  current
                    ? "var(--draft-burgundy)"
                    : me
                      ? "var(--draft-paper)"
                      : "rgba(246,228,232,0.3)"
                }`,
                boxShadow: current ? "0 0 0 3px rgba(150,30,55,0.4)" : "none",
                transition: "all .2s",
                animation: current ? "draft-dotpulse 1.6s infinite" : "none",
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
