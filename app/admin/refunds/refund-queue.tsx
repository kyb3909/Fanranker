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
import { RefreshCw, CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface Refund {
  id: string
  user_id: string
  amount: number
  description: string | null
  source: string
  related_slip_id: string | null
  status: string
  attempts: number
  last_error: string | null
  created_at: string
  resolved_at: string | null
  nickname: string | null
}

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "대기", variant: "destructive" },
  resolved: { label: "해결됨", variant: "secondary" },
  failed: { label: "실패", variant: "outline" },
}

export function RefundQueue({
  initialRefunds,
  total: initialTotal,
}: {
  initialRefunds: Refund[]
  total: number
}) {
  const [refunds, setRefunds] = useState<Refund[]>(initialRefunds)
  const [total, setTotal] = useState(initialTotal)
  const [loading, setLoading] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState("pending")

  const fetchRefunds = async (status: string) => {
    try {
      const res = await fetch(`/api/admin/refunds?status=${status}`)
      const data = await res.json()
      setRefunds(data.refunds ?? [])
      setTotal(data.total ?? 0)
    } catch {
      // ignore
    }
  }

  const handleAction = async (refundId: string, action: "retry" | "resolve") => {
    setLoading(refundId)
    try {
      const res = await fetch("/api/admin/refunds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundId, action }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? "오류 발생")
      toast({
        title: action === "retry" ? "환불 재시도 성공" : "수동 해결 처리됨",
        description: action === "retry" ? "토큰이 환불되었습니다." : undefined,
      })
      await fetchRefunds(statusFilter)
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
    fetchRefunds(status)
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
              <TableHead>유저</TableHead>
              <TableHead>금액</TableHead>
              <TableHead>사유</TableHead>
              <TableHead>출처</TableHead>
              <TableHead>시도</TableHead>
              <TableHead>마지막 오류</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {refunds.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground h-24 text-center">
                  환불 항목이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              refunds.map((refund) => (
                <TableRow key={refund.id}>
                  <TableCell>
                    <Link
                      href={`/admin/users/${refund.user_id}`}
                      className="text-xs hover:underline"
                      title={refund.user_id}
                    >
                      {refund.nickname || refund.user_id.slice(0, 12)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {refund.amount.toLocaleString()}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate text-sm">
                    {refund.description || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{refund.source}</TableCell>
                  <TableCell className="text-xs">{refund.attempts}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[160px] truncate text-xs">
                    {refund.last_error || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={STATUS_CONFIG[refund.status]?.variant ?? "outline"}
                      className="text-xs"
                    >
                      {STATUS_CONFIG[refund.status]?.label ?? refund.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {refund.status === "pending" && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-blue-600"
                          onClick={() => handleAction(refund.id, "retry")}
                          disabled={loading === refund.id}
                          title="환불 재시도"
                        >
                          {loading === refund.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-green-600"
                          onClick={() => handleAction(refund.id, "resolve")}
                          disabled={loading === refund.id}
                          title="수동 해결"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
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
