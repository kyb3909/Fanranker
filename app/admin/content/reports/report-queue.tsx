"use client"

import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, Eye, Loader2, ExternalLink } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import Link from "next/link"

interface Report {
  id: string
  reporter_id: string
  target_type: string
  target_id: string
  reason: string
  description: string | null
  status: string
  assigned_to: string | null
  resolved_at: string | null
  resolution: string | null
  created_at: string
  post_id: string | null
  post_title: string | null
  author_id: string | null
  author_yellow_count: number
  reporter_total_reports: number
  reporter_dismissed_rate: number
}

/** 신고 접수 후 경과 시간 — label + 시간(소수) */
function elapsedSince(createdAt: string): { label: string; hours: number } {
  const ms = Date.now() - new Date(createdAt).getTime()
  const hours = ms / 3_600_000
  const h = Math.floor(hours)
  if (h >= 24) return { label: `${Math.floor(h / 24)}일 ${h % 24}시간`, hours }
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return { label: h > 0 ? `${h}시간 ${m}분` : `${m}분`, hours }
}

/** 신고자 신뢰도 배지 — 누적 5건 미만은 표본 부족 */
function reporterTrust(total: number, rate: number): { label: string; className: string } {
  if (total < 5) return { label: "표본 적음", className: "text-muted-foreground" }
  const pct = Math.round(rate * 100)
  if (rate >= 0.5) return { label: `기각 ${pct}%`, className: "border-primary text-primary" }
  if (rate >= 0.2)
    return {
      label: `기각 ${pct}%`,
      className: "border-yellow-500 text-yellow-700 dark:text-yellow-400",
    }
  return {
    label: `기각 ${pct}%`,
    className: "border-green-600 text-green-700 dark:text-green-400",
  }
}

const REPORT_REASONS: Record<string, { label: string; card: "red" | "yellow" }> = {
  discrimination: { label: "차별적 표현", card: "red" },
  advertising: { label: "광고/스팸", card: "red" },
  profanity: { label: "욕설/비하", card: "yellow" },
  abuse: { label: "어뷰징", card: "yellow" },
  political: { label: "정치글", card: "yellow" },
}

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "대기", variant: "destructive" },
  reviewing: { label: "검토 중", variant: "default" },
  resolved: { label: "처리됨", variant: "secondary" },
  dismissed: { label: "기각", variant: "outline" },
}

export function ReportQueue({
  initialReports,
  total: initialTotal,
}: {
  initialReports: Report[]
  total: number
}) {
  const [reports, setReports] = useState<Report[]>(initialReports)
  const [total, setTotal] = useState(initialTotal)
  const [loading, setLoading] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState("pending")

  const fetchReports = async (status: string) => {
    try {
      const res = await fetch(`/api/admin/content/reports?status=${status}`)
      const data = await res.json()
      setReports(data.reports ?? [])
      setTotal(data.total ?? 0)
    } catch {
      // ignore
    }
  }

  const handleAction = async (reportId: string, action: string) => {
    setLoading(reportId)
    try {
      const res = await fetch("/api/admin/content/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, action }),
      })
      const body = (await res.json()) as {
        error?: string
        cardIssued?: boolean
        userSuspended?: boolean
      }
      if (!res.ok) throw new Error(body.error ?? "오류 발생")

      if (action === "resolve") {
        if (body.userSuspended) {
          toast({
            variant: "destructive",
            title: "자동 정지 발효",
            description: "옐로카드 누적으로 작성자가 정지되었습니다.",
          })
        } else if (body.cardIssued) {
          toast({
            title: "카드 발급",
            description: "신고 사유에 따라 카드가 발급되었습니다.",
          })
        }
      }

      await fetchReports(statusFilter)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "오류",
        description: error instanceof Error ? error.message : "오류 발생",
      })
    } finally {
      setLoading(null)
    }
  }

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status)
    fetchReports(status)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <Button
            key={key}
            variant={statusFilter === key ? "default" : "outline"}
            size="sm"
            onClick={() => handleStatusFilter(key)}
          >
            {cfg.label}
          </Button>
        ))}
        <Button
          variant={statusFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => handleStatusFilter("all")}
        >
          전체
        </Button>
        <span className="text-muted-foreground ml-auto text-sm">총 {total}건</span>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>유형</TableHead>
              <TableHead>작성자</TableHead>
              <TableHead>사유</TableHead>
              <TableHead>설명</TableHead>
              <TableHead>신고자</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>경과</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground h-24 text-center">
                  신고가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              reports.map((report) => {
                const reasonInfo = REPORT_REASONS[report.reason]
                const isRed = reasonInfo?.card === "red"
                const elapsed = elapsedSince(report.created_at)
                const slaHours = isRed ? 1 : 24
                const slaBreached =
                  (report.status === "pending" || report.status === "reviewing") &&
                  elapsed.hours > slaHours
                const trust = reporterTrust(
                  report.reporter_total_reports,
                  report.reporter_dismissed_rate
                )
                return (
                  <TableRow key={report.id} className={isRed ? "border-l-primary border-l-4" : ""}>
                    <TableCell>
                      {report.post_id ? (
                        <Link
                          href={`/post/${report.post_id}`}
                          target="_blank"
                          className="text-primary inline-flex items-center gap-1 hover:underline"
                        >
                          <Badge
                            variant="outline"
                            className="hover:bg-primary/10 cursor-pointer text-xs"
                          >
                            {report.target_type === "post" ? "게시글" : "댓글"}
                          </Badge>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          {report.target_type === "post" ? "게시글" : "댓글"}
                        </Badge>
                      )}
                      {report.post_title && (
                        <p className="text-muted-foreground mt-0.5 max-w-[150px] truncate text-xs">
                          {report.post_title}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {report.author_id ? (
                        <Link
                          href={`/admin/users/${report.author_id}`}
                          className="inline-flex items-center gap-1 text-xs hover:underline"
                          title={report.author_id}
                        >
                          <span className="text-muted-foreground">상세</span>
                          {report.author_yellow_count > 0 && (
                            <Badge
                              variant="outline"
                              className="h-4 border-yellow-500 px-1 text-[10px] text-yellow-700 dark:text-yellow-400"
                            >
                              옐로 {report.author_yellow_count}
                            </Badge>
                          )}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${isRed ? "bg-primary" : "bg-yellow-500"}`}
                        />
                        <Badge variant="secondary" className="text-xs">
                          {reasonInfo?.label ?? report.reason}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">
                      {report.description || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <Link
                          href={`/admin/users/${report.reporter_id}`}
                          className="text-muted-foreground text-xs hover:underline"
                          title={report.reporter_id}
                        >
                          {report.reporter_id.slice(0, 10)}…
                        </Link>
                        <Badge
                          variant="outline"
                          className={`h-4 w-fit px-1 text-[10px] ${trust.className}`}
                        >
                          {trust.label}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={statusConfig[report.status]?.variant ?? "outline"}
                        className="text-xs"
                      >
                        {statusConfig[report.status]?.label ?? report.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span
                        className={
                          slaBreached ? "text-primary font-semibold" : "text-muted-foreground"
                        }
                        title={new Date(report.created_at).toLocaleString("ko-KR")}
                      >
                        {elapsed.label}
                      </span>
                      {slaBreached && <span className="text-primary ml-1 text-[10px]">초과</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {report.status === "pending" && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleAction(report.id, "reviewing")}
                            disabled={loading === report.id}
                            title="검토 시작"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-green-600"
                            onClick={() => handleAction(report.id, "resolve")}
                            disabled={loading === report.id}
                            title="처리"
                          >
                            {loading === report.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive h-7 w-7"
                            onClick={() => handleAction(report.id, "dismiss")}
                            disabled={loading === report.id}
                            title="기각"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      {report.status === "reviewing" && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-green-600"
                            onClick={() => handleAction(report.id, "resolve")}
                            disabled={loading === report.id}
                            title="처리"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive h-7 w-7"
                            onClick={() => handleAction(report.id, "dismiss")}
                            disabled={loading === report.id}
                            title="기각"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
