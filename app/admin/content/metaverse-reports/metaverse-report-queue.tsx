"use client"

import { useState } from "react"
import Link from "next/link"
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
import { CheckCircle2, XCircle, Eye, Loader2, ShieldAlert } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface Report {
  id: string
  reporter_user_id: string
  reported_user_id: string
  reason: string
  note: string | null
  context_scope: string | null
  context_room_id: string | null
  status: string
  created_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  reporter_nickname: string | null
  reported_nickname: string | null
}

const REASON_LABELS: Record<string, string> = {
  spam: "도배/광고",
  abuse: "욕설/비방",
  hate: "혐오 발언",
  sexual: "성적 내용",
  harassment: "희롱/괴롭힘",
  impersonation: "사칭",
  other: "기타",
}

const SCOPE_LABELS: Record<string, string> = {
  world: "월드",
  room: "룸",
  local: "로컬",
  other: "기타",
}

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  open: { label: "대기", variant: "destructive" },
  reviewed: { label: "검토", variant: "default" },
  actioned: { label: "조치됨", variant: "secondary" },
  dismissed: { label: "기각", variant: "outline" },
}

export function MetaverseReportQueue({
  initialReports,
  total: initialTotal,
}: {
  initialReports: Report[]
  total: number
}) {
  const [reports, setReports] = useState<Report[]>(initialReports)
  const [total, setTotal] = useState(initialTotal)
  const [loading, setLoading] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState("open")

  const fetchReports = async (status: string) => {
    try {
      const res = await fetch(`/api/admin/content/metaverse-reports?status=${status}`)
      const data = await res.json()
      setReports(data.reports ?? [])
      setTotal(data.total ?? 0)
    } catch {
      // ignore
    }
  }

  const handleAction = async (reportId: string, action: "reviewed" | "actioned" | "dismissed") => {
    setLoading(reportId)
    try {
      const res = await fetch("/api/admin/content/metaverse-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, action }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? "오류 발생")
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
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
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
              <TableHead>대상</TableHead>
              <TableHead>사유</TableHead>
              <TableHead>메모</TableHead>
              <TableHead>맥락</TableHead>
              <TableHead>신고자</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>신고일</TableHead>
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
              reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>
                    <Link
                      href={`/admin/users/${report.reported_user_id}`}
                      className="inline-flex items-center gap-1 text-xs hover:underline"
                      title={report.reported_user_id}
                    >
                      <ShieldAlert className="text-primary h-3 w-3" />
                      {report.reported_nickname || report.reported_user_id.slice(0, 12)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {REASON_LABELS[report.reason] ?? report.reason}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">
                    {report.note || "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {report.context_scope ? (
                      <span className="text-muted-foreground">
                        {SCOPE_LABELS[report.context_scope] ?? report.context_scope}
                        {report.context_room_id && (
                          <span className="ml-1 font-mono">
                            ({report.context_room_id.slice(0, 8)})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/users/${report.reporter_user_id}`}
                      className="text-muted-foreground text-xs hover:underline"
                      title={report.reporter_user_id}
                    >
                      {report.reporter_nickname || report.reporter_user_id.slice(0, 12)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={STATUS_CONFIG[report.status]?.variant ?? "outline"}
                      className="text-xs"
                    >
                      {STATUS_CONFIG[report.status]?.label ?? report.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(report.created_at).toLocaleDateString("ko-KR")}
                  </TableCell>
                  <TableCell className="text-right">
                    {(report.status === "open" || report.status === "reviewed") && (
                      <div className="flex items-center justify-end gap-1">
                        {report.status === "open" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleAction(report.id, "reviewed")}
                            disabled={loading === report.id}
                            title="검토 표시"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-green-600"
                          onClick={() => handleAction(report.id, "actioned")}
                          disabled={loading === report.id}
                          title="조치 완료"
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
                          onClick={() => handleAction(report.id, "dismissed")}
                          disabled={loading === report.id}
                          title="기각"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
