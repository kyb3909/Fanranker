"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { TimerRing } from "./timer-ring"
import { PitchViz, rosterToSlots } from "./pitch-viz"
import { AiPanel, BudgetBar, PlayerPoolCard, SnakeOrder } from "./draft-pieces"
import { getAllPlayers, type Player, type Position } from "@/lib/draft/players"
import type { DraftState } from "@/lib/draft/engine"
import { getCurrentSeat, getCurrentRound, getSeatLimits } from "@/lib/draft/engine"
import { analyzeLineup } from "@/lib/draft/visual-helpers"

import "@/app/games/draft/draft-tokens.css"

interface DraftBoardProps {
  state: DraftState
  mySeat: number
  onPick: (playerId: string) => void
  onTimeout: () => void
  timerReset: number
}

type SortKey = "recommend" | "price-desc" | "price-asc"
type PosFilter = Position | "ALL"

const POS_TABS: { key: PosFilter; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "GK", label: "골키퍼" },
  { key: "DF", label: "수비" },
  { key: "MF", label: "미드" },
  { key: "FW", label: "공격" },
]

export function DraftBoard({ state, mySeat, onPick, onTimeout, timerReset }: DraftBoardProps) {
  const [posFilter, setPosFilter] = useState<PosFilter>("ALL")
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<SortKey>("recommend")
  const [pinned, setPinned] = useState<Record<string, boolean>>({})

  const currentSeat = getCurrentSeat(state)
  const currentRound = getCurrentRound(state)
  const myTurn = currentSeat === mySeat
  const isActive = state.status === "drafting"
  const currentParticipant = state.participants.find((p) => p.seatIndex === currentSeat)
  const myParticipant = state.participants.find((p) => p.seatIndex === mySeat)
  const totalPicks = state.snakeOrder.length

  const myRoster = state.roster[mySeat] || []
  const myBudgetRemaining = state.budget[mySeat] ?? 0
  const myLimits = getSeatLimits(state, mySeat)
  const formation = myParticipant?.formation ?? "4-3-3"

  const myPosCounts = useMemo<Record<Position, number>>(() => {
    const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 }
    for (const p of myRoster) counts[p.position]++
    return counts
  }, [myRoster])

  const allPlayers = useMemo(() => getAllPlayers(), [])

  const filteredPool = useMemo(() => {
    let list = allPlayers.filter((p) => !state.draftedPlayerIds.has(p.id))

    if (posFilter !== "ALL") {
      list = list.filter((p) => p.position === posFilter)
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (p) =>
          p.nameKo.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.teamKo.toLowerCase().includes(q)
      )
    }

    list = [...list].sort((a, b) => {
      if (sortBy === "recommend") {
        const sa = a.price + (pinned[a.id] ? 5 : 0)
        const sb = b.price + (pinned[b.id] ? 5 : 0)
        return sb - sa
      }
      if (sortBy === "price-desc") return b.price - a.price
      if (sortBy === "price-asc") return a.price - b.price
      return 0
    })

    // 최대 60개만 (DOM 폭발 방지)
    return list.slice(0, 60)
  }, [allPlayers, state.draftedPlayerIds, posFilter, search, sortBy, pinned])

  // 포지션별 풀 카운트 (탭에 표시)
  const poolCounts = useMemo<Record<PosFilter, number>>(() => {
    const counts: Record<PosFilter, number> = {
      ALL: 0,
      GK: 0,
      DF: 0,
      MF: 0,
      FW: 0,
    }
    for (const p of allPlayers) {
      if (state.draftedPlayerIds.has(p.id)) continue
      counts.ALL++
      counts[p.position]++
    }
    return counts
  }, [allPlayers, state.draftedPlayerIds])

  const { strengths, weaknesses } = analyzeLineup(myRoster)
  const slotsFilled = rosterToSlots(myRoster, formation)
  const rosterSize = state.totalRounds // 라운드 수 = 1인 로스터 크기
  const myBudgetUsed = 80 - myBudgetRemaining // INITIAL_BUDGET 80

  const togglePin = (id: string) => setPinned((prev) => ({ ...prev, [id]: !prev[id] }))

  return (
    <div className="draft-scope" style={{ background: "var(--draft-paper)" }}>
      {/* ─── 상단: dark editorial 톱바 ─── */}
      <div
        style={{
          background: "var(--draft-ink)",
          color: "var(--draft-paper)",
          borderBottom: "3px solid var(--draft-burgundy)",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        {/* 좌측: LIVE DRAFT eyebrow + 게임 정보 */}
        <div>
          <div
            className="draft-eyebrow"
            style={{
              color: "rgba(244,236,230,0.5)",
              fontSize: 9,
              marginBottom: 2,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span className="draft-dot-live" style={{ width: 6, height: 6 }} aria-hidden />
            LIVE DRAFT
          </div>
          <div
            style={{
              fontFamily: "var(--draft-font-title)",
              fontWeight: 900,
              fontSize: 17,
              letterSpacing: "-0.02em",
              display: "flex",
              alignItems: "baseline",
              gap: 8,
            }}
          >
            EPL · {formation}
            <span
              className="draft-num"
              style={{
                fontSize: 11,
                color: "rgba(244,236,230,0.5)",
                fontWeight: 600,
              }}
            >
              R{currentRound}/{state.totalRounds}
            </span>
          </div>
        </div>

        <div
          style={{
            width: 1,
            height: 32,
            background: "rgba(244,236,230,0.15)",
          }}
        />

        {/* 타이머 ring + 현재 차례 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <TimerRing
            duration={30}
            isActive={isActive && myTurn}
            onTimeout={onTimeout}
            onReset={timerReset}
            size={52}
            dark
          />
          <div>
            <div
              className="draft-eyebrow"
              style={{
                color: "rgba(244,236,230,0.5)",
                fontSize: 9,
                marginBottom: 1,
              }}
            >
              {!isActive ? "종료" : myTurn ? "내 차례" : "대기"}
            </div>
            <div
              style={{
                fontFamily: "var(--draft-font-title)",
                fontWeight: 800,
                fontSize: 14,
                letterSpacing: "-0.01em",
              }}
            >
              {!isActive
                ? "드래프트 종료"
                : myTurn
                  ? "당신 차례입니다"
                  : `${currentParticipant?.name ?? "AI"} 가 픽 중…`}
            </div>
          </div>
        </div>

        <div
          style={{
            width: 1,
            height: 32,
            background: "rgba(244,236,230,0.15)",
          }}
        />

        {/* 스네이크 순서 동그라미 */}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div
            className="draft-eyebrow"
            style={{
              color: "rgba(244,236,230,0.5)",
              fontSize: 9,
              marginBottom: 6,
            }}
          >
            PICK{" "}
            <span className="draft-num" style={{ color: "var(--draft-paper)" }}>
              {state.currentPick + 1}
            </span>{" "}
            / {totalPicks}
          </div>
          <SnakeOrder state={state} mySeat={mySeat} />
        </div>
      </div>

      {/* ─── 본문: 3컬럼 ─── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 0,
          minHeight: "calc(100vh - 220px)",
        }}
        className="draft-board-grid"
      >
        <style>{`
          @media (min-width: 1024px) {
            .draft-board-grid {
              grid-template-columns: 380px minmax(0, 1fr) 320px !important;
            }
          }
        `}</style>

        {/* ─── 좌측: 선수 풀 ─── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: "var(--draft-card)",
            borderRight: "1px solid var(--draft-line)",
            minHeight: 0,
          }}
        >
          {/* 필터 sticky */}
          <div
            style={{
              padding: 14,
              borderBottom: "1px solid var(--draft-line)",
              background: "var(--draft-paper)",
            }}
          >
            <div className="draft-eyebrow draft-eyebrow-burg" style={{ marginBottom: 10 }}>
              선수 풀 ·{" "}
              <span className="draft-num">
                {filteredPool.length}/{poolCounts.ALL}
              </span>
            </div>

            {/* 검색 */}
            <div style={{ position: "relative", marginBottom: 10 }}>
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--draft-mute)",
                  pointerEvents: "none",
                }}
              />
              <input
                type="text"
                placeholder="이름, 팀명 검색…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px 9px 32px",
                  borderRadius: 999,
                  border: "1.5px solid var(--draft-line)",
                  background: "var(--draft-card)",
                  fontSize: 13,
                  fontFamily: "inherit",
                  outline: "none",
                  color: "var(--draft-ink)",
                }}
              />
            </div>

            {/* 포지션 탭 */}
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {POS_TABS.map((tab) => {
                const active = posFilter === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setPosFilter(tab.key)}
                    style={{
                      flex: 1,
                      padding: "6px 4px",
                      borderRadius: 6,
                      background: active ? "var(--draft-ink)" : "transparent",
                      color: active ? "white" : "var(--draft-ink)",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "var(--draft-font-title)",
                      fontWeight: 700,
                      fontSize: 11,
                      letterSpacing: "-0.01em",
                      lineHeight: 1.2,
                    }}
                  >
                    {tab.label}
                    <br />
                    <span
                      className="draft-num"
                      style={{ fontSize: 10, opacity: 0.7, fontWeight: 600 }}
                    >
                      {poolCounts[tab.key]}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* 정렬 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--draft-mute)",
                  fontFamily: "var(--draft-font-title)",
                  fontWeight: 600,
                }}
              >
                정렬
              </span>
              <div style={{ display: "flex", gap: 4, flex: 1 }}>
                {(
                  [
                    { id: "recommend", label: "추천" },
                    { id: "price-desc", label: "£ ↓" },
                    { id: "price-asc", label: "£ ↑" },
                  ] as { id: SortKey; label: string }[]
                ).map((s) => {
                  const active = sortBy === s.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSortBy(s.id)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: active ? "var(--draft-burgundy)" : "transparent",
                        color: active ? "white" : "var(--draft-mute)",
                        border: `1px solid ${active ? "var(--draft-burgundy)" : "var(--draft-line)"}`,
                        fontSize: 10,
                        fontFamily: "var(--draft-font-title)",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 리스트 */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: "calc(100vh - 380px)",
            }}
          >
            {filteredPool.length === 0 ? (
              <div
                style={{
                  padding: 32,
                  textAlign: "center",
                  color: "var(--draft-mute)",
                }}
              >
                <div className="draft-eyebrow" style={{ marginBottom: 8 }}>
                  EMPTY
                </div>
                <p className="draft-serif" style={{ fontSize: 13, fontStyle: "italic" }}>
                  조건에 맞는 선수가 없어요. 필터를 조정해보세요.
                </p>
              </div>
            ) : (
              filteredPool.map((p) => {
                const slotFull = myPosCounts[p.position] >= myLimits[p.position]
                const overBudget = p.price > myBudgetRemaining
                const canPick = isActive && myTurn && !slotFull && !overBudget
                return (
                  <PlayerPoolCard
                    key={p.id}
                    player={p}
                    canPick={canPick}
                    slotFull={slotFull}
                    overBudget={overBudget}
                    pinned={pinned[p.id]}
                    onPick={() => onPick(p.id)}
                    onTogglePin={() => togglePin(p.id)}
                  />
                )
              })
            )}
          </div>
        </div>

        {/* ─── 중앙: 내 라인업 ─── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: 20,
            gap: 14,
            overflow: "hidden",
            background: "var(--draft-paper)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div className="draft-eyebrow draft-eyebrow-burg">내 라인업 · {formation}</div>
              <h2
                style={{
                  fontFamily: "var(--draft-font-title)",
                  fontWeight: 900,
                  fontSize: 24,
                  letterSpacing: "-0.025em",
                  marginTop: 2,
                  color: "var(--draft-ink)",
                }}
              >
                <span className="draft-num">{myRoster.length}</span> / {rosterSize}명 완성
              </h2>
            </div>
          </div>

          {/* 잔디 viz */}
          <div style={{ flex: 1, minHeight: 0, maxHeight: 540 }}>
            <PitchViz formation={formation} filled={slotsFilled} />
          </div>

          {/* 예산 */}
          <div
            style={{
              background: "var(--draft-card)",
              border: "1px solid var(--draft-line)",
              borderRadius: 14,
              padding: 14,
            }}
          >
            <BudgetBar used={myBudgetUsed} total={80} currency="£" />
          </div>

          {/* 강점/약점 */}
          <div
            style={{
              background: "var(--draft-soft)",
              borderRadius: 14,
              padding: 14,
            }}
          >
            <div className="draft-eyebrow draft-eyebrow-burg" style={{ marginBottom: 8 }}>
              이 라인업의 결
            </div>
            <div style={{ display: "flex", gap: 16 }}>
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
                  {strengths.length > 0 ? (
                    strengths.join(" · ")
                  ) : (
                    <span
                      className="draft-serif"
                      style={{
                        color: "var(--draft-mute)",
                        fontStyle: "italic",
                        fontWeight: 400,
                      }}
                    >
                      아직 분석할 데이터가 부족해요
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
                  {weaknesses.length > 0 ? (
                    weaknesses.join(" · ")
                  ) : (
                    <span
                      className="draft-serif"
                      style={{
                        color: "var(--draft-mute)",
                        fontStyle: "italic",
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
        </div>

        {/* ─── 우측: AI 패널 + 픽 로그 ─── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: "var(--draft-paper)",
            borderLeft: "1px solid var(--draft-line)",
            minHeight: 0,
          }}
        >
          <div
            style={{
              padding: 14,
              borderBottom: "1px solid var(--draft-line)",
            }}
          >
            <div className="draft-eyebrow draft-eyebrow-burg" style={{ marginBottom: 4 }}>
              참가자 · {state.participants.length}인
            </div>
            <h3
              style={{
                fontFamily: "var(--draft-font-title)",
                fontWeight: 900,
                fontSize: 16,
                color: "var(--draft-ink)",
              }}
            >
              드래프트 진행률
            </h3>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              maxHeight: "calc(100vh - 320px)",
            }}
          >
            {state.participants.map((p) => {
              if (p.seatIndex === mySeat) return null
              const picks = state.roster[p.seatIndex] ?? []
              const used = 80 - (state.budget[p.seatIndex] ?? 0)
              return (
                <AiPanel
                  key={p.seatIndex}
                  name={p.name}
                  isAI={p.isAI}
                  isMe={false}
                  isCurrent={p.seatIndex === currentSeat && isActive}
                  picks={picks}
                  budgetUsed={used}
                  budget={80}
                  rosterSize={rosterSize}
                />
              )
            })}

            <div
              style={{
                height: 1,
                background: "var(--draft-rule)",
                margin: "4px 0",
              }}
            />

            <div className="draft-eyebrow" style={{ marginBottom: 4 }}>
              최근 픽
            </div>
            <div
              style={{
                background: "var(--draft-card)",
                border: "1px solid var(--draft-line)",
                borderRadius: 12,
                padding: 12,
                fontFamily: "var(--draft-font-mono)",
                fontSize: 11,
                lineHeight: 1.7,
              }}
            >
              {state.picks.length === 0 ? (
                <div
                  className="draft-serif"
                  style={{
                    color: "var(--draft-mute)",
                    fontStyle: "italic",
                    textAlign: "center",
                    fontFamily: "var(--draft-font-serif)",
                  }}
                >
                  드래프트 대기 중
                </div>
              ) : (
                state.picks
                  .slice(-6)
                  .reverse()
                  .map((pick) => {
                    const participant = state.participants.find(
                      (pp) => pp.seatIndex === pick.seatIndex
                    )
                    const player = state.roster[pick.seatIndex]?.find(
                      (pp) => pp.id === pick.playerId
                    )
                    if (!player) return null
                    return (
                      <div
                        key={pick.pickNumber}
                        style={{
                          display: "flex",
                          gap: 6,
                          alignItems: "center",
                        }}
                      >
                        <span
                          className="draft-num"
                          style={{
                            color: "var(--draft-mute)",
                            minWidth: 24,
                          }}
                        >
                          #{pick.pickNumber + 1}
                        </span>
                        <span
                          style={{
                            minWidth: 40,
                            color: "var(--draft-burgundy)",
                            fontWeight: 700,
                            fontFamily: "var(--draft-font-title)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {participant?.name?.slice(0, 4) ?? "?"}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            fontFamily: "var(--draft-font-title)",
                            color: "var(--draft-ink)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {player.nameKo}
                        </span>
                        <span className="draft-num">£{player.price.toFixed(1)}</span>
                      </div>
                    )
                  })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
