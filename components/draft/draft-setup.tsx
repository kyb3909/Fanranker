"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getAllPlayers } from "@/lib/draft/players"
import { FORMATIONS, type Formation } from "@/lib/draft/engine"
import type { DraftCatalogEntry } from "@/lib/draft/games-catalog"
import type { OpenRoomSummary } from "@/lib/draft/rooms"
import { OpenRoomsGrid } from "./open-rooms-grid"
import type { GameMode } from "./use-draft-game"

const FORMATION_LIST: Formation[] = ["4-4-2", "4-3-3", "3-5-2", "3-4-3", "5-3-2", "5-4-1"]

interface DraftSetupProps {
  entry: DraftCatalogEntry | undefined
  mode: GameMode
  setMode: (mode: GameMode) => void
  aiCount: number
  setAiCount: (n: number) => void
  mySeat: number
  setMySeat: (n: number) => void
  playerName: string
  setPlayerName: (name: string) => void
  myFormation: Formation
  setMyFormation: (f: Formation) => void
  onStart: () => void
}

export function DraftSetup({
  entry,
  mode,
  setMode,
  aiCount,
  setAiCount,
  mySeat,
  setMySeat,
  playerName,
  setPlayerName,
  myFormation,
  setMyFormation,
  onStart,
}: DraftSetupProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [inviteCode, setInviteCode] = useState("")
  const [isPrivate, setIsPrivate] = useState(false)
  const [openRooms, setOpenRooms] = useState<OpenRoomSummary[] | null>(null)

  useEffect(() => {
    if (mode !== "multi") return
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch("/api/draft-rooms?limit=4", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setOpenRooms(data.rooms ?? [])
      } catch {
        // ignore
      }
    }
    tick()
    const interval = setInterval(tick, 15_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [mode])

  const totalPlayers = mode === "solo" ? aiCount + 1 : 4
  const selectedLimits = FORMATIONS[myFormation]

  const handleCreateRoom = async () => {
    setBusy(true)
    setErrorMsg(null)
    try {
      const res = await fetch("/api/draft-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameSlug: "epl",
          formation: myFormation,
          isPrivate,
          maxParticipants: 4,
        }),
      })
      if (res.status === 401) {
        setErrorMsg("로그인이 필요합니다.")
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(data?.error ?? "방 만들기 실패")
        return
      }
      const { room } = await res.json()
      router.push(`/games/draft/epl/room/${room.id}`)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "네트워크 오류")
    } finally {
      setBusy(false)
    }
  }

  const handleJoinByCode = async () => {
    const code = inviteCode.trim().toUpperCase()
    if (code.length < 4) {
      setErrorMsg("코드를 입력해주세요.")
      return
    }
    setBusy(true)
    setErrorMsg(null)
    try {
      const res = await fetch("/api/draft-rooms/join-by-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
      if (res.status === 401) {
        setErrorMsg("로그인이 필요합니다.")
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(data?.error ?? "방 참가 실패")
        return
      }
      const { room } = await res.json()
      router.push(`/games/draft/epl/room/${room.id}`)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "네트워크 오류")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg py-8">
      <div className="border-border bg-card rounded-2xl border p-8 shadow-lg">
        <div className="mb-8 text-center">
          <div className="text-4xl">{entry?.emoji ?? "⚽"}</div>
          <h1 className="text-foreground mt-3 text-2xl font-black">
            {entry?.name ?? "스네이크 드래프트"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {entry?.blurb ?? "선수를 드래프트해서 나만의 드림팀을 만드세요"}
          </p>
        </div>

        {/* 게임 모드 */}
        <div className="mb-6">
          <label className="text-foreground mb-2 block text-sm font-semibold">게임 모드</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode("solo")}
              className={`rounded-lg border-2 px-4 py-3 text-sm font-semibold transition-all ${
                mode === "solo"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              <div className="text-lg">🤖</div>
              <div className="mt-1">솔로 (vs AI)</div>
            </button>
            <button
              onClick={() => setMode("multi")}
              className={`rounded-lg border-2 px-4 py-3 text-sm font-semibold transition-all ${
                mode === "multi"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              <div className="text-lg">👥</div>
              <div className="mt-1">멀티플레이어</div>
              <div className="text-muted-foreground text-[10px]">최대 4명 PvP</div>
            </button>
          </div>
        </div>

        {/* 닉네임 — 솔로만 (멀티는 profiles.nickname 사용) */}
        {mode === "solo" && (
          <div className="mb-6">
            <label className="text-foreground mb-2 block text-sm font-semibold">닉네임</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="닉네임 입력..."
              className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus:ring-primary h-10 w-full rounded-lg border px-3 text-sm focus:ring-2 focus:outline-none"
              maxLength={12}
            />
          </div>
        )}

        {/* 포메이션 선택 — 솔로/멀티 공통 */}
        <div className="mb-6">
          <label className="text-foreground mb-2 block text-sm font-semibold">포메이션</label>
          <div className="grid grid-cols-3 gap-2">
            {FORMATION_LIST.map((f) => {
              const limits = FORMATIONS[f]
              return (
                <button
                  key={f}
                  onClick={() => setMyFormation(f)}
                  className={`rounded-lg border-2 px-3 py-2.5 text-center transition-all ${
                    myFormation === f
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-muted-foreground"
                  }`}
                >
                  <div className="text-sm font-bold">{f}</div>
                  <div className="mt-0.5 text-[10px] opacity-70">
                    DF {limits.DF} · MF {limits.MF} · FW {limits.FW}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ─── 솔로 전용 ─── */}
        {mode === "solo" && (
          <>
            <div className="mb-6">
              <label className="text-foreground mb-2 block text-sm font-semibold">
                AI 상대 수: {aiCount}명 (총 {totalPlayers}명)
              </label>
              <div className="flex gap-2">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setAiCount(n)
                      if (mySeat >= n + 1) setMySeat(0)
                    }}
                    className={`flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-all ${
                      aiCount === n
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {n}명
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <label className="text-foreground mb-2 block text-sm font-semibold">
                내 드래프트 순서
              </label>
              <div className="flex gap-2">
                {Array.from({ length: totalPlayers }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setMySeat(i)}
                    className={`flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-all ${
                      mySeat === i
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {i + 1}번째
                  </button>
                ))}
              </div>
              <p className="text-muted-foreground mt-1.5 text-[11px]">
                1번째는 첫 픽이 빠르고, 마지막은 연속 2픽 유리!
              </p>
            </div>
          </>
        )}

        {/* ─── 멀티 전용 ─── */}
        {mode === "multi" && (
          <div className="mb-8 space-y-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="accent-primary h-4 w-4"
              />
              <span className="text-foreground font-semibold">친구만 (비공개 방)</span>
              <span className="text-muted-foreground text-[11px]">
                공개 목록에서 안 보이고 코드로만 참가 가능
              </span>
            </label>

            <p className="text-muted-foreground text-[11px]">
              · 픽 순서는 시작 시점에 자동 랜덤. 모든 참가자 동일 확률.
              <br />· 4명 안 모이면 호스트가 &ldquo;지금 시작&rdquo; 으로 AI 채워서 시작 가능.
            </p>

            {/* 지금 모집 중 미니 임베드 */}
            {openRooms !== null && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-foreground text-xs font-bold tracking-wider uppercase">
                    지금 모집 중
                    {openRooms.length > 0 && (
                      <span className="text-muted-foreground ml-1 font-mono">
                        ({openRooms.length})
                      </span>
                    )}
                  </span>
                  {openRooms.length > 0 && (
                    <button
                      type="button"
                      onClick={() => router.push("/games/draft/epl/rooms")}
                      className="text-primary text-[11px] font-semibold hover:underline"
                    >
                      전체 보기 →
                    </button>
                  )}
                </div>
                <OpenRoomsGrid initialRooms={openRooms} embedded embedLimit={4} />
              </div>
            )}
          </div>
        )}

        {/* 규칙 요약 */}
        <div className="bg-muted/50 mb-6 rounded-lg p-4">
          <h3 className="text-foreground mb-2 text-xs font-bold">규칙</h3>
          <ul className="text-muted-foreground space-y-1 text-[11px]">
            <li>• 스네이크 순서: 1→2→...→N→N→...→1 반복</li>
            <li>
              • {entry?.rosterSize ?? 11}라운드, 예산 {entry?.currency ?? "£"}
              {entry?.budget ?? 80}
            </li>
            <li>
              • 포메이션 {myFormation}: GK {selectedLimits.GK}, DF {selectedLimits.DF}, MF{" "}
              {selectedLimits.MF}, FW {selectedLimits.FW}
            </li>
            <li>• 픽 제한시간 30초 (초과 시 자동 선택)</li>
            <li>• 선수 풀 {getAllPlayers().length}명</li>
          </ul>
        </div>

        {errorMsg && (
          <div className="bg-destructive/10 text-destructive mb-4 rounded-lg px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        {/* CTA */}
        {mode === "solo" ? (
          <button
            onClick={onStart}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 w-full rounded-xl text-base font-bold shadow-lg transition-all hover:shadow-xl active:scale-[0.98]"
          >
            드래프트 시작!
          </button>
        ) : (
          <div className="space-y-3">
            <button
              onClick={handleCreateRoom}
              disabled={busy}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 w-full rounded-xl text-base font-bold shadow-lg transition-all hover:shadow-xl active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? "..." : "방 만들기"}
            </button>

            <div className="border-border flex gap-2 rounded-xl border p-2">
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="초대 코드 (예: ABCD12)"
                maxLength={8}
                className="bg-muted/40 text-foreground placeholder:text-muted-foreground h-10 flex-1 rounded-lg px-3 font-mono text-sm tracking-wider focus:outline-none"
              />
              <button
                onClick={handleJoinByCode}
                disabled={busy || inviteCode.length < 4}
                className="border-border text-foreground hover:bg-muted h-10 rounded-lg border px-4 text-sm font-semibold disabled:opacity-40"
              >
                참가
              </button>
            </div>

            <button
              onClick={() => router.push("/games/draft/epl/rooms")}
              className="border-border text-muted-foreground hover:bg-muted h-10 w-full rounded-xl border text-sm font-semibold"
            >
              공개 방 둘러보기 →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
