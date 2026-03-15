"use client"

import { ArrowLeft, RotateCcw, Trophy } from "lucide-react"
import { useWorldcup } from "@/hooks/use-worldcup"
import type { BattleRoom } from "./battle-types"
import { getRoundLabel, BATTLE_STATUS_LABELS } from "./battle-types"
import { WorldcupStatsPreview, WinnerStatsSection } from "./worldcup-stats"

interface WorldcupViewProps {
  room: BattleRoom
  onBack: () => void
}

export function WorldcupView({ room, onBack }: WorldcupViewProps) {
  const wc = useWorldcup(room.id)
  const isActive = room.status === "active"

  // 아직 세션 시작 안 했을 때
  if (!wc.session && !wc.winner) {
    return (
      <div className="space-y-3">
        <BackHeader title={room.title} status={room.status} onBack={onBack} />

        <div className="bg-card border-border overflow-hidden rounded-xl border p-8 text-center shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
          <Trophy className="text-primary mx-auto h-10 w-10" />
          <h2 className="text-foreground mt-4 text-xl font-black tracking-wide uppercase">
            {room.title}
          </h2>
          {room.description && (
            <p className="text-muted-foreground mt-2 text-sm">{room.description}</p>
          )}
          <div className="text-muted-foreground mt-4 flex items-center justify-center gap-4 text-sm">
            <span>{room.bracket_size}강 토너먼트</span>
            <span>•</span>
            <span>{room.total_participants}명 참여</span>
          </div>

          {isActive && (
            <button
              onClick={() => wc.startWorldcup(room.bracket_size ?? undefined)}
              disabled={wc.isLoading}
              className="bg-primary mt-6 inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
            >
              <Trophy className="h-4 w-4" />
              시작하기
            </button>
          )}

          {!isActive && (
            <p className="text-muted-foreground mt-6 text-sm">
              {BATTLE_STATUS_LABELS[room.status]}
            </p>
          )}
        </div>

        <WorldcupStatsPreview />
      </div>
    )
  }

  // 우승자 결정!
  if (wc.winner) {
    return (
      <div className="space-y-3">
        <BackHeader title={room.title} status={room.status} onBack={onBack} />

        <div className="bg-card border-border overflow-hidden rounded-xl border p-8 text-center shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
          <div className="text-5xl">👑</div>
          <p className="text-primary mt-3 text-sm font-semibold tracking-wider uppercase">
            나의 우승자
          </p>

          {wc.winner.image_url ? (
            <img
              src={wc.winner.image_url}
              alt={wc.winner.name}
              className="border-primary/50 mx-auto mt-4 h-36 w-36 rounded-full border-4 object-cover shadow-xl"
            />
          ) : (
            <div className="bg-primary/10 mx-auto mt-4 flex h-36 w-36 items-center justify-center rounded-full text-6xl">
              🏆
            </div>
          )}

          <h2 className="text-foreground mt-4 text-2xl font-black">{wc.winner.name}</h2>

          <button
            onClick={() => wc.startWorldcup(room.bracket_size ?? undefined)}
            className="bg-muted text-foreground hover:bg-muted/80 mt-6 inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all"
          >
            <RotateCcw className="h-4 w-4" />
            다시 하기
          </button>
        </div>

        <WinnerStatsSection battleId={room.id} stats={wc.stats} />
      </div>
    )
  }

  // 게임 진행 중
  const [candidateA, candidateB] = wc.currentPair ?? [null, null]
  const roundLabel = wc.session
    ? getRoundLabel(wc.session.bracket_size, wc.session.current_round)
    : ""
  const matchProgress = wc.session
    ? `${wc.currentMatchIndex + 1}/${wc.roundCandidates.length / 2}`
    : ""

  return (
    <div className="space-y-3">
      <BackHeader title={room.title} status={room.status} onBack={onBack} />

      <div className="text-center">
        <span className="text-primary bg-primary/10 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold">
          {roundLabel} {matchProgress}
        </span>
      </div>

      <div className="bg-card border-border relative overflow-hidden rounded-xl border shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
        <div className="relative flex min-h-[340px]">
          <CandidateButton
            candidate={candidateA}
            side="left"
            isVoting={wc.isVoting}
            onVote={() => candidateA && wc.vote(candidateA.id)}
          />

          <div className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            <div className="bg-card border-border flex h-14 w-14 items-center justify-center rounded-full border-2 text-lg font-black tracking-wider shadow-xl">
              VS
            </div>
          </div>
          <div className="bg-border absolute top-0 left-1/2 h-full w-px" />

          <CandidateButton
            candidate={candidateB}
            side="right"
            isVoting={wc.isVoting}
            onVote={() => candidateB && wc.vote(candidateB.id)}
          />
        </div>
      </div>
    </div>
  )
}

function BackHeader({
  title,
  status,
  onBack,
}: {
  title: string
  status: string
  onBack: () => void
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onBack}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        목록
      </button>
      <h2 className="text-foreground truncate text-lg font-bold">{title}</h2>
      <span className="text-muted-foreground ml-auto text-xs">
        {BATTLE_STATUS_LABELS[status as keyof typeof BATTLE_STATUS_LABELS] ?? status}
      </span>
    </div>
  )
}

function CandidateButton({
  candidate,
  side,
  isVoting,
  onVote,
}: {
  candidate: {
    id: string
    name: string
    image_url: string | null
    description: string | null
  } | null
  side: "left" | "right"
  isVoting: boolean
  onVote: () => void
}) {
  const borderColor = side === "left" ? "border-primary/30" : "border-red-500/30"
  const bgColor = side === "left" ? "bg-primary/10" : "bg-red-500/10"
  const btnColor = side === "left" ? "bg-primary" : "bg-red-500"

  return (
    <button
      onClick={onVote}
      disabled={isVoting || !candidate}
      className="hover:bg-muted/40 group relative flex flex-1 flex-col items-center justify-center p-6 transition-all active:scale-[0.98]"
    >
      {candidate?.image_url ? (
        <img
          src={candidate.image_url}
          alt={candidate.name}
          className={`${borderColor} mb-4 h-32 w-32 rounded-full border-4 object-cover shadow-lg transition-transform group-hover:scale-105`}
        />
      ) : (
        <div
          className={`${bgColor} mb-4 flex h-32 w-32 items-center justify-center rounded-full text-5xl shadow-lg transition-transform group-hover:scale-105`}
        >
          ⚡
        </div>
      )}
      <h3 className="text-foreground text-center text-lg font-bold">{candidate?.name}</h3>
      {candidate?.description && (
        <p className="text-muted-foreground mt-1 text-center text-xs">{candidate.description}</p>
      )}
      <span
        className={`${btnColor} mt-4 rounded-full px-5 py-2 text-sm font-bold text-white shadow-lg transition-all group-hover:scale-105 group-hover:opacity-90`}
      >
        선택
      </span>
    </button>
  )
}
