"use client"

import { ArrowLeft, RotateCcw, Trophy, BarChart3 } from "lucide-react"
import { useWorldcup } from "@/hooks/use-worldcup"
import type { BattleRoom } from "./battle-types"
import { getRoundLabel, BATTLE_STATUS_LABELS } from "./battle-types"

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

        {/* 소개 카드 */}
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

        {/* 통계 미리보기 */}
        <WorldcupStatsSection battleId={room.id} />
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

        {/* 전체 통계 */}
        {wc.stats.length > 0 && (
          <div className="border-border bg-card overflow-hidden rounded-xl border">
            <div className="flex items-center gap-2 px-4 py-3">
              <BarChart3 className="text-muted-foreground h-4 w-4" />
              <h3 className="text-foreground text-sm font-bold">전체 통계</h3>
            </div>
            <div className="divide-border divide-y">
              {wc.stats.slice(0, 10).map((s, i) => {
                const maxWins = wc.stats[0]?.win_count ?? 1
                const barWidth = maxWins > 0 ? (s.win_count / maxWins) * 100 : 0
                return (
                  <div key={s.candidate_id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-muted-foreground w-5 text-right text-sm font-bold">
                      {i + 1}
                    </span>
                    {s.image_url ? (
                      <img
                        src={s.image_url}
                        alt={s.name}
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm">
                        {i + 1}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate text-sm font-semibold">{s.name}</p>
                      <div className="bg-muted mt-1 h-1.5 w-full overflow-hidden rounded-full">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-500"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs font-semibold">
                      {s.win_count}회 우승
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
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

      {/* 라운드 정보 */}
      <div className="text-center">
        <span className="text-primary bg-primary/10 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold">
          {roundLabel} {matchProgress}
        </span>
      </div>

      {/* ====== 대결 카드 ====== */}
      <div className="bg-card border-border relative overflow-hidden rounded-xl border shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
        <div className="relative flex min-h-[340px]">
          {/* 왼쪽 후보 */}
          <button
            onClick={() => candidateA && wc.vote(candidateA.id)}
            disabled={wc.isVoting || !candidateA}
            className="hover:bg-muted/40 group relative flex flex-1 flex-col items-center justify-center p-6 transition-all active:scale-[0.98]"
          >
            {candidateA?.image_url ? (
              <img
                src={candidateA.image_url}
                alt={candidateA.name}
                className="border-primary/30 mb-4 h-32 w-32 rounded-full border-4 object-cover shadow-lg transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="bg-primary/10 mb-4 flex h-32 w-32 items-center justify-center rounded-full text-5xl shadow-lg transition-transform group-hover:scale-105">
                ⚡
              </div>
            )}
            <h3 className="text-foreground text-center text-lg font-bold">{candidateA?.name}</h3>
            {candidateA?.description && (
              <p className="text-muted-foreground mt-1 text-center text-xs">
                {candidateA.description}
              </p>
            )}
            <span className="bg-primary mt-4 rounded-full px-5 py-2 text-sm font-bold text-white shadow-lg transition-all group-hover:scale-105 group-hover:opacity-90">
              선택
            </span>
          </button>

          {/* 중앙 VS */}
          <div className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            <div className="bg-card border-border flex h-14 w-14 items-center justify-center rounded-full border-2 text-lg font-black tracking-wider shadow-xl">
              VS
            </div>
          </div>
          <div className="bg-border absolute top-0 left-1/2 h-full w-px" />

          {/* 오른쪽 후보 */}
          <button
            onClick={() => candidateB && wc.vote(candidateB.id)}
            disabled={wc.isVoting || !candidateB}
            className="hover:bg-muted/40 group relative flex flex-1 flex-col items-center justify-center p-6 transition-all active:scale-[0.98]"
          >
            {candidateB?.image_url ? (
              <img
                src={candidateB.image_url}
                alt={candidateB.name}
                className="mb-4 h-32 w-32 rounded-full border-4 border-red-500/30 object-cover shadow-lg transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="mb-4 flex h-32 w-32 items-center justify-center rounded-full bg-red-500/10 text-5xl shadow-lg transition-transform group-hover:scale-105">
                ⚡
              </div>
            )}
            <h3 className="text-foreground text-center text-lg font-bold">{candidateB?.name}</h3>
            {candidateB?.description && (
              <p className="text-muted-foreground mt-1 text-center text-xs">
                {candidateB.description}
              </p>
            )}
            <span className="mt-4 rounded-full bg-red-500 px-5 py-2 text-sm font-bold text-white shadow-lg transition-all group-hover:scale-105 group-hover:opacity-90">
              선택
            </span>
          </button>
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

function WorldcupStatsSection({ battleId }: { battleId: string }) {
  return (
    <div className="border-border bg-card rounded-xl border p-6 text-center">
      <BarChart3 className="text-muted-foreground mx-auto h-8 w-8" />
      <p className="text-muted-foreground mt-2 text-sm">참여 후 전체 통계를 확인할 수 있습니다</p>
    </div>
  )
}
