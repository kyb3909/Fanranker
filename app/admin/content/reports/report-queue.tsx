"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import useSWR from "swr"
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
import { fetcher } from "@/lib/swr"
import { cn } from "@/lib/utils"
import { REASON_LABEL, type Effect } from "@/lib/admin/report-actions"

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

interface ListResponse {
  reports: Report[]
  total: number
  page: number
  limit: number
  sort: "newest" | "oldest"
}

interface EffectResponse {
  reportId: string
  status: string
  terminal: boolean
  authorId: string | null
  resolve: Effect
  dismiss: string[]
  reviewing: string[]
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

/**
 * 신고자 기각률 — **판단 근거가 아니라 참고 정보다.**
 * 분모가 전체 기간의 신고 수(미처리 포함)라 진실성 지표가 아니다. 이 값만으로 기각하지 않는다.
 */
function reporterTrust(total: number, rate: number): { label: string; className: string } {
  if (total < 5) return { label: "표본 적음", className: "text-muted-foreground" }
  return { label: `기각률 ${Math.round(rate * 100)}%`, className: "text-muted-foreground" }
}

/** 레드카드 사유 — 화면 강조용. 실제 카드 종류 판정은 서버가 한다 */
const RED_REASONS = new Set(["discrimination", "advertising"])

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "pending", label: "대기" },
  { key: "reviewing", label: "검토 중" },
  { key: "resolved", label: "인정됨" },
  { key: "dismissed", label: "기각" },
  { key: "all", label: "전체" },
]

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "대기", variant: "destructive" },
  reviewing: { label: "검토 중", variant: "default" },
  resolved: { label: "인정됨", variant: "secondary" },
  dismissed: { label: "기각", variant: "outline" },
}

export function ReportQueue({
  initialStatus,
  initialSort,
  initialPage,
}: {
  initialStatus: string
  initialSort: "newest" | "oldest"
  initialPage: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [status, setStatus] = useState(initialStatus)
  const [sort, setSort] = useState<"newest" | "oldest">(initialSort)
  const [page, setPage] = useState(initialPage)
  const [busy, setBusy] = useState<string | null>(null)
  /** 인정 직전 효과 미리보기를 여는 신고 */
  const [confirming, setConfirming] = useState<Report | null>(null)

  const key = `/api/admin/content/reports?status=${encodeURIComponent(status)}&sort=${sort}&page=${page}`
  // keepPreviousData — 갱신 실패 시 마지막 정상 목록을 지우지 않는다
  const { data, error, isLoading, isValidating, mutate } = useSWR<ListResponse>(key, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  // 화면 상태를 URL 에 남긴다 — 원문·회원 상세를 보고 돌아와도 같은 목록이 열린다
  useEffect(() => {
    const params = new URLSearchParams()
    params.set("status", status)
    if (sort === "oldest") params.set("sort", "oldest")
    if (page > 1) params.set("page", String(page))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [status, sort, page, pathname, router])

  const reports = data?.reports ?? []
  const total = data?.total ?? 0
  const limit = data?.limit ?? 30
  const lastPage = Math.max(1, Math.ceil(total / limit))
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  const run = useCallback(
    async (reportId: string, action: "resolve" | "dismiss" | "reviewing") => {
      setBusy(reportId)
      try {
        const res = await fetch("/api/admin/content/reports", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId, action }),
        })
        const body = (await res.json()) as {
          error?: string
          alreadyHandled?: boolean
          currentStatus?: string
          verdict?: "applied" | "partial" | "failed"
          message?: string
        }
        if (res.status === 409 && body.alreadyHandled) {
          // 응답 유실 후 재실행·동시 처리 — 서버가 막았다. 같은 효과를 또 실행하지 않는다.
          toast({
            title: "이미 처리된 신고입니다",
            description: `다시 실행하지 않았습니다. 현재 상태: ${
              statusConfig[body.currentStatus ?? ""]?.label ?? body.currentStatus
            }`,
          })
          await mutate()
          return
        }
        if (!res.ok) throw new Error(body.error ?? "오류 발생")

        if (body.message) {
          toast({
            // 부분 성공을 성공으로 칠하지 않는다
            variant: body.verdict === "applied" ? "default" : "destructive",
            title:
              body.verdict === "applied"
                ? "적용 완료"
                : body.verdict === "partial"
                  ? "부분 성공"
                  : "실패",
            description: body.message,
          })
        }
        await mutate()
      } catch (e) {
        toast({
          variant: "destructive",
          title: "오류",
          description: e instanceof Error ? e.message : "오류 발생",
        })
      } finally {
        setBusy(null)
        setConfirming(null)
      }
    },
    [mutate]
  )

  return (
    <div className="space-y-4">
      {/* 필터 · 정렬 · 총계 */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.key}
            variant={status === tab.key ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setStatus(tab.key)
              setPage(1)
            }}
          >
            {tab.label}
          </Button>
        ))}
        <Button
          variant={sort === "oldest" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setSort((s) => (s === "oldest" ? "newest" : "oldest"))
            setPage(1)
          }}
          title="가장 오래 방치된 신고부터 봅니다"
        >
          {sort === "oldest" ? "오래된 순" : "최신 순"}
        </Button>
        <span className="text-muted-foreground ml-auto text-sm tabular-nums">
          {total === 0 ? "0건" : `${from}–${to} / 총 ${total}건`}
        </span>
      </div>

      {/* 조회 실패를 빈 목록으로 보여주지 않는다 */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          목록을 갱신하지 못했습니다. 아래 목록은 마지막으로 정상 조회된 결과이며, 지금 실제 건수와
          다를 수 있습니다.
          <Button size="sm" variant="outline" className="ml-2" onClick={() => mutate()}>
            다시 시도
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>대상</TableHead>
              <TableHead>작성자</TableHead>
              <TableHead>사유</TableHead>
              <TableHead>신고 설명</TableHead>
              <TableHead>신고자</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>경과</TableHead>
              <TableHead className="text-right">판정</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && !data ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground h-24 text-center">
                  불러오는 중…
                </TableCell>
              </TableRow>
            ) : reports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground h-24 text-center">
                  {error
                    ? "조회에 실패해 목록을 표시할 수 없습니다."
                    : "이 조건에 해당하는 신고가 없습니다."}
                </TableCell>
              </TableRow>
            ) : (
              reports.map((report) => {
                const isRed = RED_REASONS.has(report.reason)
                const elapsed = elapsedSince(report.created_at)
                // ⚠️ 이 1시간/24시간은 화면 관행이지 운영자가 승인한 SLA 로 확인된 값이 아니다
                const slaHours = isRed ? 1 : 24
                const slaBreached =
                  (report.status === "pending" || report.status === "reviewing") &&
                  elapsed.hours > slaHours
                const trust = reporterTrust(
                  report.reporter_total_reports,
                  report.reporter_dismissed_rate
                )
                const actionable = report.status === "pending" || report.status === "reviewing"
                return (
                  <TableRow key={report.id} className={isRed ? "bg-destructive/5" : ""}>
                    <TableCell>
                      {report.post_id ? (
                        <Link
                          href={`/post/${report.post_id}`}
                          target="_blank"
                          className="text-primary inline-flex items-center gap-1 hover:underline"
                        >
                          <Badge variant="outline" className="cursor-pointer text-xs">
                            {report.target_type === "post"
                              ? "게시글"
                              : report.target_type === "comment"
                                ? "댓글"
                                : report.target_type}
                          </Badge>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          {report.target_type}
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
                            <Badge variant="outline" className="h-4 px-1 text-[10px]">
                              옐로 {report.author_yellow_count}
                            </Badge>
                          )}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-xs">작성자 미상</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-xs">
                          {REASON_LABEL[report.reason] ?? report.reason}
                        </Badge>
                        {/* 색 점만으로 구분하지 않는다 */}
                        <span className="text-muted-foreground text-[10px]">
                          {isRed ? "레드" : "옐로"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[220px] text-sm">
                      <span title={report.description ?? undefined} className="line-clamp-2">
                        {report.description || "-"}
                      </span>
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
                        <span className={cn("text-[10px]", trust.className)}>{trust.label}</span>
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
                        className={cn(
                          slaBreached ? "text-primary font-semibold" : "text-muted-foreground"
                        )}
                        title={new Date(report.created_at).toLocaleString("ko-KR")}
                      >
                        {elapsed.label}
                      </span>
                      {slaBreached && <span className="text-primary ml-1 text-[10px]">초과</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {actionable && (
                        <div className="flex items-center justify-end gap-1">
                          {report.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => run(report.id, "reviewing")}
                              disabled={busy === report.id}
                              title="검토 중으로 표시 (제재 없음)"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-green-700"
                            onClick={() => setConfirming(report)}
                            disabled={busy === report.id}
                            title="위반 인정 — 카드가 발급됩니다"
                          >
                            {busy === report.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                인정
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive h-7 px-2 text-xs"
                            onClick={() => run(report.id, "dismiss")}
                            disabled={busy === report.id}
                            title="위반 아님으로 종결 (제재 없음)"
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5" />
                            기각
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

      {/* 페이지 이동 — 종전에는 최신 30건 뒤로 갈 방법이 없었다 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs tabular-nums">
          {page} / {lastPage} 쪽{isValidating && " · 갱신 중"}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(1)}
            title="첫 쪽"
          >
            처음
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            이전
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => setPage(lastPage)}
            title="가장 마지막 쪽"
          >
            마지막
          </Button>
        </div>
      </div>

      {confirming && (
        <ResolveConfirm
          report={confirming}
          busy={busy === confirming.id}
          onCancel={() => setConfirming(null)}
          onConfirm={() => run(confirming.id, "resolve")}
        />
      )}
    </div>
  )
}

/**
 * 인정 실행 전 효과 확인.
 *
 * 종전에는 체크 아이콘 한 번에 카드가 발급되고 누적이 차면 정지까지 걸렸는데, 그 사실이
 * 실행 전 화면 어디에도 없었다. 여기서는 **서버가 지금 상태로 계산한 효과**를 읽고 나서
 * 실행한다. 기각·검토 표시처럼 제재가 없는 행동에는 이 단계를 두지 않는다.
 */
function ResolveConfirm({
  report,
  busy,
  onCancel,
  onConfirm,
}: {
  report: Report
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { data, error, isLoading } = useSWR<EffectResponse>(
    `/api/admin/content/reports/effect?reportId=${report.id}`,
    fetcher,
    { revalidateOnFocus: false }
  )
  const [ack, setAck] = useState(false)
  const effect = data?.resolve
  const needsAck = !!effect?.needsExtraConfirm

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="위반 인정 실행 확인"
      className="bg-background/80 fixed inset-0 z-50 flex items-end justify-center p-4 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div className="bg-background w-full max-w-lg rounded-xl border p-4 shadow-lg">
        <h2 className="text-base font-bold">이 신고를 인정하면</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {REASON_LABEL[report.reason] ?? report.reason} · 신고 접수{" "}
          {new Date(report.created_at).toLocaleString("ko-KR")}
        </p>

        <div className="mt-3 min-h-[5rem] text-sm">
          {isLoading && <p className="text-muted-foreground">효과를 계산하는 중…</p>}
          {error && (
            <p role="alert" className="text-red-700 dark:text-red-400">
              효과를 확인하지 못했습니다. 무슨 일이 생길지 모르는 채로 실행하지 마세요.
            </p>
          )}
          {data?.terminal && (
            <p role="alert" className="text-amber-700 dark:text-amber-400">
              이미 처리된 신고입니다. 실행해도 아무 일도 일어나지 않습니다.
            </p>
          )}
          {effect && !data?.terminal && (
            <ul className="list-disc space-y-1 pl-4">
              {effect.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>

        {needsAck && (
          <label className="mt-3 flex items-start gap-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              이 실행으로 계정이 <b>종료일 없이</b> 정지된다는 것을 확인했습니다.
            </span>
          </label>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            취소
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={busy || isLoading || !!error || !!data?.terminal || (needsAck && !ack)}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : effect?.willSuspend ? (
              "카드 발급하고 계정 정지"
            ) : effect ? (
              `${effect.cardType === "red" ? "레드" : "옐로"}카드 발급하고 인정`
            ) : (
              "인정"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
