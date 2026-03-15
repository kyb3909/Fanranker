"use client"

import { getAllPlayers } from "@/lib/draft/players"
import { FORMATIONS, type Formation } from "@/lib/draft/engine"
import type { GameMode } from "./use-draft-game"

const FORMATION_LIST: Formation[] = ["4-4-2", "4-3-3", "3-5-2", "3-4-3", "5-3-2", "5-4-1"]

interface DraftSetupProps {
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
  const totalPlayers = mode === "solo" ? aiCount + 1 : 4
  const selectedLimits = FORMATIONS[myFormation]

  return (
    <div className="mx-auto max-w-lg py-8">
      <div className="border-border bg-card rounded-2xl border p-8 shadow-lg">
        <div className="mb-8 text-center">
          <div className="text-4xl">⚽</div>
          <h1 className="text-foreground mt-3 text-2xl font-black">스네이크 드래프트</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            EPL 선수를 드래프트해서 나만의 드림팀을 만드세요
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
              <div className="text-muted-foreground text-[10px]">(준비 중)</div>
            </button>
          </div>
        </div>

        {/* 닉네임 */}
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

        {/* 포메이션 선택 */}
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

        {/* AI 수 (솔로만) */}
        {mode === "solo" && (
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
        )}

        {/* 드래프트 순서 */}
        {mode === "solo" && (
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
        )}

        {/* 규칙 요약 */}
        <div className="bg-muted/50 mb-6 rounded-lg p-4">
          <h3 className="text-foreground mb-2 text-xs font-bold">규칙</h3>
          <ul className="text-muted-foreground space-y-1 text-[11px]">
            <li>• 스네이크 순서: 1→2→...→N→N→...→1 반복</li>
            <li>• 11라운드, 예산 £80.0</li>
            <li>
              • 포메이션 {myFormation}: GK {selectedLimits.GK}, DF {selectedLimits.DF}, MF{" "}
              {selectedLimits.MF}, FW {selectedLimits.FW}
            </li>
            <li>• 픽 제한시간 30초 (초과 시 자동 선택)</li>
            <li>• 총 {getAllPlayers().length}명의 EPL 선수</li>
          </ul>
        </div>

        <button
          onClick={onStart}
          className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 w-full rounded-xl text-base font-bold shadow-lg transition-all hover:shadow-xl active:scale-[0.98]"
        >
          드래프트 시작!
        </button>
      </div>
    </div>
  )
}
