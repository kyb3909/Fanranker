"use client"

import { useState } from "react"
import { Trophy, RotateCcw, BarChart3 } from "lucide-react"
import { PlayerCard } from "./player-card"
import type { Team } from "@/lib/draft/types"
import Link from "next/link"

interface DraftResultsProps {
  teams: Team[]
  mode: string
  onRestart: () => void
}

export function DraftResults({ teams, mode, onRestart }: DraftResultsProps) {
  const [votes, setVotes] = useState<Record<string, number>>({})
  const [votedTeam, setVotedTeam] = useState<string | null>(null)

  const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0)

  const handleVote = (teamId: string) => {
    if (votedTeam) return
    setVotedTeam(teamId)
    setVotes((prev) => ({ ...prev, [teamId]: (prev[teamId] || 0) + 1 }))
  }

  // Sort teams by votes, then by avg rating
  const sortedTeams = [...teams].sort((a, b) => {
    const voteA = votes[a.id] || 0
    const voteB = votes[b.id] || 0
    if (voteB !== voteA) return voteB - voteA
    const avgA = a.players.reduce((s, p) => s + p.rating, 0) / (a.players.length || 1)
    const avgB = b.players.reduce((s, p) => s + p.rating, 0) / (b.players.length || 1)
    return avgB - avgA
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center">
        <Trophy className="h-10 w-10 text-amber-500 mx-auto mb-2" />
        <h2 className="text-xl font-bold text-foreground">드래프트 완료!</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {votedTeam ? "투표가 완료되었습니다" : "가장 잘 짠 팀에 투표하세요"}
        </p>
      </div>

      {/* Teams */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sortedTeams.map((team, idx) => {
          const teamVotes = votes[team.id] || 0
          const votePercent = totalVotes > 0 ? Math.round((teamVotes / totalVotes) * 100) : 0
          const isWinner = idx === 0 && teamVotes > 0
          const isVoted = votedTeam === team.id

          return (
            <button
              key={team.id}
              onClick={() => handleVote(team.id)}
              disabled={!!votedTeam}
              className={`text-left rounded-xl border-2 p-4 transition-all ${
                isVoted
                  ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                  : isWinner
                    ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20"
                    : "border-border bg-card hover:border-primary/50"
              } ${votedTeam ? "" : "cursor-pointer hover:shadow-md"}`}
            >
              {/* Team header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`h-4 w-4 rounded-full bg-gradient-to-br ${team.color}`} />
                  <span className="text-sm font-bold text-foreground">{team.name}</span>
                  {isWinner && <Trophy className="h-4 w-4 text-amber-500" />}
                </div>
                <span className="text-xs font-mono text-muted-foreground">#{idx + 1}</span>
              </div>

              {/* Vote bar */}
              {totalVotes > 0 && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{teamVotes}표</span>
                    <span className="font-bold text-foreground">{votePercent}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500"
                      style={{ width: `${votePercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Players */}
              <div className="grid grid-cols-3 gap-1.5">
                {team.players.map((player) => (
                  <PlayerCard key={player.id} player={player} />
                ))}
              </div>
            </button>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-3">
        <button
          onClick={onRestart}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          새 드래프트
        </button>
        <Link
          href={`/games/draft-game/stats/${mode}`}
          className="flex items-center gap-2 px-5 py-2.5 bg-muted border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors"
        >
          <BarChart3 className="h-4 w-4" />
          통계 보기
        </Link>
      </div>
    </div>
  )
}
