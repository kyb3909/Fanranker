"use client"

import { useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"
import { TimerRing } from "./timer-ring"
import { PitchViz, mergeRosterIntoSlots } from "./pitch-viz"
import { AiPanel, BudgetBar, PlayerPoolCard, SnakeOrder } from "./draft-pieces"
import { getAllPlayers, type Player, type Position } from "@/lib/draft/players"
import type { DraftState } from "@/lib/draft/engine"
import { getCurrentSeat, getCurrentRound, getSeatLimits, pickBlockReason } from "@/lib/draft/engine"
import { analyzeLineup } from "@/lib/draft/visual-helpers"
import { canPlay } from "@/lib/draft/positions"

import "@/app/games/draft/draft-tokens.css"

interface DraftBoardProps {
  state: DraftState
  mySeat: number
  onPick: (playerId: string) => void
  onTimeout: () => void
  timerReset: number
  /** 도판 배치. 드래프트가 끝난 뒤 배치 화면이 그대로 이어받아야 해서 부모가 들고 있다. */
  arranged: Record<string, Player | null>
  onArrange: (next: Record<string, Player | null>) => void
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

/** 못 뽑는 이유 → 화면 문구. "슬롯"은 자리가 아예 안 나오는 경우만이다. */
const BLOCK_LABEL: Record<string, string | null> = {
  none: null,
  taken: "이미 뽑힘",
  budget: "예산 초과",
  reserve: "남은 자리 예산 부족",
  slots: "설 자리 없음",
}

export function DraftBoard({
  state,
  mySeat,
  onPick,
  onTimeout,
  timerReset,
  arranged,
  onArrange,
}: DraftBoardProps) {
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

  const myRoster = useMemo(() => state.roster[mySeat] || [], [state.roster, mySeat])
  const myBudgetRemaining = state.budget[mySeat] ?? 0
  const myLimits = getSeatLimits(state, mySeat)
  const formation = myParticipant?.formation ?? "4-3-3"

  const myPosCounts = useMemo<Record<Position, number>>(() => {
    const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 }
    for (const p of myRoster) counts[p.position]++
    return counts
  }, [myRoster])

  const allPlayers = useMemo(() => getAllPlayers(), [])

  /** 지금 뽑을 수 있는 선수 id — 정렬과 카드 판정이 같은 답을 쓰게 한 곳에서 만든다. */
  const pickable = useMemo(() => {
    const ok = new Set<string>()
    if (!myTurn) return ok
    for (const p of allPlayers) {
      if (state.draftedPlayerIds.has(p.id)) continue
      if (pickBlockReason(state, mySeat, p.id) === null) ok.add(p.id)
    }
    return ok
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPlayers, state, mySeat, myTurn])

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
        /**
         * ⚠️ **뽑을 수 있는 선수를 먼저** 올린다.
         *
         * 종전엔 값비싼 순으로만 정렬하고 60명에서 잘랐다. 그래서 비싼 선수를 두세 명
         * 잡으면 화면에 남는 60장이 전부 예산 초과가 돼 "더는 영입을 못 한다"로 보였다
         * (2026-08-25 운영자 제보 + 자동 플레이 재현: 3픽 만에 영입 버튼 전멸).
         * 실제로는 살 수 있는 싼 선수가 500명 넘게 있었지만 목록 밖이었다.
         */
        const pa = pickable.has(a.id) ? 1 : 0
        const pb = pickable.has(b.id) ? 1 : 0
        if (pa !== pb) return pb - pa
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
  }, [allPlayers, state.draftedPlayerIds, posFilter, search, sortBy, pinned, pickable])

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
  // 모바일에서 보이는 쪽 (데스크톱은 3컬럼이라 무시된다)
  const [mobileTab, setMobileTab] = useState<"pool" | "lineup">("pool")
  const slotsFilled = useMemo(
    () => mergeRosterIntoSlots(arranged, myRoster, formation),
    [arranged, myRoster, formation]
  )
  const rosterSize = state.totalRounds // 라운드 수 = 1인 로스터 크기
  const myBudgetUsed = state.initialBudget - myBudgetRemaining

  const togglePin = (id: string) => setPinned((prev) => ({ ...prev, [id]: !prev[id] }))

  /**
   * 선수 풀 → 도판 드래그 (2026-08-25 운영자 요청: "선수창에서도 바로 드래그해서 넣게").
   *
   * 풀과 도판은 다른 컴포넌트라 드래그 상태를 보드가 들고 있어야 한다. 도판 슬롯에는
   * `data-pitch-slot` 을 달아 뒀으므로 좌표로 가장 가까운 **빈** 슬롯을 찾는다.
   * 놓으면 두 가지가 한 번에 일어난다 — 영입(onPick) + 그 자리에 배치(setArranged).
   * arranged 를 먼저 정해 두면 픽 직후 mergeRosterIntoSlots 가 그 자리를 유지한다.
   */
  const poolDragRef = useRef<{ player: Player; x0: number; y0: number; moved: boolean } | null>(
    null
  )
  const [poolDrag, setPoolDrag] = useState<{ player: Player; x: number; y: number } | null>(null)

  const emptySlotAt = (x: number, y: number, player: Player): string | null => {
    const nodes = [...document.querySelectorAll<HTMLElement>("[data-pitch-slot]")]
    let best: string | null = null
    let bestD = Infinity
    for (const n of nodes) {
      if (n.dataset.pitchSlotFilled === "1") continue
      const pos = n.dataset.pitchSlotPos as Position
      if (!canPlay(player.position, pos)) continue
      const r = n.getBoundingClientRect()
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2))
      if (d < bestD) {
        bestD = d
        best = n.dataset.pitchSlot ?? null
      }
    }
    return bestD <= 90 ? best : null
  }

  const startPoolDrag = (player: Player, e: React.PointerEvent) => {
    poolDragRef.current = { player, x0: e.clientX, y0: e.clientY, moved: false }
    const onMove = (ev: PointerEvent) => {
      const d = poolDragRef.current
      if (!d) return
      if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 6) return
      d.moved = true
      ev.preventDefault() // 드래그로 승격된 뒤에만 스크롤을 막는다
      setPoolDrag({ player: d.player, x: ev.clientX, y: ev.clientY })
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      const d = poolDragRef.current
      poolDragRef.current = null
      setPoolDrag(null)
      if (!d?.moved) return // 안 움직였으면 그냥 클릭 — 영입 버튼이 처리한다
      const target = emptySlotAt(ev.clientX, ev.clientY, d.player)
      if (target) {
        onArrange({ ...arranged, [target]: d.player })
        onPick(d.player.id)
        return
      }
      // 빈 자리를 정확히 못 짚었어도 **잔디 안**이면 영입은 시킨다. 자동 배치가 받아 준다.
      // (자리를 겨냥했는데 아무 일도 안 일어나면 드래그가 고장 난 걸로 읽힌다.)
      const root = document.querySelector<HTMLElement>("[data-pitch-root]")
      const r = root?.getBoundingClientRect()
      const inside =
        !!r &&
        ev.clientX >= r.left &&
        ev.clientX <= r.right &&
        ev.clientY >= r.top &&
        ev.clientY <= r.bottom
      if (inside) onPick(d.player.id)
    }
    window.addEventListener("pointermove", onMove, { passive: false })
    window.addEventListener("pointerup", onUp)
  }

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
              color: "rgba(246,228,232,0.5)",
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
                color: "rgba(246,228,232,0.5)",
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
            background: "rgba(246,228,232,0.15)",
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
                color: "rgba(246,228,232,0.5)",
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
            background: "rgba(246,228,232,0.15)",
          }}
        />

        {/* 스네이크 순서 동그라미 */}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div
            className="draft-eyebrow"
            style={{
              color: "rgba(246,228,232,0.5)",
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

      {/* 모바일 전환 탭 (2026-08-25) — 데스크톱은 3컬럼이라 풀과 라인업이 나란히 보이지만,
          모바일은 세로로 쌓여 라인업이 긴 선수 풀 **아래로** 밀린다. 폰에서 내 라인업을
          보거나 도판에서 자리를 바꾸려면 매번 한참 스크롤해야 했다.
          드래프트 중 "지금 뽑기"와 "내 팀 확인"은 서로 다른 순간이라 탭이 맞다. */}
      <div
        className="draft-mobile-tabs"
        style={{
          display: "flex",
          gap: 8,
          padding: "12px 16px",
          // 스크롤해도 전환이 손에 닿게. 사이트 헤더 아래에 붙는다.
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "var(--draft-paper)",
          borderBottom: "1px solid var(--draft-line)",
        }}
      >
        {(
          [
            ["pool", "선수 풀"],
            ["lineup", `내 라인업 · ${myRoster.length}/${rosterSize}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setMobileTab(key)
              // 탭만 바꾸면 화면은 그대로라 아래 내용이 접혀 보이지 않는다.
              // 전환한 쪽을 바로 보여 준다 (사이트 헤더 높이만큼 여유를 둔다).
              requestAnimationFrame(() => {
                const el = document.querySelector(
                  key === "lineup" ? ".draft-col-lineup" : ".draft-col-pool"
                )
                if (!el) return
                const y = el.getBoundingClientRect().top + window.scrollY - 64
                window.scrollTo({ top: Math.max(0, y), behavior: "smooth" })
              })
            }}
            aria-pressed={mobileTab === key}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 10,
              fontFamily: "var(--draft-font-title)",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              border: `2px solid ${mobileTab === key ? "var(--draft-burgundy)" : "var(--draft-line)"}`,
              background: mobileTab === key ? "var(--draft-burgundy)" : "var(--draft-card)",
              color: mobileTab === key ? "#fff" : "var(--draft-ink)",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {label}
          </button>
        ))}
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
        data-tab={mobileTab}
      >
        <style>{`
          @media (min-width: 1024px) {
            .draft-board-grid {
              grid-template-columns: 380px minmax(0, 1fr) 320px !important;
            }
            .draft-mobile-tabs { display: none !important; }
          }
          /* 모바일에서만 한 쪽씩 — display:none 이라 상태는 유지된다(언마운트 아님) */
          @media (max-width: 1023px) {
            .draft-board-grid[data-tab="pool"] .draft-col-lineup { display: none !important; }
            .draft-board-grid[data-tab="lineup"] .draft-col-pool { display: none !important; }
          }
        `}</style>

        {/* ─── 좌측: 선수 풀 ─── */}
        <div
          className="draft-col-pool"
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
                      borderRadius: 8,
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
                <p className="draft-serif" style={{ fontSize: 13, fontStyle: "normal" }}>
                  조건에 맞는 선수가 없어요. 필터를 조정해보세요.
                </p>
              </div>
            ) : (
              filteredPool.map((p) => {
                // ⚠️ 판정은 엔진 한 곳에서만 한다. 종전엔 여기서 "포지션 개수 >= 한도" 로
                //    따로 계산해, 자격 유연화 뒤에도 풀에서는 잠겼다 (메리노(MF)가 FW 자리에
                //    설 수 있는데 미드가 찼다고 회색 처리됨 — 2026-08-25 운영자 제보).
                const block = pickBlockReason(state, mySeat, p.id)
                const overBudget = block === "budget"
                const slotFull = block === "slots" || block === "reserve"
                const canPick = isActive && myTurn && block === null
                return (
                  <PlayerPoolCard
                    key={p.id}
                    player={p}
                    canPick={canPick}
                    slotFull={slotFull}
                    overBudget={overBudget}
                    reasonLabel={BLOCK_LABEL[block ?? "none"]}
                    onDragStart={(e) => startPoolDrag(p, e)}
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
          className="draft-col-lineup"
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
            <PitchViz
              formation={formation}
              filled={slotsFilled}
              onArrange={onArrange}
              incomingPosition={poolDrag?.player.position ?? null}
            />
          </div>

          {/* 예산 */}
          <div
            style={{
              background: "var(--draft-card)",
              border: "1px solid var(--draft-line)",
              borderRadius: 16,
              padding: 14,
            }}
          >
            {/* ⚠️ total 이 80 으로 **하드코딩**돼 있었다 (2026-08-25 실측). 엔진은
                카탈로그 예산으로 도는데 막대만 80 기준으로 그려서, 예산을 바꾸면
                화면 잔액이 실제와 어긋났다. state.initialBudget 이 정본이다. */}
            <BudgetBar used={myBudgetUsed} total={state.initialBudget} currency="£" />
          </div>

          {/* 강점/약점 */}
          <div
            style={{
              background: "var(--draft-soft)",
              borderRadius: 16,
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
                        fontStyle: "normal",
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
                    fontStyle: "normal",
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

      {/* 풀에서 끌고 오는 카드 — 도판 드래그와 같은 모양으로 손가락을 따라다닌다 */}
      {poolDrag && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: poolDrag.x,
            top: poolDrag.y,
            transform: "translate(-50%, -50%) scale(1.08)",
            pointerEvents: "none",
            zIndex: 9999,
            background: "rgba(255,255,255,0.98)",
            borderRadius: 8,
            padding: "6px 10px",
            border: "2px solid #ffd54a",
            boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
            fontFamily: "var(--draft-font-title)",
            fontWeight: 900,
            fontSize: 12,
            color: "var(--draft-ink)",
            whiteSpace: "nowrap",
          }}
        >
          {poolDrag.player.nameKo} · £{poolDrag.player.price.toFixed(1)}
        </div>
      )}
    </div>
  )
}
