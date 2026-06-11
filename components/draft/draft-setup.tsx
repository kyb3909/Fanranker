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

  const segOn = {
    border: "2px solid var(--wc-burgundy)",
    background: "var(--wc-soft)",
    color: "var(--wc-burgundy)",
  } as const
  const segOff = {
    border: "2px solid var(--wc-line)",
    background: "var(--wc-card)",
    color: "var(--wc-mute)",
  } as const

  return (
    <div className="worldcup-scope mx-auto max-w-lg py-8">
      <div
        className="rounded-2xl p-8"
        style={{
          background: "var(--wc-card)",
          border: "1px solid var(--wc-line)",
          boxShadow: "var(--wc-shadow-1)",
        }}
      >
        <div className="mb-8 text-center">
          <div className="text-4xl">{entry?.emoji ?? "⚽"}</div>
          <h1 className="mt-3 text-2xl font-black" style={{ color: "var(--wc-ink)" }}>
            {entry?.name ?? "스네이크 드래프트"}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--wc-mute)" }}>
            {entry?.blurb ?? "선수를 드래프트해서 나만의 드림팀을 만드세요"}
          </p>
        </div>

        {/* 게임 모드 */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-semibold" style={{ color: "var(--wc-ink)" }}>
            게임 모드
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode("solo")}
              className="rounded-lg px-4 py-3 text-sm font-semibold transition-all"
              style={mode === "solo" ? segOn : segOff}
            >
              <div className="text-lg">🤖</div>
              <div className="mt-1">솔로 (vs AI)</div>
            </button>
            <button
              onClick={() => setMode("multi")}
              className="rounded-lg px-4 py-3 text-sm font-semibold transition-all"
              style={mode === "multi" ? segOn : segOff}
            >
              <div className="text-lg">👥</div>
              <div className="mt-1">멀티플레이어</div>
              <div className="text-[10px]" style={{ color: "var(--wc-mute)" }}>
                최대 4명 PvP
              </div>
            </button>
          </div>
        </div>

        {/* 닉네임 — 솔로만 (멀티는 profiles.nickname 사용) */}
        {mode === "solo" && (
          <div className="mb-6">
            <label className="mb-2 block text-sm font-semibold" style={{ color: "var(--wc-ink)" }}>
              닉네임
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="닉네임 입력..."
              className="h-10 w-full rounded-lg px-3 text-sm focus:outline-none"
              style={{
                border: "1px solid var(--wc-line-2)",
                background: "var(--wc-paper)",
                color: "var(--wc-ink)",
              }}
              maxLength={12}
            />
          </div>
        )}

        {/* 포메이션 선택 — 솔로/멀티 공통 */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-semibold" style={{ color: "var(--wc-ink)" }}>
            포메이션
          </label>
          <div className="grid grid-cols-3 gap-2">
            {FORMATION_LIST.map((f) => {
              const limits = FORMATIONS[f]
              return (
                <button
                  key={f}
                  onClick={() => setMyFormation(f)}
                  className="rounded-lg px-3 py-2.5 text-center transition-all"
                  style={myFormation === f ? segOn : segOff}
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
              <label
                className="mb-2 block text-sm font-semibold"
                style={{ color: "var(--wc-ink)" }}
              >
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
                    className="flex-1 rounded-lg py-2 text-sm font-semibold transition-all"
                    style={aiCount === n ? segOn : segOff}
                  >
                    {n}명
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <label
                className="mb-2 block text-sm font-semibold"
                style={{ color: "var(--wc-ink)" }}
              >
                내 드래프트 순서
              </label>
              <div className="flex gap-2">
                {Array.from({ length: totalPlayers }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setMySeat(i)}
                    className="flex-1 rounded-lg py-2 text-sm font-semibold transition-all"
                    style={mySeat === i ? segOn : segOff}
                  >
                    {i + 1}번째
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px]" style={{ color: "var(--wc-mute)" }}>
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
                className="h-4 w-4"
                style={{ accentColor: "var(--wc-burgundy)" }}
              />
              <span className="font-semibold" style={{ color: "var(--wc-ink)" }}>
                친구만 (비공개 방)
              </span>
              <span className="text-[11px]" style={{ color: "var(--wc-mute)" }}>
                공개 목록에서 안 보이고 코드로만 참가 가능
              </span>
            </label>

            <p className="text-[11px]" style={{ color: "var(--wc-mute)" }}>
              · 픽 순서는 시작 시점에 자동 랜덤. 모든 참가자 동일 확률.
              <br />· 4명 안 모이면 호스트가 &ldquo;지금 시작&rdquo; 으로 AI 채워서 시작 가능.
            </p>

            {/* 지금 모집 중 미니 임베드 */}
            {openRooms !== null && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className="text-xs font-bold tracking-wider uppercase"
                    style={{ color: "var(--wc-ink)" }}
                  >
                    지금 모집 중
                    {openRooms.length > 0 && (
                      <span className="ml-1 font-mono" style={{ color: "var(--wc-mute)" }}>
                        ({openRooms.length})
                      </span>
                    )}
                  </span>
                  {openRooms.length > 0 && (
                    <button
                      type="button"
                      onClick={() => router.push("/games/draft/epl/rooms")}
                      className="text-[11px] font-semibold hover:underline"
                      style={{ color: "var(--wc-burgundy)" }}
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
        <div className="mb-6 rounded-lg p-4" style={{ background: "var(--wc-paper)" }}>
          <h3 className="mb-2 text-xs font-bold" style={{ color: "var(--wc-ink)" }}>
            규칙
          </h3>
          <ul className="space-y-1 text-[11px]" style={{ color: "var(--wc-mute)" }}>
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
          <div
            className="mb-4 rounded-lg px-4 py-3 text-sm"
            style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)" }}
          >
            {errorMsg}
          </div>
        )}

        {/* CTA */}
        {mode === "solo" ? (
          <button
            onClick={onStart}
            className="h-12 w-full rounded-xl text-base font-bold shadow-lg transition-all hover:opacity-90 hover:shadow-xl active:scale-[0.98]"
            style={{ background: "var(--wc-burgundy)", color: "#fff" }}
          >
            드래프트 시작!
          </button>
        ) : (
          <div className="space-y-3">
            <button
              onClick={handleCreateRoom}
              disabled={busy}
              className="h-12 w-full rounded-xl text-base font-bold shadow-lg transition-all hover:opacity-90 hover:shadow-xl active:scale-[0.98] disabled:opacity-50"
              style={{ background: "var(--wc-burgundy)", color: "#fff" }}
            >
              {busy ? "..." : "방 만들기"}
            </button>

            <div
              className="flex gap-2 rounded-xl p-2"
              style={{ border: "1px solid var(--wc-line)" }}
            >
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="초대 코드 (예: ABCD12)"
                maxLength={8}
                className="h-10 flex-1 rounded-lg px-3 font-mono text-sm tracking-wider focus:outline-none"
                style={{ background: "var(--wc-paper)", color: "var(--wc-ink)" }}
              />
              <button
                onClick={handleJoinByCode}
                disabled={busy || inviteCode.length < 4}
                className="h-10 rounded-lg px-4 text-sm font-semibold disabled:opacity-40"
                style={{
                  border: "1px solid var(--wc-line)",
                  color: "var(--wc-ink)",
                  background: "var(--wc-card)",
                }}
              >
                참가
              </button>
            </div>

            <button
              onClick={() => router.push("/games/draft/epl/rooms")}
              className="h-10 w-full rounded-xl text-sm font-semibold"
              style={{
                border: "1px solid var(--wc-line)",
                color: "var(--wc-mute)",
                background: "var(--wc-card)",
              }}
            >
              공개 방 둘러보기 →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
