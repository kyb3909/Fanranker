"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Loader2, Trophy } from "lucide-react"
import Link from "@/components/ui/app-link"

interface Entry {
  rank: number
  user_id: string
  nickname: string | null
  avatar_url: string | null
  display_title: string | null
  points_contributed: number
  last_at: string | null
}

interface Response {
  team_id: string
  leaderboard: Entry[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  teamId: string
  teamName: string
  teamColor: string
}

export function ContributorsLeaderboard({
  open,
  onOpenChange,
  teamId,
  teamName,
  teamColor,
}: Props) {
  const { data, isLoading } = useSWR<Response>(
    open ? `/api/stadiums/${teamId}/leaderboard?limit=50` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4" style={{ color: teamColor }} />
            {teamName} 기여자 랭킹
          </DialogTitle>
          <DialogDescription>
            누적 기여 점수 기준 (예측 적중 수익 + flair 활동 점수 기부 합산)
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        ) : !data?.leaderboard?.length ? (
          <div className="text-muted-foreground py-12 text-center text-sm">
            아직 기여자가 없어요. 첫 번째가 되어보세요.
          </div>
        ) : (
          <ol className="space-y-1">
            {data.leaderboard.map((e) => {
              const initial = (e.nickname?.[0] || e.user_id?.[0] || "?").toUpperCase()
              return (
                <li
                  key={e.user_id}
                  className="hover:bg-muted/50 flex items-center gap-3 rounded-md px-2 py-2 transition-colors"
                >
                  <span
                    className={
                      e.rank === 1
                        ? "w-7 text-center text-base font-bold text-amber-500"
                        : e.rank === 2
                          ? "w-7 text-center text-base font-bold text-zinc-400"
                          : e.rank === 3
                            ? "w-7 text-center text-base font-bold text-orange-700"
                            : "text-muted-foreground w-7 text-center text-xs tabular-nums"
                    }
                  >
                    {e.rank <= 3 ? (e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : "🥉") : e.rank}
                  </span>
                  <Link
                    href={`/profile/${e.user_id}`}
                    className="flex min-w-0 flex-1 items-center gap-2"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={e.avatar_url ?? undefined} alt={e.nickname ?? ""} />
                      <AvatarFallback className="text-[11px]">{initial}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {e.nickname || e.user_id.slice(0, 12)}
                      </div>
                      {e.display_title && (
                        <div className="text-muted-foreground truncate text-[10px]">
                          {e.display_title}
                        </div>
                      )}
                    </div>
                  </Link>
                  <div className="text-foreground shrink-0 text-xs font-semibold tabular-nums">
                    {e.points_contributed.toLocaleString()}p
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  )
}
