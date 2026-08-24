"use client"

import { useEffect, useState } from "react"
import { PageBand, PageBandStat } from "@/components/page-band"
import { useRouter } from "next/navigation"
import { getAllPlayers } from "@/lib/draft/players"
import { FORMATIONS, type Formation } from "@/lib/draft/engine"
import type { DraftCatalogEntry } from "@/lib/draft/games-catalog"
import type { OpenRoomSummary } from "@/lib/draft/rooms"
import { OpenRoomsGrid } from "./open-rooms-grid"
import { PitchViz } from "./pitch-viz"
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
    <div className="worldcup-scope">
      {/* ⚠️ 사이트 페이지는 전부 PageBand 로 정체성을 선언한다 (17개 지면 채택).
          드래프트만 흰 카드에 이모지 + 검정 제목이라 "사이트의 한 페이지" 로 안 읽혔다
          (2026-08-25 운영자: "디자인이 별로 달라진 게 없다"). 같은 밴드를 쓴다. */}
      <PageBand
        kicker="Draft"
        title={entry?.name ?? "스네이크 드래프트"}
        description={
          entry?.blurb ??
          "선수를 고르고, 나만의 드림팀을 만들어보세요. 솔로(vs AI)부터 최대 4명 PvP까지."
        }
        aside={<PageBandStat value={entry?.poolSize ?? 0} label="Players" />}
      />
      {/* ⚠️ 종전엔 max-w-lg(512px) 단칸이라 1440px 화면에서 좌우 900px 가 통째로 비었다.
          "대충 만든 사이트" 로 보이던 이유다 (2026-08-25 운영자). 데스크톱에서는
          설정(좌) + 도판·규칙(우) 2단으로 폭을 실제로 쓴다. 모바일은 그대로 한 칸.
          ⚠️ 멀티플레이어는 아직 준비가 안 돼 화면에서 내렸다 (코드·라우트는 유지 —
             방 만들기/참가 경로가 살아 있으므로 준비되면 이 블록만 되살리면 된다). */}
      <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
          <div
            className="rounded-2xl p-6 sm:p-8"
            style={{
              background: "var(--wc-card)",
              border: "1px solid var(--wc-line)",
              boxShadow: "var(--wc-shadow-1)",
            }}
          >
            {/* 닉네임 — 솔로만 (멀티는 profiles.nickname 사용) */}
            {mode === "solo" && (
              <div className="mb-6">
                <label
                  className="mb-2 block text-sm font-semibold"
                  style={{ color: "var(--wc-ink)" }}
                >
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
              <label
                className="mb-2 block text-sm font-semibold"
                style={{ color: "var(--wc-ink)" }}
              >
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
          </div>

          {/* ── 우측: 고른 포메이션 도판 + 규칙 + 시작 ──
            좌측 설정을 만질 때마다 여기가 즉시 반응한다. 종전엔 도판이 포메이션 버튼
            바로 아래 300px 로 눌려 있었고 규칙은 맨 아래 각주처럼 깔려 있었다. */}
          <aside className="lg:sticky lg:top-4">
            <div
              className="rounded-2xl p-5"
              style={{
                background: "var(--wc-card)",
                border: "1px solid var(--wc-line)",
                boxShadow: "var(--wc-shadow-1)",
              }}
            >
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-sm font-semibold" style={{ color: "var(--wc-ink)" }}>
                  {myFormation}
                </span>
                <span className="text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
                  이 배치로 11명을 채웁니다
                </span>
              </div>
              <PitchViz formation={myFormation} filled={{}} />
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
              {/* ⚠️ 모바일에서는 도판+규칙이 위에 쌓여 시작 버튼이 스크롤 1,600px 아래로
                묻혔다 (2026-08-25 실측, 뷰포트 844px = 두 화면 아래). 화면 하단에
                붙여 둔다. 데스크톱은 우측 카드 안 제자리. */}
              <div className="sticky bottom-3 z-10 mt-5 lg:static lg:bottom-auto">
                <button
                  onClick={onStart}
                  className="h-12 w-full rounded-xl text-base font-bold shadow-lg transition-all hover:opacity-90 hover:shadow-xl active:scale-[0.98]"
                  style={{ background: "var(--wc-burgundy)", color: "#fff" }}
                >
                  드래프트 시작!
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
