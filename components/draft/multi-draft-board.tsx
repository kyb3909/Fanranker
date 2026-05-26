"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { useDraftRoomGame } from "@/hooks/use-draft-room-game"
import { TimerRing } from "./timer-ring"
import { PitchViz, rosterToSlots } from "./pitch-viz"
import { AiPanel, BudgetBar, PlayerPoolCard, SnakeOrder } from "./draft-pieces"
import { ChatPanel } from "./chat-panel"
import type { Player, Position } from "@/lib/draft/players"
import { FORMATIONS, type Formation } from "@/lib/draft/engine"
import { analyzeLineup } from "@/lib/draft/visual-helpers"
import type { DraftRoomFullState } from "@/lib/draft/multi-engine"

import "@/app/games/draft/draft-tokens.css"

interface MultiDraftBoardProps {
  initialState: DraftRoomFullState
  myUserId: string | null
  myDisplayName: string | null
  allPlayers: Player[]
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

const PICK_DURATION_SEC = 30

/**
 * 가상 DraftState 같은 형태로 변환 — draft-board.tsx 의 시각 컴포넌트와 호환되게.
 */
function buildSeatRosters(
  state: DraftRoomFullState,
  playerById: Map<string, Player>
): Record<number, Player[]> {
  const result: Record<number, Player[]> = {}
  for (const seat of state.seats) {
    result[seat.seat_index] = []
  }
  for (const pick of state.picks) {
    const p = playerById.get(pick.player_id)
    if (!p) continue
    if (!result[pick.seat_index]) result[pick.seat_index] = []
    result[pick.seat_index]!.push(p)
  }
  return result
}

export function MultiDraftBoard({
  initialState,
  myUserId,
  myDisplayName,
  allPlayers,
}: MultiDraftBoardProps) {
  const router = useRouter()
  const { state, isConnected, pick, triggerTimeout } = useDraftRoomGame({
    roomId: initialState.id,
    initialState,
    myUserId,
    myDisplayName,
  })

  const [posFilter, setPosFilter] = useState<PosFilter>("ALL")
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<SortKey>("recommend")
  const [pinned, setPinned] = useState<Record<string, boolean>>({})
  const [pickError, setPickError] = useState<string | null>(null)

  const playerById = useMemo(() => new Map(allPlayers.map((p) => [p.id, p])), [allPlayers])

  const formation = (state.formation ?? "4-3-3") as Formation
  const totalPicks = state.snake_order?.length ?? 0
  const limits = FORMATIONS[formation]
  const draftedIds = useMemo(() => new Set(state.picks.map((p) => p.player_id)), [state.picks])

  const seatRosters = useMemo(() => buildSeatRosters(state, playerById), [state, playerById])

  const mySeat = useMemo(
    () => state.seats.find((s) => s.user_id === myUserId && s.left_at === null) ?? null,
    [state.seats, myUserId]
  )
  const myRoster = mySeat ? (seatRosters[mySeat.seat_index] ?? []) : []
  const myBudgetUsed = myRoster.reduce((s, p) => s + p.price, 0)
  const myBudgetRemaining = state.budget - myBudgetUsed
  const myPosCounts = useMemo<Record<Position, number>>(() => {
    const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 }
    for (const p of myRoster) counts[p.position]++
    return counts
  }, [myRoster])

  const currentSeatIdx = state.snake_order?.[state.current_pick]
  const currentSeat =
    currentSeatIdx !== undefined
      ? state.seats.find((s) => s.seat_index === currentSeatIdx && s.left_at === null)
      : null
  const myTurn = !!mySeat && currentSeat?.id === mySeat.id
  const isActive = state.status === "drafting"
  const currentRound = Math.floor(state.current_pick / state.max_participants) + 1

  // pick_deadline 기반 남은 시간 계산
  const [remainingSec, setRemainingSec] = useState(PICK_DURATION_SEC)
  useEffect(() => {
    if (!state.pick_deadline_at || !isActive) {
      setRemainingSec(0)
      return
    }
    const deadline = new Date(state.pick_deadline_at).getTime()
    const update = () => {
      const sec = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setRemainingSec(sec)
    }
    update()
    const interval = setInterval(update, 250)
    return () => clearInterval(interval)
  }, [state.pick_deadline_at, isActive])

  // 본인 차례 + 0초 도달 → 서버 timeout 호출 (한 번만)
  const timedOutForPickRef = useTimedOutRef(state.current_pick)
  useEffect(() => {
    if (!isActive) return
    if (remainingSec > 0) return
    if (timedOutForPickRef.value === state.current_pick) return
    timedOutForPickRef.value = state.current_pick
    triggerTimeout()
  }, [remainingSec, isActive, state.current_pick, triggerTimeout, timedOutForPickRef])

  // 종료 시 결과 화면으로
  useEffect(() => {
    if (state.status === "completed") {
      router.push(`/games/draft/epl/room/${state.id}/result`)
    }
    if (state.status === "abandoned") {
      router.push("/games/draft/epl")
    }
  }, [state.status, state.id, router])

  // 필터 + 정렬된 풀
  const filteredPool = useMemo(() => {
    let list = allPlayers.filter((p) => !draftedIds.has(p.id))
    if (posFilter !== "ALL") list = list.filter((p) => p.position === posFilter)
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
      return a.price - b.price
    })
    return list.slice(0, 60)
  }, [allPlayers, draftedIds, posFilter, search, sortBy, pinned])

  const poolCounts = useMemo<Record<PosFilter, number>>(() => {
    const counts: Record<PosFilter, number> = {
      ALL: 0,
      GK: 0,
      DF: 0,
      MF: 0,
      FW: 0,
    }
    for (const p of allPlayers) {
      if (draftedIds.has(p.id)) continue
      counts.ALL++
      counts[p.position]++
    }
    return counts
  }, [allPlayers, draftedIds])

  const { strengths, weaknesses } = analyzeLineup(myRoster)
  const slotsFilled = rosterToSlots(myRoster, formation)

  const handlePick = async (playerId: string) => {
    setPickError(null)
    const result = await pick(playerId)
    if (!result.ok && result.error) setPickError(result.error)
  }
  const togglePin = (id: string) => setPinned((prev) => ({ ...prev, [id]: !prev[id] }))

  // SnakeOrder 컴포넌트는 솔로 DraftState 호환이라 어댑터 만들기
  const snakeDraftState = useMemo(
    () => ({
      participants: state.seats.map((s) => ({
        seatIndex: s.seat_index,
        name: s.display_name,
        isAI: s.is_ai,
        formation,
      })),
      picks: [],
      currentPick: state.current_pick,
      snakeOrder: state.snake_order ?? [],
      status: "drafting" as const,
      budget: [],
      roster: {},
      draftedPlayerIds: new Set<string>(),
      totalRounds: state.total_rounds,
    }),
    [state, formation]
  )

  return (
    <div className="draft-scope" style={{ background: "var(--draft-paper)" }}>
      {/* ─── dark editorial 톱바 ─── */}
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
            <span
              className="draft-dot-live"
              style={{
                width: 6,
                height: 6,
                background: isConnected ? "var(--draft-burgundy)" : "var(--draft-mute)",
              }}
              aria-hidden
            />
            LIVE PvP
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
              R{currentRound}/{state.total_rounds}
            </span>
          </div>
        </div>

        <div style={{ width: 1, height: 32, background: "rgba(244,236,230,0.15)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <TimerRing
            duration={PICK_DURATION_SEC}
            isActive={isActive && myTurn}
            // server-driven: 강제 외부 값 사용
            onTimeout={() => {
              /* 외부 effect 처리 */
            }}
            onReset={state.current_pick}
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
                  : `${currentSeat?.display_name ?? "?"} 가 픽 중…`}
              {currentSeat?.is_ai && isActive && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 9,
                    color: "rgba(244,236,230,0.6)",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                  }}
                >
                  AI
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ width: 1, height: 32, background: "rgba(244,236,230,0.15)" }} />

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
              {state.current_pick + 1}
            </span>{" "}
            / {totalPicks}
            <span className="draft-num" style={{ marginLeft: 12, color: "rgba(244,236,230,0.7)" }}>
              ⏱ {remainingSec}s
            </span>
          </div>
          {mySeat && <SnakeOrder state={snakeDraftState} mySeat={mySeat.seat_index} />}
        </div>
      </div>

      {/* ─── 본문 4컬럼 (풀 / 라인업 / AI / 채팅) ─── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 0,
          minHeight: "calc(100vh - 220px)",
        }}
        className="multi-draft-grid"
      >
        <style>{`
          @media (min-width: 1200px) {
            .multi-draft-grid {
              grid-template-columns: 340px minmax(0, 1fr) 280px 320px !important;
            }
          }
          @media (min-width: 900px) and (max-width: 1199px) {
            .multi-draft-grid {
              grid-template-columns: 320px minmax(0, 1fr) 280px !important;
            }
          }
        `}</style>

        {/* ─── 좌측: 풀 ─── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: "var(--draft-card)",
            borderRight: "1px solid var(--draft-line)",
            minHeight: 0,
          }}
        >
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
                  outline: "none",
                  color: "var(--draft-ink)",
                  fontFamily: "inherit",
                }}
              />
            </div>
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

          {pickError && (
            <div
              style={{
                padding: "10px 14px",
                background: "var(--draft-burgundy-soft)",
                color: "var(--draft-burgundy-deep)",
                fontSize: 12,
                fontFamily: "var(--draft-font-title)",
                fontWeight: 700,
              }}
            >
              {pickError}
            </div>
          )}

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: "calc(100vh - 360px)",
            }}
          >
            {filteredPool.map((p) => {
              const slotFull = myPosCounts[p.position] >= limits[p.position]
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
                  onPick={() => handlePick(p.id)}
                  onTogglePin={() => togglePin(p.id)}
                />
              )
            })}
          </div>
        </div>

        {/* ─── 중앙: 라인업 ─── */}
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
                <span className="draft-num">{myRoster.length}</span> / {state.total_rounds}명 완성
              </h2>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, maxHeight: 540 }}>
            <PitchViz formation={formation} filled={slotsFilled} />
          </div>

          <div
            style={{
              background: "var(--draft-card)",
              border: "1px solid var(--draft-line)",
              borderRadius: 14,
              padding: 14,
            }}
          >
            <BudgetBar used={myBudgetUsed} total={state.budget} currency="£" />
          </div>

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
              <SwLine label="강점" items={strengths} fallback="아직 분석할 데이터가 부족해요" />
              <div style={{ width: 1, background: "var(--draft-rule)" }} />
              <SwLine label="약점" items={weaknesses} fallback="균형 잡힌 픽이네요" />
            </div>
          </div>
        </div>

        {/* ─── 우측 1: 참가자 ─── */}
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
              참가자 · {state.seats.filter((s) => !s.left_at).length}인
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
            }}
          >
            {state.seats
              .filter((s) => !s.left_at)
              .map((s) => {
                const picks = seatRosters[s.seat_index] ?? []
                const used = picks.reduce((sum, p) => sum + p.price, 0)
                const isCurrent = s.seat_index === currentSeatIdx && isActive
                return (
                  <AiPanel
                    key={s.id}
                    name={s.display_name}
                    isAI={s.is_ai}
                    isMe={s.user_id === myUserId}
                    isCurrent={isCurrent}
                    picks={picks}
                    budgetUsed={used}
                    budget={state.budget}
                    rosterSize={state.total_rounds}
                  />
                )
              })}
          </div>
        </div>

        {/* ─── 우측 2: 채팅 ─── */}
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
// 보조 컴포넌트 / 훅
// ─────────────────────────────────────────────

function SwLine({ label, items, fallback }: { label: string; items: string[]; fallback: string }) {
  return (
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
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          fontFamily: "var(--draft-font-title)",
          fontWeight: 700,
          color: "var(--draft-ink)",
        }}
      >
        {items.length > 0 ? (
          items.join(" · ")
        ) : (
          <span
            className="draft-serif"
            style={{
              color: "var(--draft-mute)",
              fontStyle: "italic",
              fontWeight: 400,
            }}
          >
            {fallback}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * 같은 pick 에 timeout 을 두 번 트리거하지 않게 ref 로 관리.
 */
function useTimedOutRef(currentPick: number) {
  const ref = useMemo(() => ({ value: -1 }), [])
  useEffect(() => {
    // 새 pick 시작 시 reset
    if (ref.value !== currentPick && ref.value < currentPick) {
      // no-op: 새 pick 으로 넘어가면 자연스럽게 다시 trigger 가능
    }
  }, [currentPick, ref])
  return ref
}
