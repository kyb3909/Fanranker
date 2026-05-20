import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Layers } from "lucide-react"
import { formatKoreanTime } from "@/lib/utils/date"

/** 이 건수를 넘으면 적체 경고 */
const WARN_THRESHOLD = 100

/**
 * temperature_update_queue 적체 모니터.
 * posts/comments/votes 트리거가 큐에 적재하고 온도 갱신 작업이 비운다.
 * 미처리(processed_at IS NULL) 건수가 쌓이면 게시글 정렬이 실제 활동과 어긋난다.
 */
export function QueueBacklogCard({
  backlog,
  oldestQueuedAt,
}: {
  backlog: number
  oldestQueuedAt: string | null
}) {
  const isWarn = backlog > WARN_THRESHOLD

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-orange-600" />
            <CardTitle className="text-sm font-medium">온도 갱신 큐</CardTitle>
          </div>
          <Badge className={isWarn ? "bg-primary/15 text-primary" : "bg-green-100 text-green-800"}>
            {isWarn ? "적체" : "정상"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">미처리 건수</span>
          <span className={`font-semibold ${isWarn ? "text-primary" : ""}`}>
            {backlog.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">가장 오래된 대기</span>
          <span>{oldestQueuedAt ? formatKoreanTime(oldestQueuedAt) : "—"}</span>
        </div>
        {isWarn && (
          <div className="bg-primary/10 text-primary mt-2 rounded p-2 text-xs">
            미처리 {backlog.toLocaleString()}건 — 온도 갱신 작업 지연 의심. 게시글 정렬이 실제
            활동과 어긋날 수 있습니다.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
