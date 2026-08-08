import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Clock } from "lucide-react"
import { formatKoreanTime } from "@/lib/utils/date"

interface CronJobMeta {
  name: string
  label: string
  schedule: string
  /** 이 분(min)을 넘도록 실행 기록이 없으면 "지연"으로 표시 */
  staleAfterMin: number
}

/** vercel.json 의 cron 등록 목록 — 이 목록이 모니터의 기준이 된다 */
export const CRON_JOBS: CronJobMeta[] = [
  { name: "wisetoto-sync", label: "WiseToto 라이브 스코어", schedule: "매분", staleAfterMin: 10 },
  { name: "betman-sync", label: "Betman 동기화 워치독", schedule: "30분마다", staleAfterMin: 90 },
  {
    name: "metaverse-cleanup-rooms",
    label: "메타버스 빈 방 정리",
    schedule: "30분마다",
    staleAfterMin: 90,
  },
  // reddit-seed-posts 는 vercel.json 에서 내려간 중단 잡 — 기준 목록에 남겨두면
  // 영구 "지연" 뱃지로 진짜 지연을 가린다 (2026-08-08 감사 드리프트 정리)
  {
    name: "daily-token-reset",
    label: "일일 토큰 리셋",
    schedule: "매일 23:00 KST",
    staleAfterMin: 26 * 60,
  },
  {
    name: "weekly-analytics",
    label: "주간 분석 리포트",
    schedule: "매주 월요일",
    staleAfterMin: 8 * 24 * 60,
  },
]

export interface CronLastRun {
  status: string
  http_status: number | null
  error_message: string | null
  duration_ms: number | null
  started_at: string
}

interface CronJobStatus extends CronJobMeta {
  lastRun: CronLastRun | null
}

type Verdict = "ok" | "stale" | "error" | "missing"

function verdict(job: CronJobStatus): Verdict {
  if (!job.lastRun) return "missing"
  if (job.lastRun.status === "error") return "error"
  const ageMin = (Date.now() - new Date(job.lastRun.started_at).getTime()) / 60_000
  if (ageMin > job.staleAfterMin) return "stale"
  return "ok"
}

const VERDICT_BADGE: Record<Verdict, { label: string; className: string }> = {
  ok: { label: "정상", className: "bg-green-100 text-green-800" },
  stale: { label: "지연", className: "bg-yellow-100 text-yellow-800" },
  error: { label: "오류", className: "bg-primary/15 text-primary" },
  missing: { label: "기록 없음", className: "bg-primary/15 text-primary" },
}

export function CronMonitor({ jobs }: { jobs: CronJobStatus[] }) {
  const problems = jobs.filter((j) => verdict(j) !== "ok").length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-purple-600" />
        <h2 className="text-lg font-semibold">Cron 통합 모니터</h2>
        {problems > 0 && (
          <Badge className="bg-primary/15 text-primary">{problems}건 점검 필요</Badge>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-xs font-medium">
            vercel.json 등록 cron {jobs.length}개 — 마지막 실행 기준
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>작업</TableHead>
                <TableHead>주기</TableHead>
                <TableHead>마지막 실행</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>소요</TableHead>
                <TableHead>비고</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                const v = verdict(job)
                const badge = VERDICT_BADGE[v]
                return (
                  <TableRow key={job.name}>
                    <TableCell>
                      <div className="text-sm font-medium">{job.label}</div>
                      <div className="text-muted-foreground font-mono text-xs">{job.name}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{job.schedule}</TableCell>
                    <TableCell className="text-xs">
                      {job.lastRun ? formatKoreanTime(job.lastRun.started_at) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${badge.className}`}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {job.lastRun?.duration_ms != null ? `${job.lastRun.duration_ms}ms` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[220px] truncate text-xs">
                      {v === "missing"
                        ? "cron_run_log에 기록 없음 — cron 미동작 의심"
                        : (job.lastRun?.error_message ?? "")}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
