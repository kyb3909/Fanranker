"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Check, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type QueueRow = {
  key: string
  kind: "squad" | "dictionary"
  id: string
  team_id: string
  team_name: string
  name_en: string
  name_kr: string | null
  name_kr_draft: string | null
  expected: string
  given_name_ko: string
  family_name_ko: string
  short_name_ko: string
  news_id?: string | null
  news_expected?: string | null
  news_name_kr?: string | null
}
type Names = {
  name_kr: string
  given_name_ko: string
  family_name_ko: string
  short_name_ko: string
}
type Edit = { row: QueueRow; values: Names }
type QueueData = { items: QueueRow[]; total: number; page: number; pageSize: number }
const API = "/api/admin/player-naming-queue"
const STORAGE = "admin-player-naming-queue-v1"
const fields = ["name_kr", "given_name_ko", "family_name_ko", "short_name_ko"] as const
const fieldLabels = {
  name_kr: "한글 전체 이름",
  given_name_ko: "이름",
  family_name_ko: "성",
  short_name_ko: "이후 표기",
}
const initial = (row: QueueRow): Names => ({
  name_kr: /[가-힣]/.test(row.name_kr ?? "") ? row.name_kr! : "",
  given_name_ko: row.given_name_ko ?? "",
  family_name_ko: row.family_name_ko ?? "",
  short_name_ko: row.short_name_ko ?? "",
})
async function getQueue(url: string): Promise<QueueData> {
  const response = await fetch(url, { cache: "no-store" })
  const result = await response.json()
  if (!response.ok) throw Error(result.error || "선수 목록을 불러오지 못했습니다.")
  return result
}

export function PlayerNamingQueue() {
  const [filter, setFilter] = useState("missing"),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0)
  const [edits, setEdits] = useState<Record<string, Edit>>({}),
    [errors, setErrors] = useState<Record<string, string>>({})
  const [completed, setCompleted] = useState<Set<string>>(new Set()),
    [savedCount, setSavedCount] = useState(0)
  const [busy, setBusy] = useState(false),
    [restored, setRestored] = useState(false),
    [notice, setNotice] = useState("")
  const inputs = useRef(new Map<string, HTMLInputElement>())
  const editCount = Object.keys(edits).length
  const { data, error, isLoading, isValidating, mutate } = useSWR<QueueData>(
    `${API}?filter=${filter}&q=${encodeURIComponent(search)}&page=${page}`,
    getQueue,
    { revalidateOnFocus: false }
  )
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!editCount) {
        setSearch(q.trim())
        setPage(0)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [q, editCount])
  useEffect(() => {
    try {
      const cached = JSON.parse(sessionStorage.getItem(STORAGE) ?? "null")
      if (cached && typeof cached === "object" && !Array.isArray(cached)) {
        const valid = Object.fromEntries(
          Object.entries(cached).filter(([key, value]) => {
            const entry = value as Edit
            return (
              entry?.row?.key === key &&
              typeof entry.row.expected === "string" &&
              fields.every((field) => typeof entry.values?.[field] === "string")
            )
          })
        ) as Record<string, Edit>
        if (Object.keys(valid).length) {
          setEdits(valid)
          setNotice(
            "이 탭에 남아 있던 미저장 입력을 복원했습니다. 이어서 입력하거나 일괄 저장하세요."
          )
        }
      }
    } catch {
      /* The queue also works when browser storage is unavailable. */
    }
    setRestored(true)
  }, [])
  useEffect(() => {
    if (!restored) return
    try {
      if (editCount) sessionStorage.setItem(STORAGE, JSON.stringify(edits))
      else sessionStorage.removeItem(STORAGE)
    } catch {
      /* Preserve current in-memory edits if storage is full. */
    }
  }, [edits, editCount, restored])
  const loaded = data?.items ?? []
  const rows = [
    ...Object.values(edits)
      .filter((edit) => !loaded.some((row) => row.key === edit.row.key))
      .map((edit) => edit.row),
    ...loaded,
  ].filter((row) => !completed.has(row.key))
  function change(row: QueueRow, patch: Partial<Names>) {
    setEdits((previous) => {
      const existing = previous[row.key]
      const values = { ...(existing?.values ?? initial(row)), ...patch }
      const next = { ...previous }
      if (JSON.stringify(values) === JSON.stringify(initial(row))) delete next[row.key]
      else next[row.key] = { row: existing?.row ?? row, values }
      return next
    })
    setErrors((previous) => {
      const next = { ...previous }
      delete next[row.key]
      return next
    })
  }
  async function save() {
    if (busy || !editCount) return
    const invalid: Record<string, string> = {}
    const entries = Object.entries(edits).flatMap(([key, edit]) => {
      const values = Object.fromEntries(
        fields.map((field) => [field, edit.values[field].trim()])
      ) as Names
      if (!values.name_kr || !/[가-힣]/.test(values.name_kr)) {
        invalid[key] = "한글 전체 이름을 입력하세요."
        return []
      }
      if (fields.some((field) => values[field].length > 100)) {
        invalid[key] = "각 이름은 100자 이내로 입력하세요."
        return []
      }
      return [
        {
          key,
          kind: edit.row.kind,
          id: edit.row.id,
          team_id: edit.row.team_id,
          expected: edit.row.expected,
          news_id: edit.row.news_id ?? null,
          news_expected: edit.row.news_expected ?? null,
          ...values,
        },
      ]
    })
    setErrors(invalid)
    if (!entries.length) {
      setNotice("저장할 행의 한글 전체 이름을 확인하세요. 입력은 유지됩니다.")
      return
    }
    setBusy(true)
    setNotice("")
    let savedTotal = 0
    let failedTotal = 0
    let recheckPending = false
    try {
      // Restored input can include rows outside the latest page. Keep each request bounded.
      for (let offset = 0; offset < entries.length; offset += 100) {
        const response = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries: entries.slice(offset, offset + 100) }),
        })
        const result = await response.json()
        if (!response.ok) throw Error(result.error || "일괄 저장하지 못했습니다.")
        const saved = new Set<string>(result.saved ?? [])
        const failed = (result.failed ?? []) as { key: string; error: string }[]
        savedTotal += saved.size
        failedTotal += failed.length
        recheckPending ||= Boolean(result.recheckPending)
        setCompleted((previous) => new Set([...previous, ...saved]))
        setSavedCount((count) => count + saved.size)
        setEdits((previous) =>
          Object.fromEntries(Object.entries(previous).filter(([key]) => !saved.has(key)))
        )
        setErrors((previous) => ({
          ...previous,
          ...Object.fromEntries(failed.map((failure) => [failure.key, failure.error])),
        }))
      }
      const remaining = Object.keys(invalid).length + failedTotal
      setNotice(
        `${savedTotal}명 저장 완료.${remaining ? ` ${remaining}명은 표시된 내용을 확인하고 다시 저장하세요. 입력은 유지됩니다.` : " 저장한 선수는 목록에서 빠지고 다음 선수를 불러옵니다."}${recheckPending ? " 기사 재검사는 다음 자동 실행에서 진행됩니다." : ""}`
      )
      if (page !== 0) setPage(0)
      else
        await mutate().catch(() =>
          setNotice((message) => `${message} 목록 갱신은 새로고침으로 다시 시도하세요.`)
        )
    } catch (cause) {
      setNotice(
        `${savedTotal ? `${savedTotal}명은 저장했습니다. ` : ""}${cause instanceof Error ? cause.message : "저장하지 못했습니다."} 남은 입력은 유지됩니다.`
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {filter === "korean"
              ? "기존 한글 표기 검수"
              : filter === "name_parts"
                ? "이름·성·이후 표기 보완"
                : "미완료 선수 이름 일괄 입력"}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            {filter === "korean"
              ? "기존 한글 표기를 보며 필요한 행만 고치세요. 수정한 행만 저장하며, 열어본 것만으로 검수 완료 처리하지 않습니다."
              : "영문 이름을 보며 아래 칸에 바로 입력하세요. 입력한 행만 한 번에 저장하고 기사 사전에도 반영합니다."}
          </p>
        </div>
        <span className="bg-muted shrink-0 rounded-full px-3 py-1.5 text-xs">
          이번 방문 {savedCount}명 저장
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="text-muted-foreground absolute top-3 left-3 size-4" />
          <Input
            aria-label="입력할 선수 검색"
            disabled={busy || editCount > 0}
            className="pl-9"
            placeholder="영문 선수 이름·팀 검색"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <select
          aria-label="선수 작업 범위"
          className="border-input bg-background h-10 rounded-md border px-3 text-sm"
          disabled={busy || editCount > 0}
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value)
            setPage(0)
            setCompleted(new Set())
          }}
        >
          <option value="missing">한글 이름 미완료</option>
          <option value="korean">기존 한글 표기 검수</option>
          <option value="name_parts">이름·성·이후 표기 보완</option>
        </select>
        <Button
          variant="outline"
          disabled={busy || isValidating || editCount > 0}
          onClick={() => void mutate()}
        >
          목록 새로고침
        </Button>
      </div>
      <p className="text-muted-foreground text-xs leading-5">
        <strong>Tab</strong> 다음 칸 · <strong>Enter</strong> 같은 열의 다음 선수 ·{" "}
        <strong>Shift+Enter</strong> 이전 선수. 성·이름은 선택이며 추측해서 나누지 않습니다.{" "}
        {editCount > 0 && "입력 중에는 검색과 페이지 이동을 잠시 잠급니다."}
      </p>
      {notice && (
        <p role="status" className="bg-muted/40 rounded-lg border p-3 text-sm leading-6">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="border-destructive/40 rounded-lg border p-4 text-sm">
          {error.message}
        </p>
      )}
      {isLoading ? (
        <p
          role="status"
          className="text-muted-foreground flex items-center justify-center gap-2 p-8 text-sm"
        >
          <Loader2 className="size-4 animate-spin" />
          미완료 선수 목록을 불러오는 중…
        </p>
      ) : (
        <div className="max-h-[65vh] overflow-auto rounded-xl border">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead className="bg-muted sticky top-0 z-10">
              <tr>
                <th className="w-12 px-3 py-3 text-left text-xs font-medium">번호</th>
                <th className="min-w-56 px-3 py-3 text-left text-xs font-medium">선수·팀</th>
                {fields.map((field) => (
                  <th key={field} className="min-w-36 px-2 py-3 text-left text-xs font-medium">
                    {fieldLabels[field]}
                    {field === "name_kr" ? " *" : " · 선택"}
                  </th>
                ))}
                <th className="w-14 px-2 py-3 text-xs font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const values = edits[row.key]?.values ?? initial(row)
                return (
                  <tr
                    key={row.key}
                    className={`border-t align-top ${errors[row.key] ? "bg-destructive/5" : edits[row.key] ? "bg-primary/5" : "hover:bg-muted/30"}`}
                  >
                    <td className="text-muted-foreground px-3 py-3 text-xs">
                      {page * 100 + index + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{row.name_en}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {row.team_name || "기사 사전"}
                      </p>
                      {row.news_name_kr && row.news_name_kr !== row.name_kr && (
                        <p className="text-primary mt-1 text-xs">기사 사전: {row.news_name_kr}</p>
                      )}
                      {row.name_kr_draft && row.name_kr_draft !== values.name_kr && (
                        <button
                          type="button"
                          disabled={busy}
                          className="text-primary mt-1.5 text-left text-xs underline underline-offset-2"
                          onClick={() => change(row, { name_kr: row.name_kr_draft! })}
                        >
                          제안 적용: {row.name_kr_draft}
                        </button>
                      )}
                      {errors[row.key] && (
                        <p
                          role="alert"
                          className="text-destructive mt-1.5 max-w-64 text-xs leading-5"
                        >
                          {errors[row.key]}
                        </p>
                      )}
                    </td>
                    {fields.map((field) => (
                      <td key={field} className="px-2 py-2.5">
                        <Input
                          ref={(element) => {
                            const key = `${row.key}:${field}`
                            if (element) inputs.current.set(key, element)
                            else inputs.current.delete(key)
                          }}
                          aria-label={`${row.name_en} ${fieldLabels[field]}`}
                          aria-invalid={Boolean(errors[row.key])}
                          disabled={busy}
                          maxLength={100}
                          value={values[field]}
                          placeholder={field === "name_kr" ? "직접 입력" : ""}
                          onChange={(event) => change(row, { [field]: event.target.value })}
                          onBlur={() => {
                            if (
                              field === "family_name_ko" &&
                              values.family_name_ko.trim() &&
                              !values.short_name_ko.trim()
                            )
                              change(row, { short_name_ko: values.family_name_ko.trim() })
                          }}
                          onKeyDown={(event) => {
                            if (
                              event.key !== "Enter" ||
                              event.nativeEvent.isComposing ||
                              event.keyCode === 229
                            )
                              return
                            event.preventDefault()
                            const next = rows[index + (event.shiftKey ? -1 : 1)]
                            if (next) inputs.current.get(`${next.key}:${field}`)?.focus()
                          }}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-3 text-center text-xs">
                      {errors[row.key] ? (
                        <span className="text-destructive">확인</span>
                      ) : edits[row.key] ? (
                        <span className="text-primary">입력 중</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center">
                    <Check className="text-primary mx-auto mb-2 size-6" />
                    <p className="font-medium">
                      {search
                        ? "검색한 선수가 없습니다"
                        : filter === "missing"
                          ? "이 범위에 미완료 선수가 없습니다"
                          : "이 범위에 표시할 선수가 없습니다"}
                    </p>
                    <p className="text-muted-foreground mt-2 text-xs">
                      검색어나 작업 범위를 바꿔 확인할 수 있습니다.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <p className="text-muted-foreground">
          {(data?.total ?? 0).toLocaleString()}명 · 한 페이지 최대 {data?.pageSize ?? 100}명
        </p>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0 || busy || editCount > 0 || isValidating}
            onClick={() => setPage(page - 1)}
          >
            이전
          </Button>
          <span>
            {page + 1} / {Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 100)))}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={
              (page + 1) * (data?.pageSize ?? 100) >= (data?.total ?? 0) ||
              busy ||
              editCount > 0 ||
              isValidating
            }
            onClick={() => setPage(page + 1)}
          >
            다음
          </Button>
        </div>
      </div>
      <div className="bg-background/95 sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 shadow-sm backdrop-blur">
        <div>
          <p className="text-sm font-semibold">저장할 선수 {editCount}명</p>
          <p className="text-muted-foreground mt-1 text-xs">
            입력한 행만 저장 · 오류가 난 행의 입력은 유지
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            disabled={busy || !editCount}
            onClick={() => {
              setEdits({})
              setErrors({})
              setNotice("미저장 입력을 모두 되돌렸습니다.")
            }}
          >
            미저장 입력 되돌리기
          </Button>
          <Button disabled={busy || !editCount} onClick={() => void save()}>
            {busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                일괄 저장 중…
              </>
            ) : (
              `입력한 ${editCount}명 모두 저장`
            )}
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-xs leading-5">
        한글 전체 이름이 기사 첫 등장 표기입니다. ‘이후 표기’를 비우면 전체 이름을 계속 사용합니다.
        성 입력 후 빈 이후 표기만 채워지며, 제안 표기는 ‘제안 적용’을 눌러야 입력됩니다.
      </p>
    </div>
  )
}
