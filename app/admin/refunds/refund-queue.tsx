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
import { Textarea } from "@/components/ui/textarea"
import { RefreshCw, CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { fetcher } from "@/lib/swr"
import { cn } from "@/lib/utils"

interface Refund {
  id: string
  user_id: string
  amount: number
  /** 'token'(볼) | 'gold' — 골드 건은 자동 재시도가 안 되고 수동 지급이 필요하다 */
  currency: string | null
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

interface ListResponse {
  refunds: Refund[]
  total: number
  page: number
  limit: number
  sort: "newest" | "oldest"
}

const STATUS_TABS = [
  { key: "pending", label: "대기" },
  { key: "resolved", label: "종료됨" },
  { key: "failed", label: "실패" },
  { key: "all", label: "전체" },
]

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "미지급", variant: "destructive" },
  resolved: { label: "종료됨", variant: "secondary" },
  failed: { label: "실패", variant: "outline" },
}

/** 통화 표기 — 표에 없어서 볼인지 골드인지 알 수 없던 것을 드러낸다 */
function currencyLabel(currency: string | null): string {
  if (currency === "gold") return "골드"
  if (currency === "token" || !currency) return "볼"
  return currency
}

/** 자동 재시도는 볼(token)만 지원한다. 서버도 같은 조건으로 거절한다 */
function canAutoRetry(currency: string | null): boolean {
  return !currency || currency === "token"
}

function waitedFor(createdAt: string): { label: string; hours: number } {
  const ms = Date.now() - new Date(createdAt).getTime()
  const hours = ms / 3_600_000
  if (hours < 1) return { label: `${Math.max(1, Math.round(ms / 60_000))}분`, hours }
  if (hours < 24) return { label: `${hours.toFixed(1)}시간`, hours }
  return { label: `${Math.floor(hours / 24)}일`, hours }
}

export function RefundQueue({
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
  const [closing, setClosing] = useState<Refund | null>(null)

  const key = `/api/admin/refunds?status=${encodeURIComponent(status)}&sort=${sort}&page=${page}`
  const { data, error, isLoading, isValidating, mutate } = useSWR<ListResponse>(key, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  useEffect(() => {
    const params = new URLSearchParams()
    params.set("status", status)
    if (sort === "oldest") params.set("sort", "oldest")
    if (page > 1) params.set("page", String(page))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [status, sort, page, pathname, router])

  const refunds = data?.refunds ?? []
  const total = data?.total ?? 0
  const limit = data?.limit ?? 30
  const lastPage = Math.max(1, Math.ceil(total / limit))
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  // 통화별 합계 — 남은 의무의 규모를 건수가 아니라 금액으로 보여준다
  const totals = refunds.reduce<Record<string, number>>((acc, r) => {
    const c = currencyLabel(r.currency)
    acc[c] = (acc[c] ?? 0) + r.amount
    return acc
  }, {})

  const retry = useCallback(
    async (refund: Refund) => {
      setBusy(refund.id)
      try {
        const res = await fetch("/api/admin/refunds", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            refundId: refund.id,
            action: "retry",
            // 낙관적 잠금 — 화면이 본 시도 횟수와 서버가 다르면 중복 실행이다
            expectedAttempts: refund.attempts ?? 0,
          }),
        })
        const body = (await res.json()) as {
          error?: string
          alreadyRunning?: boolean
          staleView?: boolean
        }
        if (res.status === 409) {
          toast({
            title: "다시 실행하지 않았습니다",
            description: body.error ?? "다른 실행이 진행 중입니다.",
          })
          await mutate()
          return
        }
        if (!res.ok) throw new Error(body.error ?? "오류 발생")
        toast({
          title: "환불 완료",
          description: `${refund.amount.toLocaleString()} ${currencyLabel(refund.currency)}이(가) 지급됐습니다.`,
        })
        await mutate()
      } catch (e) {
        toast({
          variant: "destructive",
          title: "환불 재시도 실패",
          description: e instanceof Error ? e.message : "오류 발생",
        })
      } finally {
        setBusy(null)
      }
    },
    [mutate]
  )

  const closeQueue = useCallback(
    async (refund: Refund, note: string) => {
      setBusy(refund.id)
      try {
        const res = await fetch("/api/admin/refunds", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            refundId: refund.id,
            action: "resolve",
            paidConfirmed: true,
            resolveNote: note,
          }),
        })
        const body = (await res.json()) as { error?: string; alreadyHandled?: boolean }
        if (res.status === 409) {
          toast({ title: "이미 처리된 항목입니다", description: "다시 실행하지 않았습니다." })
          await mutate()
          return
        }
        if (!res.ok) throw new Error(body.error ?? "오류 발생")
        toast({
          title: "큐에서 종료했습니다",
          description: "지급 자체는 이 동작으로 실행되지 않습니다. 적어주신 내용만 기록됩니다.",
        })
        setClosing(null)
        await mutate()
      } catch (e) {
        toast({
          variant: "destructive",
          title: "오류",
          description: e instanceof Error ? e.message : "오류 발생",
        })
      } finally {
        setBusy(null)
      }
    },
    [mutate]
  )

  return (
    <div className="space-y-4">
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
          title="가장 오래 기다린 미지급부터 봅니다"
        >
          {sort === "oldest" ? "오래된 순" : "최신 순"}
        </Button>
        <span className="text-muted-foreground ml-auto text-sm tabular-nums">
          {total === 0 ? "0건" : `${from}–${to} / 총 ${total}건`}
          {Object.keys(totals).length > 0 && (
            <>
              {" · 이 쪽 합계 "}
              {Object.entries(totals)
                .map(([c, sum]) => `${sum.toLocaleString()} ${c}`)
                .join(" · ")}
            </>
          )}
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          목록을 갱신하지 못했습니다. 아래는 마지막으로 정상 조회된 결과이며 지금 실제 건수와 다를
          수 있습니다. 미지급 의무가 사라진 것이 아닙니다.
          <Button size="sm" variant="outline" className="ml-2" onClick={() => mutate()}>
            다시 시도
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>유저</TableHead>
              <TableHead>금액</TableHead>
              <TableHead>대기</TableHead>
              <TableHead>사유</TableHead>
              <TableHead>출처</TableHead>
              <TableHead>시도</TableHead>
              <TableHead>마지막 오류</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">조치</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && !data ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground h-24 text-center">
                  불러오는 중…
                </TableCell>
              </TableRow>
            ) : refunds.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground h-24 text-center">
                  {error
                    ? "조회에 실패해 목록을 표시할 수 없습니다."
                    : "이 조건에 해당하는 항목이 없습니다."}
                </TableCell>
              </TableRow>
            ) : (
              refunds.map((refund) => {
                const waited = waitedFor(refund.created_at)
                const autoRetry = canAutoRetry(refund.currency)
                const isPending = refund.status === "pending"
                return (
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
                    <TableCell className="text-sm font-semibold tabular-nums">
                      {refund.amount.toLocaleString()}{" "}
                      {/* 통화가 표에 없어서 볼인지 골드인지 알 수 없던 것을 드러낸다 */}
                      <span className="text-muted-foreground text-xs font-normal">
                        {currencyLabel(refund.currency)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span
                        className={cn(
                          isPending && waited.hours >= 24
                            ? "text-primary font-semibold"
                            : "text-muted-foreground"
                        )}
                        title={new Date(refund.created_at).toLocaleString("ko-KR")}
                      >
                        {waited.label}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm">
                      {refund.description || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{refund.source}</TableCell>
                    <TableCell className="text-xs tabular-nums">{refund.attempts}</TableCell>
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
                      {isPending && (
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {/* 서버가 거절하는 행동을 버튼으로 내놓지 않는다 —
                              종전에는 골드에도 재시도 아이콘이 보였고 누르면 400 이었다 */}
                          {autoRetry ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-blue-700"
                              onClick={() => retry(refund)}
                              disabled={busy === refund.id}
                              title="볼을 자동으로 다시 지급합니다"
                            >
                              {busy === refund.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <>
                                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                                  자동 지급
                                </>
                              )}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">
                              자동 지급 불가
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setClosing(refund)}
                            disabled={busy === refund.id}
                            title="이미 다른 경로로 지급했을 때만 사용합니다. 돈을 지급하지 않습니다"
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            지급 완료로 기록
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs tabular-nums">
          {page} / {lastPage} 쪽{isValidating && " · 갱신 중"}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>
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
          >
            마지막
          </Button>
        </div>
      </div>

      {closing && (
        <CloseQueueDialog
          refund={closing}
          busy={busy === closing.id}
          onCancel={() => setClosing(null)}
          onConfirm={(note) => closeQueue(closing, note)}
        />
      )}
    </div>
  )
}

/**
 * 큐 종료 확인.
 *
 * 이 동작은 **지급이 아니다.** 종전 버튼 이름은 `수동 해결` 이었고 실제로는 상태만 바꿨다.
 * 이름을 행동에 맞추고, 무엇을 했는지 적지 않으면 닫지 못하게 한다(서버도 같은 조건을 요구).
 */
function CloseQueueDialog({
  refund,
  busy,
  onCancel,
  onConfirm,
}: {
  refund: Refund
  busy: boolean
  onCancel: () => void
  onConfirm: (note: string) => void
}) {
  const [note, setNote] = useState("")
  const amount = `${refund.amount.toLocaleString()} ${currencyLabel(refund.currency)}`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="환불 큐 종료 확인"
      className="bg-background/80 fixed inset-0 z-50 flex items-end justify-center p-4 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div className="bg-background w-full max-w-lg rounded-xl border p-4 shadow-lg">
        <h2 className="text-base font-bold">이 항목을 큐에서 종료합니다</h2>
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          이 동작은 <b>돈을 지급하지 않습니다.</b> 목록에서 지우기만 합니다. {amount}을(를) 이미
          다른 경로로 지급했을 때만 사용하세요. 지급하지 않은 채 닫으면 사용자는 못 받고 추적할
          기록도 사라집니다.
        </div>
        <label className="mt-3 block">
          <span className="text-sm font-medium">어떻게 지급했습니까?</span>
          <Textarea
            className="mt-1"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 경제조정 화면에서 골드 450 수동 지급 (2026-09-08 14:20)"
          />
        </label>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            취소
          </Button>
          <Button
            size="sm"
            onClick={() => onConfirm(note.trim())}
            disabled={busy || note.trim().length < 4}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "지급 완료로 기록하고 닫기"}
          </Button>
        </div>
      </div>
    </div>
  )
}
