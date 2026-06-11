"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { PitchViz, rosterToSlots } from "./pitch-viz"
import { PositionBadge } from "./draft-pieces"
import { ChatPanel } from "./chat-panel"
import type { Player, Position } from "@/lib/draft/players"
import { FORMATIONS, type Formation } from "@/lib/draft/engine"
import { analyzeLineup } from "@/lib/draft/visual-helpers"
import type { DraftRoomFullState } from "@/lib/draft/multi-engine"

import "@/app/games/draft/draft-tokens.css"

interface MultiDraftResultProps {
  state: DraftRoomFullState
  myUserId: string | null
  myDisplayName: string | null
  allPlayers: Player[]
}

/** 가격 정규화 점수 — 평균 가격을 14.5 (최고 EPL 가격) 기준으로 0~100 환산 */
function priceScore(players: Player[]): number {
  if (players.length === 0) return 0
  const avg = players.reduce((s, p) => s + p.price, 0) / players.length
  return Math.round(Math.min(100, (avg / 14.5) * 100))
}

function calcTeamScore(
  roster: Player[],
  budget: number
): {
  total: number
  attack: number
  midfield: number
  defense: number
  keeper: number
  spend: number
} {
  if (roster.length === 0) {
    return { total: 0, attack: 0, midfield: 0, defense: 0, keeper: 0, spend: 0 }
  }
  const byPos: Record<Position, Player[]> = { GK: [], DF: [], MF: [], FW: [] }
  for (const p of roster) byPos[p.position].push(p)

  const attack = priceScore(byPos.FW)
  const midfield = priceScore(byPos.MF)
  const defense = priceScore(byPos.DF)
  const keeper = priceScore(byPos.GK)
  // 총점: 가중평균 + 예산 활용도 보너스
  const weighted = attack * 0.3 + midfield * 0.3 + defense * 0.3 + keeper * 0.1
  const spend = roster.reduce((s, p) => s + p.price, 0)
  const budgetEfficiency = Math.min(1.05, spend / budget)
  const total = Math.round(Math.min(100, weighted * (0.85 + budgetEfficiency * 0.15)))
  return { total, attack, midfield, defense, keeper, spend }
}

export function MultiDraftResult({
  state,
  myUserId,
  myDisplayName,
  allPlayers,
}: MultiDraftResultProps) {
  const router = useRouter()
  const playerById = useMemo(() => new Map(allPlayers.map((p) => [p.id, p])), [allPlayers])

  const activeSeats = useMemo(
    () => state.seats.filter((s) => !s.left_at).sort((a, b) => a.seat_index - b.seat_index),
    [state.seats]
  )

  const mySeat = useMemo(
    () => activeSeats.find((s) => s.user_id === myUserId),
    [activeSeats, myUserId]
  )

  const [selectedSeat, setSelectedSeat] = useState<number>(
    mySeat?.seat_index ?? activeSeats[0]?.seat_index ?? 0
  )

  // 각 좌석의 roster + 점수
  const teamData = useMemo(() => {
    return activeSeats.map((seat) => {
      const roster = state.picks
        .filter((p) => p.seat_index === seat.seat_index)
        .map((p) => playerById.get(p.player_id))
        .filter((p): p is Player => !!p)
      const score = calcTeamScore(roster, state.budget)
      const analysis = analyzeLineup(roster)
      return { seat, roster, score, analysis }
    })
  }, [activeSeats, state.picks, state.budget, playerById])

  const selected = teamData.find((t) => t.seat.seat_index === selectedSeat)

  const elapsedSec = useMemo(() => {
    if (!state.drafting_started_at || !state.completed_at) return 0
    return Math.floor(
      (new Date(state.completed_at).getTime() - new Date(state.drafting_started_at).getTime()) /
        1000
    )
  }, [state.drafting_started_at, state.completed_at])

  const formation = (state.formation ?? "4-3-3") as Formation

  return (
    <div className="draft-scope draft-kraft" style={{ minHeight: "100vh", paddingBottom: 64 }}>
      {/* 다크 헤더 */}
      <div
        style={{
          background: "var(--draft-ink)",
          color: "var(--draft-paper)",
          borderBottom: "3px solid var(--draft-burgundy)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            className="draft-eyebrow"
            style={{
              color: "rgba(246,228,232,0.5)",
              fontSize: 9,
              marginBottom: 4,
              letterSpacing: "0.18em",
            }}
          >
            DRAFT COMPLETE
          </div>
          <div
            style={{
              fontFamily: "var(--draft-font-title)",
              fontWeight: 900,
              fontSize: 22,
              letterSpacing: "-0.025em",
              display: "flex",
              alignItems: "baseline",
              gap: 10,
            }}
          >
            EPL · {formation}
            <span
              className="draft-num"
              style={{
                fontSize: 12,
                color: "rgba(246,228,232,0.5)",
                fontWeight: 600,
              }}
            >
              소요 {formatElapsed(elapsedSec)}
            </span>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={() => router.push("/games/draft")}
          style={{
            padding: "10px 18px",
            borderRadius: 999,
            background: "var(--draft-burgundy)",
            color: "white",
            border: "none",
            fontFamily: "var(--draft-font-title)",
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
            letterSpacing: "-0.01em",
          }}
        >
          다시 드래프트 →
        </button>
      </div>

      {/* 본문 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 0,
        }}
        className="result-grid"
      >
        <style>{`
          @media (min-width: 1100px) {
            .result-grid {
              grid-template-columns: minmax(0, 1fr) 340px !important;
            }
          }
        `}</style>

        <div style={{ padding: "32px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 팀 탭 + 점수 헤더 */}
          <div>
            <div className="draft-eyebrow draft-eyebrow-burg" style={{ marginBottom: 8 }}>
              01 · 라인업 비교
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              {teamData.map(({ seat, score }) => {
                const isSelected = seat.seat_index === selectedSeat
                const isMe = seat.user_id === myUserId
                return (
                  <button
                    key={seat.id}
                    type="button"
                    onClick={() => setSelectedSeat(seat.seat_index)}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 12,
                      border: `1.5px solid ${
                        isSelected ? "var(--draft-burgundy)" : "var(--draft-line)"
                      }`,
                      background: isSelected ? "var(--draft-burgundy-soft)" : "var(--draft-card)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      transition: "all .15s",
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background: isMe
                          ? "linear-gradient(135deg, var(--draft-burgundy), var(--draft-violet))"
                          : seat.is_ai
                            ? "var(--draft-soft)"
                            : "var(--draft-ink)",
                        color: isMe || !seat.is_ai ? "white" : "var(--draft-mute)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "var(--draft-font-title)",
                        fontWeight: 900,
                        fontSize: 13,
                      }}
                    >
                      {seat.display_name.charAt(0)}
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <div
                        style={{
                          fontFamily: "var(--draft-font-title)",
                          fontWeight: 800,
                          fontSize: 13,
                          color: "var(--draft-ink)",
                          letterSpacing: "-0.01em",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {seat.display_name}
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
                        {seat.is_ai && (
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
                      </div>
                      <div
                        className="draft-num"
                        style={{
                          fontSize: 11,
                          color: "var(--draft-mute)",
                          fontWeight: 600,
                        }}
                      >
                        총점 {score.total}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {selected && <TeamDetail data={selected} formation={formation} />}

          {/* 매치업 결과 — 단순 랭킹 */}
          <Standings teamData={teamData} myUserId={myUserId} />
        </div>

        {/* 우측: 채팅 유지 */}
        <ChatPanel
          roomId={state.id}
          myUserId={myUserId}
          myDisplayName={myDisplayName}
          isMember={!!mySeat}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 상세 카드 — 선택된 팀의 PitchViz + 점수 카테고리 + 강약
// ─────────────────────────────────────────────

interface TeamData {
  seat: { seat_index: number; display_name: string; user_id: string | null; is_ai: boolean }
  roster: Player[]
  score: ReturnType<typeof calcTeamScore>
  analysis: { strengths: string[]; weaknesses: string[] }
}

function TeamDetail({ data, formation }: { data: TeamData; formation: Formation }) {
  const slots = rosterToSlots(data.roster, formation)
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        gap: 16,
      }}
      className="team-detail-grid"
    >
      <style>{`
        @media (min-width: 800px) {
          .team-detail-grid {
            grid-template-columns: minmax(0, 1fr) 320px !important;
          }
        }
      `}</style>

      {/* 좌: PitchViz */}
      <div
        style={{
          background: "var(--draft-card)",
          border: "1px solid var(--draft-line)",
          borderRadius: 14,
          padding: 18,
          boxShadow: "var(--draft-shadow-1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div>
            <div className="draft-eyebrow draft-eyebrow-burg">
              {data.seat.display_name} · {formation}
            </div>
            <h3
              style={{
                fontFamily: "var(--draft-font-title)",
                fontWeight: 900,
                fontSize: 20,
                letterSpacing: "-0.02em",
                marginTop: 2,
              }}
            >
              {data.roster.length}명 / £{data.score.spend.toFixed(1)} 사용
            </h3>
          </div>
        </div>
        <PitchViz formation={formation} filled={slots} />
      </div>

      {/* 우: 점수 + 강약 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <ScoreCard score={data.score} />
        <StrengthWeakness analysis={data.analysis} />
        <RosterList roster={data.roster} />
      </div>
    </div>
  )
}

function ScoreCard({ score }: { score: ReturnType<typeof calcTeamScore> }) {
  return (
    <div
      style={{
        background: "var(--draft-card)",
        border: "1px solid var(--draft-line)",
        borderRadius: 14,
        padding: 18,
        boxShadow: "var(--draft-shadow-1)",
      }}
    >
      <div className="draft-eyebrow draft-eyebrow-burg" style={{ marginBottom: 8 }}>
        02 · 점수
      </div>
      <div
        style={{
          fontFamily: "var(--draft-font-title)",
          fontWeight: 900,
          fontSize: 56,
          color: "var(--draft-burgundy)",
          letterSpacing: "-0.035em",
          lineHeight: 1,
          marginBottom: 14,
        }}
        className="draft-num"
      >
        {score.total}
        <span style={{ fontSize: 18, color: "var(--draft-mute)", marginLeft: 6 }}>/100</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <ScoreBar label="공격" value={score.attack} />
        <ScoreBar label="미드" value={score.midfield} />
        <ScoreBar label="수비" value={score.defense} />
        <ScoreBar label="골문" value={score.keeper} />
      </div>
    </div>
  )
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span className="draft-eyebrow" style={{ width: 32, fontSize: 10, letterSpacing: "0.1em" }}>
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 6,
          background: "var(--draft-soft)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${value}%`,
            height: "100%",
            background: "linear-gradient(90deg, var(--draft-ink), var(--draft-burgundy))",
            transition: "width .6s ease-out",
          }}
        />
      </div>
      <span
        className="draft-num"
        style={{
          fontFamily: "var(--draft-font-title)",
          fontWeight: 800,
          fontSize: 13,
          color: "var(--draft-ink)",
          minWidth: 26,
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  )
}

function StrengthWeakness({
  analysis,
}: {
  analysis: { strengths: string[]; weaknesses: string[] }
}) {
  return (
    <div
      style={{
        background: "var(--draft-soft)",
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div className="draft-eyebrow draft-eyebrow-burg" style={{ marginBottom: 8 }}>
        03 · 라인업의 결
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 10,
              color: "var(--draft-mute)",
              fontWeight: 700,
              letterSpacing: "0.08em",
              marginBottom: 4,
            }}
          >
            강점
          </div>
          <div
            style={{
              fontSize: 12,
              fontFamily: "var(--draft-font-title)",
              fontWeight: 700,
              color: "var(--draft-ink)",
            }}
          >
            {analysis.strengths.length > 0 ? (
              analysis.strengths.join(" · ")
            ) : (
              <span
                className="draft-serif"
                style={{
                  color: "var(--draft-mute)",
                  fontStyle: "normal",
                  fontWeight: 400,
                }}
              >
                특별한 강점 없음
              </span>
            )}
          </div>
        </div>
        <div style={{ width: 1, background: "var(--draft-rule)" }} />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 10,
              color: "var(--draft-mute)",
              fontWeight: 700,
              letterSpacing: "0.08em",
              marginBottom: 4,
            }}
          >
            약점
          </div>
          <div
            style={{
              fontSize: 12,
              fontFamily: "var(--draft-font-title)",
              fontWeight: 700,
              color: "var(--draft-ink)",
            }}
          >
            {analysis.weaknesses.length > 0 ? (
              analysis.weaknesses.join(" · ")
            ) : (
              <span
                className="draft-serif"
                style={{
                  color: "var(--draft-mute)",
                  fontStyle: "normal",
                  fontWeight: 400,
                }}
              >
                균형 잡힌 픽이네요
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function RosterList({ roster }: { roster: Player[] }) {
  const posOrder: Record<Position, number> = { GK: 0, DF: 1, MF: 2, FW: 3 }
  const sorted = [...roster].sort(
    (a, b) => posOrder[a.position] - posOrder[b.position] || b.price - a.price
  )
  return (
    <div
      style={{
        background: "var(--draft-card)",
        border: "1px solid var(--draft-line)",
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div className="draft-eyebrow draft-eyebrow-burg" style={{ marginBottom: 10 }}>
        04 · 픽 목록
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              background: "var(--draft-soft)",
              borderRadius: 8,
            }}
          >
            <PositionBadge pos={p.position} size="sm" />
            <span
              style={{
                fontSize: 13,
                fontFamily: "var(--draft-font-title)",
                fontWeight: 700,
                color: "var(--draft-ink)",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {p.nameKo}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--draft-mute)",
              }}
            >
              {p.teamKo}
            </span>
            <span
              className="draft-num"
              style={{
                fontSize: 12,
                fontFamily: "var(--draft-font-title)",
                fontWeight: 800,
                color: "var(--draft-ink)",
              }}
            >
              £{p.price.toFixed(1)}
            </span>
          </div>
        ))}
        {roster.length === 0 && (
          <span
            className="draft-serif"
            style={{
              fontSize: 12,
              color: "var(--draft-mute)",
              fontStyle: "normal",
              padding: 8,
            }}
          >
            픽이 없습니다
          </span>
        )}
      </div>
    </div>
  )
}

function Standings({ teamData, myUserId }: { teamData: TeamData[]; myUserId: string | null }) {
  const ranked = [...teamData].sort((a, b) => b.score.total - a.score.total)
  return (
    <div
      style={{
        background: "var(--draft-card)",
        border: "1px solid var(--draft-line)",
        borderRadius: 14,
        padding: 18,
        boxShadow: "var(--draft-shadow-1)",
      }}
    >
      <div className="draft-eyebrow draft-eyebrow-burg" style={{ marginBottom: 10 }}>
        05 · 최종 순위
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ranked.map((t, i) => {
          const isMe = t.seat.user_id === myUserId
          return (
            <div
              key={t.seat.seat_index}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                background: isMe ? "var(--draft-burgundy-soft)" : "var(--draft-soft)",
                borderRadius: 10,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background:
                    i === 0
                      ? "var(--draft-burgundy)"
                      : i === 1
                        ? "var(--draft-ink)"
                        : "var(--draft-mute)",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--draft-font-title)",
                  fontWeight: 900,
                  fontSize: 13,
                }}
              >
                {i + 1}
              </div>
              <span
                style={{
                  flex: 1,
                  fontFamily: "var(--draft-font-title)",
                  fontWeight: 800,
                  fontSize: 14,
                  color: "var(--draft-ink)",
                  letterSpacing: "-0.01em",
                }}
              >
                {t.seat.display_name}
                {isMe && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 9,
                      color: "var(--draft-burgundy)",
                      fontWeight: 900,
                      letterSpacing: "0.1em",
                    }}
                  >
                    YOU
                  </span>
                )}
                {t.seat.is_ai && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 9,
                      color: "var(--draft-mute)",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                    }}
                  >
                    AI
                  </span>
                )}
              </span>
              <span
                className="draft-num"
                style={{
                  fontFamily: "var(--draft-font-title)",
                  fontWeight: 900,
                  fontSize: 22,
                  color: "var(--draft-ink)",
                  letterSpacing: "-0.02em",
                }}
              >
                {t.score.total}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatElapsed(sec: number): string {
  if (sec <= 0) return "–"
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 1) return `${s}초`
  return `${m}분 ${s}초`
}
