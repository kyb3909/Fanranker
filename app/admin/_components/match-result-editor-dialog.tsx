"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"

export interface EditableMatchResultGame {
  id: string
  game_no: number
  sport: string
  game_type: string
  home_team: string
  away_team: string
  match_time: string | null
  result: string | null
  home_score: number | null
  away_score: number | null
  handicap: number | null
  over_under_line: number | null
  status?: string | null
}

const SPORT_LABELS: Record<string, string> = {
  soccer: "축구",
  baseball: "야구",
  basketball: "농구",
  volleyball: "배구",
  축구: "축구",
  야구: "야구",
  농구: "농구",
  배구: "배구",
}

const RESULT_OPTIONS: Record<string, { label: string; value: string }[]> = {
  일반: [
    { label: "홈 승", value: "home" },
    { label: "무승부", value: "draw" },
    { label: "원정 승", value: "away" },
  ],
  핸디캡: [
    { label: "홈 승", value: "home" },
    { label: "무승부", value: "draw" },
    { label: "원정 승", value: "away" },
  ],
  S핸디캡: [
    { label: "홈 승", value: "home" },
    { label: "무승부", value: "draw" },
    { label: "원정 승", value: "away" },
  ],
  언더오버: [
    { label: "오버", value: "over" },
    { label: "언더", value: "under" },
  ],
  S언더오버: [
    { label: "오버", value: "over" },
    { label: "언더", value: "under" },
  ],
  SUM: [
    { label: "홀", value: "odd" },
    { label: "짝", value: "even" },
  ],
}

function getResultOptions(gameType: string) {
  return RESULT_OPTIONS[gameType] || RESULT_OPTIONS["일반"]
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "scheduled", label: "진행전" },
  { value: "in_progress", label: "진행중" },
  { value: "finished", label: "경기후" },
  { value: "completed", label: "결과입력됨" },
  { value: "cancelled", label: "취소" },
]

function deriveResult(
  gameType: string,
  homeScore: number,
  awayScore: number,
  handicap: number | null,
  overUnderLine: number | null
) {
  if (gameType === "핸디캡" || gameType === "S핸디캡") {
    const adjusted = homeScore + (handicap ?? 0)
    if (adjusted > awayScore) return "home"
    if (adjusted < awayScore) return "away"
    return "draw"
  }

  if (gameType === "언더오버" || gameType === "S언더오버") {
    const total = homeScore + awayScore
    const line = overUnderLine ?? 0
    if (line === 0) return ""
    if (total > line) return "over"
    if (total < line) return "under"
    return ""
  }

  if (gameType === "SUM") {
    const total = homeScore + awayScore
    return total % 2 === 0 ? "even" : "odd"
  }

  if (homeScore > awayScore) return "home"
  if (homeScore < awayScore) return "away"
  return "draw"
}

interface MatchResultEditorDialogProps {
  game: EditableMatchResultGame | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void | Promise<void>
}

export function MatchResultEditorDialog({
  game,
  open,
  onOpenChange,
  onSaved,
}: MatchResultEditorDialogProps) {
  const [editHomeScore, setEditHomeScore] = useState("")
  const [editAwayScore, setEditAwayScore] = useState("")
  const [editResult, setEditResult] = useState("")
  const [editStatus, setEditStatus] = useState("completed")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!game || !open) return
    setEditHomeScore(game.home_score !== null ? String(game.home_score) : "")
    setEditAwayScore(game.away_score !== null ? String(game.away_score) : "")
    setEditResult(game.result || "")
    setEditStatus(
      game.status && STATUS_OPTIONS.some((o) => o.value === game.status) ? game.status : "completed"
    )
  }, [game, open])

  const closeDialog = () => {
    onOpenChange(false)
    setEditHomeScore("")
    setEditAwayScore("")
    setEditResult("")
    setEditStatus("completed")
  }

  const handleScoreChange = (side: "home" | "away", value: string) => {
    const sanitized = value === "" ? "" : value.replace(/\D/g, "")
    const nextHome = side === "home" ? sanitized : editHomeScore
    const nextAway = side === "away" ? sanitized : editAwayScore

    if (side === "home") setEditHomeScore(sanitized)
    else setEditAwayScore(sanitized)

    if (!game || nextHome === "" || nextAway === "") return

    const homeScore = parseInt(nextHome, 10)
    const awayScore = parseInt(nextAway, 10)
    if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) return

    const derived = deriveResult(
      game.game_type,
      homeScore,
      awayScore,
      game.handicap,
      game.over_under_line
    )
    if (derived) setEditResult(derived)
  }

  const handleSave = async () => {
    if (!game) return
    if (editHomeScore === "" || editAwayScore === "" || !editResult) {
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
              home_score: parseInt(editHomeScore, 10),
              away_score: parseInt(editAwayScore, 10),
              result: editResult,
              status: editResult === "cancelled" ? "cancelled" : editStatus,
            },
          ],
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "결과 저장에 실패했습니다.")
      }

      toast({
        title: "결과 저장 완료",
        description: data.message || "경기 결과가 저장되었습니다.",
      })
      closeDialog()
      await onSaved?.()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "저장 실패",
        description: error instanceof Error ? error.message : "결과 저장 중 오류가 발생했습니다.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !isSaving && (nextOpen ? onOpenChange(true) : closeDialog())}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>경기 결과 수정</DialogTitle>
        </DialogHeader>

        {game && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-muted-foreground mb-1 flex items-center justify-center gap-2 text-sm">
                <Badge variant="outline">{SPORT_LABELS[game.sport] || game.sport}</Badge>
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
                    value={editHomeScore}
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
                    value={editAwayScore}
                    onChange={(e) => handleScoreChange("away", e.target.value)}
                    className="text-center text-lg font-bold tabular-nums"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">경기 상태</label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="상태 선택" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground mt-1 text-xs">
                결과 저장 시 선택한 상태로 반영됩니다. 경기후인 경우 &quot;결과입력됨&quot;으로 바꾼
                뒤 저장하세요.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">결과</label>
              <div className="grid grid-cols-3 gap-2">
                {getResultOptions(game.game_type).map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={editResult === option.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEditResult(option.value)}
                    className="w-full"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {editResult && editHomeScore !== "" && editAwayScore !== "" && (
              <div className="space-y-1 rounded-lg bg-green-500/10 p-3 text-center text-sm">
                <div>
                  <span className="font-semibold">
                    {editHomeScore} : {editAwayScore}
                  </span>
                  {(game.game_type === "핸디캡" || game.game_type === "S핸디캡") &&
                    game.handicap !== null && (
                      <span className="text-muted-foreground">
                        {" "}
                        (핸디 적용: {(parseInt(editHomeScore, 10) + game.handicap).toFixed(
                          1
                        )} vs {editAwayScore})
                      </span>
                    )}
                  {(game.game_type === "언더오버" ||
                    game.game_type === "S언더오버" ||
                    game.game_type === "SUM") && (
                    <span className="text-muted-foreground">
                      {" "}
                      (합계: {parseInt(editHomeScore, 10) + parseInt(editAwayScore, 10)})
                    </span>
                  )}
                </div>
                <div>
                  {"→ "}
                  <Badge variant="secondary">{editResult}</Badge>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={closeDialog} disabled={isSaving}>
            닫기
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !editResult || editHomeScore === "" || editAwayScore === ""}
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
