"use client"

import { Star } from "lucide-react"
import type { Player, Position } from "@/lib/draft/players"
import { POSITION_HEX, getTeamAccent, getPlayerInitial } from "@/lib/draft/visual-helpers"
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
        borderRadius: 6,
        background: POSITION_HEX[pos],
        color: "white",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--draft-font-title)",
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
            fontFamily: "var(--draft-font-title)",
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
  pinned = false,
  onPick,
  onTogglePin,
}: PlayerPoolCardProps) {
  const reason = takenBy
    ? `${takenBy} 픽`
    : slotFull
      ? "슬롯 꽉 참"
      : overBudget
        ? "예산 초과"
        : null
  const accent = getTeamAccent(player.teamKo, player.position)

  return (
    <div
      style={{
        background: "var(--draft-card)",
        borderRadius: 14,
        border: `${pinned ? 2 : 1}px solid ${
          pinned ? "var(--draft-burgundy)" : "var(--draft-line)"
        }`,
        padding: 12,
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 12,
        opacity: takenBy ? 0.4 : 1,
        transition: "box-shadow .15s, border-color .15s",
      }}
      onMouseEnter={(e) => {
        if (canPick) e.currentTarget.style.boxShadow = "var(--draft-shadow-2)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none"
      }}
    >
      {/* face block — 팀 컬러 그라디언트 + 이니셜 */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          flexShrink: 0,
          background: `linear-gradient(135deg, ${accent}, ${accent}99)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--draft-font-title)",
          fontWeight: 900,
          fontSize: 18,
          color: "white",
          letterSpacing: "-0.02em",
        }}
        aria-hidden
      >
        {getPlayerInitial(player)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <PositionBadge pos={player.position} size="sm" />
          <span
            style={{
              fontFamily: "var(--draft-font-title)",
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: "-0.01em",
              color: "var(--draft-ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {player.nameKo}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 4,
            fontSize: 11,
            color: "var(--draft-mute)",
            fontFamily: "var(--draft-font-body)",
          }}
        >
          <span>{player.teamKo}</span>
          <span style={{ color: "var(--draft-rule)" }}>·</span>
          <span style={{ fontStyle: "italic" }}>{player.name}</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 4,
          flexShrink: 0,
        }}
      >
        <div
          className="draft-num"
          style={{
            fontFamily: "var(--draft-font-title)",
            fontWeight: 900,
            fontSize: 20,
            lineHeight: 1,
            color: "var(--draft-ink)",
          }}
        >
          £{player.price.toFixed(1)}
        </div>
        {reason ? (
          <span
            style={{
              fontSize: 10,
              color: "var(--draft-mute)",
              fontFamily: "var(--draft-font-title)",
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}
          >
            {reason}
          </span>
        ) : (
          <button
            type="button"
            disabled={!canPick}
            onClick={(e) => {
              e.stopPropagation()
              if (canPick) onPick()
            }}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: canPick ? "var(--draft-burgundy)" : "var(--draft-soft)",
              color: canPick ? "white" : "var(--draft-mute)",
              border: "none",
              fontFamily: "var(--draft-font-title)",
              fontWeight: 800,
              fontSize: 11,
              cursor: canPick ? "pointer" : "not-allowed",
              letterSpacing: "-0.01em",
            }}
          >
            영입
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onTogglePin()
        }}
        aria-label={pinned ? "즐겨찾기 해제" : "즐겨찾기"}
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          background: "transparent",
          border: "none",
          color: pinned ? "var(--draft-burgundy)" : "var(--draft-line)",
          cursor: "pointer",
          padding: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Star size={14} fill={pinned ? "currentColor" : "none"} />
      </button>
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
        boxShadow: isCurrent ? "0 0 0 4px rgba(160,32,59,0.13)" : "none",
        transition: "all .2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: isMe
              ? "linear-gradient(135deg, var(--draft-burgundy), var(--draft-violet))"
              : "var(--draft-soft)",
            color: isMe ? "white" : "var(--draft-ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--draft-font-title)",
            fontWeight: 900,
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {name.charAt(0)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--draft-font-title)",
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
                fontFamily: "var(--draft-font-title)",
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
              fontStyle: "italic",
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
              fontFamily: "var(--draft-font-title)",
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
                  background: "rgba(244,236,230,0.2)",
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
                      : "rgba(244,236,230,0.3)"
                }`,
                boxShadow: current ? "0 0 0 3px rgba(160,32,59,0.4)" : "none",
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
