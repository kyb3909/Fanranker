"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { ArrowRight, ChevronDown, ExternalLink, FileText, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Article = {
  kind: "post" | "draft"
  id: string
  title: string
  created_at: string
  status: string
}
type Articles = { items: Article[]; limit: number; page: number; total: number }
const STATUS: Record<string, string> = {
  drafted: "발행 대기",
  published: "발행됨",
  rejected: "반려",
  deleted: "삭제된 기사",
  archived: "이전 기사",
}
const API = "/api/admin/news-desk/articles"
async function loadArticles(url: string): Promise<Articles> {
  const response = await fetch(url, { cache: "no-store" })
  const result = await response.json()
  if (!response.ok) throw Error(result.error || "기사 목록을 불러오지 못했습니다.")
  return result
}

export function DeskArticlePicker({
  onChoose,
  disabled,
  initiallyOpen = true,
  refreshKey,
  autoSelect = false,
}: {
  onChoose: (id: string, next?: Array<{ kind: "post" | "draft"; id: string }>) => Promise<void>
  disabled: boolean
  initiallyOpen?: boolean
  refreshKey?: string
  autoSelect?: boolean
}) {
  const [open, setOpen] = useState(initiallyOpen)
  const initiallySelected = useRef(false)
  const disabledNow = useRef(disabled)
  disabledNow.current = disabled
  const [q, setQ] = useState(""),
    [search, setSearch] = useState("")
  const [kind, setKind] = useState("all")
  const [page, setPage] = useState(1)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [opened, setOpened] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState(""),
    [failed, setFailed] = useState(false)
  const { data, error, isLoading, isValidating, mutate } = useSWR<Articles>(
    open ? `${API}?q=${encodeURIComponent(search)}&status=${kind}&page=${page}` : null,
    loadArticles,
    { revalidateOnFocus: false }
  )
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 250)
    return () => clearTimeout(timer)
  }, [q])
  useEffect(() => {
    if (refreshKey) void mutate()
  }, [refreshKey, mutate])
  const items = useMemo(() => data?.items ?? [], [data?.items])
  const busy = loadingId !== null
  const choose = useCallback(
    async (article: Article) => {
      if (disabled || busy) return
      const key = `${article.kind}:${article.id}`
      setLoadingId(key)
      setNotice("")
      setFailed(false)
      let imported = false
      try {
        const response = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: article.kind, id: article.id }),
        })
        const result = await response.json()
        if (!response.ok || typeof result.id !== "string")
          throw Error(result.error || "기사를 가져오지 못했습니다.")
        imported = true
        setOpened((previous) => ({ ...previous, [key]: result.id }))
        if (disabledNow.current) {
          setNotice(
            "기사는 가져왔습니다. 현재 기사에 새 수정이 생겨 편집기 이동을 보류했습니다. 수정 내용을 저장한 뒤 ‘이어서 수정’을 누르세요."
          )
          return
        }
        await onChoose(
          result.id,
          items.slice(
            items.findIndex((entry) => entry.kind === article.kind && entry.id === article.id) + 1
          )
        )
        setNotice(
          result.existing
            ? `‘${article.title}’의 이전 데스킹을 열었습니다. 이어서 수정하세요.`
            : `‘${article.title}’ 기사를 불러왔습니다. 아래에서 직접 수정하세요.`
        )
      } catch (cause) {
        setFailed(true)
        setNotice(
          imported
            ? "기사는 가져왔지만 편집기를 열지 못했습니다. ‘이어서 수정’을 눌러 다시 여세요."
            : cause instanceof Error
              ? cause.message
              : "기사를 가져오지 못했습니다. 다시 시도하세요."
        )
      } finally {
        setLoadingId(null)
      }
    },
    [disabled, busy, items, onChoose]
  )
  useEffect(() => {
    if (!autoSelect || initiallySelected.current || !items.length || disabled || busy) return
    initiallySelected.current = true
    void choose(items[0])
  }, [autoSelect, items, disabled, busy, choose])
  return (
    <section className="bg-card overflow-hidden rounded-xl border" aria-label="실제 기사 선택">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="desk-article-list"
        className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5"
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary rounded-lg p-2">
            <FileText className="size-5" />
          </span>
          <span>
            <span className="block font-semibold">전체 기사 데스킹</span>
            <span className="text-muted-foreground mt-1 block text-xs">
              발행 대기·발행·반려 기사를 검색하고 바로 수정합니다.
            </span>
          </span>
        </span>
        <ChevronDown
          className={`text-muted-foreground size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div id="desk-article-list" hidden={!open} className="space-y-3 border-t p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground absolute top-3 left-3 size-4" />
            <Input
              aria-label="올라온 기사 제목 검색"
              placeholder="기사 제목으로 검색"
              className="pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label="기사 발행 상태">
            {[
              ["all", "전체"],
              ["drafted", "발행 대기"],
              ["published", "발행됨"],
              ["rejected", "반려"],
              ["deleted", "삭제됨"],
              ["archived", "이전 기사"],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={kind === value}
                onClick={() => {
                  setKind(value)
                  setPage(1)
                }}
                className={`shrink-0 rounded-full border px-3 py-2 text-xs ${kind === value ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {disabled && (
          <p className="bg-muted/50 rounded-lg px-3 py-2 text-xs leading-5">
            현재 기사에 저장하지 않은 수정이 있습니다. 수정 내용을 저장하거나 되돌린 뒤 다른 기사를
            열 수 있습니다.
          </p>
        )}
        {notice && (
          <p
            role={failed ? "alert" : "status"}
            className={`rounded-lg border px-3 py-2 text-sm leading-6 ${failed ? "border-destructive/40 bg-destructive/5" : "bg-primary/5"}`}
          >
            {notice}
          </p>
        )}
        {error ? (
          <div role="alert" className="space-y-2 rounded-lg border p-4 text-sm">
            <p>{error.message}</p>
            <Button size="sm" variant="outline" onClick={() => void mutate()}>
              기사 목록 다시 불러오기
            </Button>
          </div>
        ) : isLoading || search !== q.trim() ? (
          <p
            role="status"
            className="text-muted-foreground flex items-center justify-center gap-2 py-9 text-sm"
          >
            <Loader2 className="size-4 animate-spin" />
            기사 목록을 불러오는 중…
          </p>
        ) : (
          <>
            <div className="max-h-72 divide-y overflow-auto rounded-lg border">
              {items.map((article) => {
                const key = `${article.kind}:${article.id}`
                const date = new Date(article.created_at)
                return (
                  <div
                    key={key}
                    className="hover:bg-muted/30 flex items-center gap-2 px-3 py-3 sm:px-4"
                  >
                    <button
                      type="button"
                      disabled={disabled || busy}
                      onClick={() => void choose(article)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default disabled:opacity-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`rounded px-1.5 py-0.5 ${article.kind === "post" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                          >
                            {STATUS[article.status] ?? article.status}
                          </span>
                          <span className="text-muted-foreground">
                            {Number.isNaN(date.getTime())
                              ? ""
                              : date.toLocaleString("ko-KR", {
                                  timeZone: "Asia/Seoul",
                                  month: "2-digit",
                                  day: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: false,
                                })}
                          </span>
                        </span>
                        <span className="line-clamp-2 text-sm leading-6 font-medium">
                          {article.title}
                        </span>
                      </span>
                      <span className="text-primary flex shrink-0 items-center gap-1 text-xs font-medium">
                        {loadingId === key ? (
                          <>
                            <Loader2 className="size-3.5 animate-spin" />
                            불러오는 중
                          </>
                        ) : (
                          <>
                            {opened[key] ? "이어서 수정" : "데스킹"}
                            <ArrowRight className="hidden size-3.5 sm:block" />
                          </>
                        )}
                      </span>
                    </button>
                    {article.kind === "post" && article.status === "published" && (
                      <Link
                        href={`/post/${encodeURIComponent(article.id)}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${article.title} 공개 기사 보기`}
                        className="text-muted-foreground hover:bg-muted rounded-md p-2"
                      >
                        <ExternalLink className="size-4" />
                      </Link>
                    )}
                  </div>
                )
              })}
              {items.length === 0 && (
                <div className="space-y-2 p-6 text-center">
                  <p className="text-sm font-medium">
                    {q.trim() ? "제목이 일치하는 기사가 없습니다" : "가져올 기사가 없습니다"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {kind !== "all"
                      ? "다른 발행 상태를 선택하거나 검색어를 바꿔보세요."
                      : "저장된 기사 전체를 검색합니다. 검색 조건을 바꿔보세요."}
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <p className="text-muted-foreground">
                전체 {(data?.total ?? 0).toLocaleString()}건 · {page} /{" "}
                {Math.max(1, Math.ceil((data?.total ?? 0) / (data?.limit ?? 30)))}페이지
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 1 || isValidating || busy}
                  onClick={() => setPage(page - 1)}
                >
                  이전
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!data || page * data.limit >= data.total || isValidating || busy}
                  onClick={() => setPage(page + 1)}
                >
                  다음
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={isValidating || busy}
                onClick={() => void mutate()}
              >
                목록 새로고침
              </Button>
            </div>
          </>
        )}
        <p className="text-muted-foreground text-xs leading-5">
          수정 저장 시 실제 기사와 교정 사례가 함께 갱신됩니다. 발행 대기·반려·삭제 상태는
          유지됩니다.
        </p>
      </div>
    </section>
  )
}
