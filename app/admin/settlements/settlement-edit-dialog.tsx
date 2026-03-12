import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { type UnsettledGame, sportLabels, getResultOptions, deriveResult } from "./settlement-types"

interface SettlementEditDialogProps {
  game: UnsettledGame | null
  onClose: () => void
  onSaved: () => Promise<void>
}

export function SettlementEditDialog({ game, onClose, onSaved }: SettlementEditDialogProps) {
  const [homeScore, setHomeScore] = useState("")
  const [awayScore, setAwayScore] = useState("")
  const [result, setResult] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const open = (g: UnsettledGame) => {
    setHomeScore(g.home_score !== null ? String(g.home_score) : "")
    setAwayScore(g.away_score !== null ? String(g.away_score) : "")
    setResult(g.result || "")
  }

  // Sync state when game changes
  if (game && homeScore === "" && awayScore === "" && !result && game.home_score !== null) {
    open(game)
  }

  const handleClose = () => {
    setHomeScore("")
    setAwayScore("")
    setResult("")
    onClose()
  }

  const handleScoreChange = (side: "home" | "away", value: string) => {
    const numVal = value === "" ? "" : value.replace(/\D/g, "")
    if (side === "home") setHomeScore(numVal)
    else setAwayScore(numVal)

    if (game && numVal !== "" && (side === "home" ? awayScore : homeScore) !== "") {
      const h = side === "home" ? parseInt(numVal, 10) : parseInt(homeScore, 10)
      const a = side === "away" ? parseInt(numVal, 10) : parseInt(awayScore, 10)
      if (!isNaN(h) && !isNaN(a)) {
        const auto = deriveResult(game.game_type, h, a, game.handicap, game.over_under_line)
        if (auto) setResult(auto)
      }
    }
  }

  const handleSave = async () => {
    if (!game) return
    if (homeScore === "" || awayScore === "" || !result) {
      toast({
        variant: "destructive",
        title: "입력 오류",
        description: "스코어와 결과를 모두 입력해주세요.",
      })
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch("/api/admin/matches/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: [
            {
              game_id: game.id,
              home_score: parseInt(homeScore, 10),
              away_score: parseInt(awayScore, 10),
              result,
            },
          ],
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "결과 저장에 실패했습니다.")

      toast({ title: "결과 입력 완료", description: data.message })
      handleClose()
      await onSaved()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "오류",
        description: err instanceof Error ? err.message : "결과 저장 중 오류가 발생했습니다.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={!!game} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>경기 결과 입력</DialogTitle>
        </DialogHeader>
        {game && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-muted-foreground mb-1 flex items-center justify-center gap-2 text-sm">
                <Badge variant="outline">{sportLabels[game.sport] || game.sport}</Badge>
                <span>{game.game_type}</span>
                <span>#{game.game_no}</span>
              </div>
              <div className="text-lg font-semibold">
                {game.home_team} vs {game.away_team}
              </div>
              {(game.handicap !== null || game.over_under_line !== null) && (
                <div className="mt-1 flex items-center justify-center gap-2">
                  {game.handicap !== null && (
                    <Badge className="border-blue-200 bg-blue-500/10 text-blue-700">
                      핸디캡: {game.handicap > 0 ? "+" : ""}
                      {game.handicap}
                    </Badge>
                  )}
                  {game.over_under_line !== null && (
                    <Badge className="border-purple-200 bg-purple-500/10 text-purple-700">
                      기준점: {game.over_under_line}
                    </Badge>
                  )}
                </div>
              )}
              <p className="text-muted-foreground mt-1 text-xs">
                {game.match_time
                  ? format(new Date(game.match_time), "yyyy년 MM월 dd일 HH:mm", { locale: ko })
                  : ""}
              </p>
              {(game.game_type === "핸디캡" || game.game_type === "S핸디캡") &&
                game.handicap !== null && (
                  <p className="mt-1 text-xs text-blue-600">
                    홈 스코어에 핸디캡({game.handicap > 0 ? "+" : ""}
                    {game.handicap})을 적용하여 결과 판정
                  </p>
                )}
              {(game.game_type === "언더오버" || game.game_type === "S언더오버") &&
                game.over_under_line !== null && (
                  <p className="mt-1 text-xs text-purple-600">
                    총 득점이 기준점({game.over_under_line})보다 높으면 오버, 낮으면 언더
                  </p>
                )}
              {game.game_type === "SUM" && (
                <p className="mt-1 text-xs text-orange-600">총 득점이 홀수면 홀, 짝수면 짝</p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">스코어</label>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-muted-foreground text-xs">{game.home_team}</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={homeScore}
                    onChange={(e) => handleScoreChange("home", e.target.value)}
                    className="text-center text-lg font-bold tabular-nums"
                  />
                </div>
                <span className="text-muted-foreground mt-4 text-xl font-bold">:</span>
                <div className="flex-1">
                  <label className="text-muted-foreground text-xs">{game.away_team}</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={awayScore}
                    onChange={(e) => handleScoreChange("away", e.target.value)}
                    className="text-center text-lg font-bold tabular-nums"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">결과</label>
              <div className="grid grid-cols-3 gap-2">
                {getResultOptions(game.game_type).map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={result === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setResult(opt.value)}
                    className="w-full"
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            {result && homeScore !== "" && awayScore !== "" && (
              <div className="space-y-1 rounded-lg bg-green-500/10 p-3 text-center text-sm">
                <div>
                  <span className="font-semibold">
                    {homeScore} : {awayScore}
                  </span>
                  {(game.game_type === "핸디캡" || game.game_type === "S핸디캡") &&
                    game.handicap !== null && (
                      <span className="text-muted-foreground">
                        {" "}
                        (핸디캡 적용: {(parseInt(homeScore, 10) + game.handicap).toFixed(1)} vs{" "}
                        {awayScore})
                      </span>
                    )}
                  {(game.game_type === "언더오버" ||
                    game.game_type === "S언더오버" ||
                    game.game_type === "SUM") && (
                    <span className="text-muted-foreground">
                      {" "}
                      (합계: {parseInt(homeScore, 10) + parseInt(awayScore, 10)})
                    </span>
                  )}
                </div>
                <div>
                  {"→ "}
                  <Badge variant="secondary">{result}</Badge>
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            취소
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !result || homeScore === "" || awayScore === ""}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 저장 중...
              </>
            ) : (
              "결과 저장"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
