"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { ArrowLeft, BookOpen, Check, Loader2, Plus, Search } from "lucide-react"
import { fetcher } from "@/lib/swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { ManagedNotation } from "@/lib/news/notation/manage"
import { PlayerNamingQueue } from "@/components/admin/player-naming-queue"

const labels = {
  player: "선수",
  coach: "감독",
  team: "팀",
  competition: "대회",
  media: "매체",
  term: "용어",
}
type Draft = {
  id?: string
  category: keyof typeof labels
  preferred_ko: string
  given_name_ko: string
  family_name_ko: string
  short_name_ko: string
  romanized: string
  aliases: string
  disambiguation: string
  notes: string
  expected: string | null
}
const blank: Draft = {
  category: "player",
  preferred_ko: "",
  given_name_ko: "",
  family_name_ko: "",
  short_name_ko: "",
  romanized: "",
  aliases: "",
  disambiguation: "",
  notes: "",
  expected: null,
}
const control = "border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
const storageKey = "admin-news-notation-draft-v1"
const entryDraft = (r: ManagedNotation): Draft => ({
  id: r.id,
  category: r.category,
  preferred_ko: r.preferred_ko,
  given_name_ko: r.given_name_ko ?? "",
  family_name_ko: r.family_name_ko ?? "",
  short_name_ko: r.short_name_ko ?? "",
  romanized: r.romanized ?? "",
  aliases: [...new Set([...(r.surfaces ?? []), ...(r.hangul_alts ?? [])])].join("\n"),
  disambiguation: r.disambiguation ?? "",
  notes: r.notes ?? "",
  expected: r.updated_at,
})

export function NewsDictionaryManager() {
  const [tab, setTab] = useState<"queue" | "manual">("queue")
  return (
    <div className="space-y-5">
      <nav aria-label="사전 입력 방식" className="flex flex-wrap gap-2">
        <Button
          variant={tab === "queue" ? "default" : "outline"}
          aria-pressed={tab === "queue"}
          onClick={() => setTab("queue")}
        >
          미완료 선수
        </Button>
        <Button
          variant={tab === "manual" ? "default" : "outline"}
          aria-pressed={tab === "manual"}
          onClick={() => setTab("manual")}
        >
          검색·직접 등록
        </Button>
        <Link
          href="/admin/news-review/desk"
          className="ml-auto self-center text-sm underline underline-offset-4"
        >
          기사 데스킹 →
        </Link>
      </nav>
      <div hidden={tab !== "queue"}>
        <PlayerNamingQueue />
      </div>
      <div hidden={tab !== "manual"}>
        <ManualNewsDictionaryManager />
      </div>
    </div>
  )
}

function ManualNewsDictionaryManager() {
  const [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [page, setPage] = useState(0)
  const [draft, setDraft] = useState<Draft>({ ...blank }),
    [original, setOriginal] = useState(JSON.stringify(blank))
  const [restored, setRestored] = useState(false),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(0)
  const [notice, setNotice] = useState(""),
    [failure, setFailure] = useState(false),
    [deleteOpen, setDeleteOpen] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const dirty = JSON.stringify(draft) !== original
  const isPerson = draft.category === "player" || draft.category === "coach"
  const { data, error, isLoading, isValidating, mutate } = useSWR<{
    entries: ManagedNotation[]
    total: number
  }>(
    `/api/admin/news-dictionary?q=${encodeURIComponent(search)}&category=${category}&page=${page}`,
    fetcher,
    { revalidateOnFocus: false }
  )
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q)
      setPage(0)
    }, 250)
    return () => clearTimeout(timer)
  }, [q])
  useEffect(() => {
    try {
      const cached = JSON.parse(sessionStorage.getItem(storageKey) ?? "null")
      if (
        cached?.draft &&
        cached.draft.category in labels &&
        typeof cached.original === "string" &&
        ["preferred_ko", "romanized", "aliases", "disambiguation", "notes"].every(
          (key) => typeof cached.draft[key] === "string"
        )
      ) {
        setDraft({ ...blank, ...cached.draft })
        setOriginal(JSON.stringify({ ...blank, ...JSON.parse(cached.original) }))
        setNotice("이 탭에서 작성 중이던 입력을 복원했습니다. 내용을 확인하고 저장하세요.")
      }
    } catch {
      /* Draft recovery is optional when browser storage is unavailable. */
    }
    setRestored(true)
  }, [])
  useEffect(() => {
    if (!restored) return
    try {
      if (dirty) sessionStorage.setItem(storageKey, JSON.stringify({ draft, original }))
      else sessionStorage.removeItem(storageKey)
    } catch {
      /* The editor remains usable without storage. */
    }
  }, [draft, original, dirty, restored])
  useEffect(() => {
    if (saved > 0 && !busy) nameInput.current?.focus()
  }, [saved, busy])
  const change = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setDeleteOpen(false)
  }
  function open(next: Draft) {
    setDraft(next)
    setOriginal(JSON.stringify(next))
    setDeleteOpen(false)
    setNotice("")
    setFailure(false)
    nameInput.current?.focus()
  }
  async function save(remove = false) {
    if (busy) return
    setBusy(true)
    setNotice("")
    setFailure(false)
    try {
      const { aliases, expected, ...entry } = draft
      const surfaces = [
        ...new Set(
          aliases
            .split(/\n|\|/)
            .map((s) => s.trim())
            .filter(Boolean)
        ),
      ]
      if (!remove && (surfaces.length > 60 || surfaces.some((s) => s.length < 2 || s.length > 150)))
        throw Error("별칭은 각각 2~150자, 최대 60개까지 입력하세요. 입력 내용은 그대로 보관됩니다.")
      const res = await fetch("/api/admin/news-dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          remove
            ? { action: "delete", id: entry.id, expected }
            : {
                action: "save",
                expected,
                entry: {
                  ...entry,
                  surfaces,
                  ...(!isPerson
                    ? { given_name_ko: "", family_name_ko: "", short_name_ko: "" }
                    : {}),
                },
              }
        ),
      })
      const result = await res.json()
      if (!res.ok)
        throw Error(result.error || "저장하지 못했습니다. 입력 내용을 확인하고 다시 시도하세요.")
      if (!remove) setSaved((n) => n + 1)
      // Clear the completed editor: its old update version must never be reused.
      open({ ...blank, category: draft.category })
      setNotice(
        remove
          ? `‘${entry.preferred_ko}’를 삭제했습니다.`
          : `‘${entry.preferred_ko}’ 저장 완료. ${result.recheckPending ? "막힌 기사는 다음 자동 실행에서 재검사합니다." : "다음 기사 작성부터 반영됩니다."} 다음 이름을 입력하세요.`
      )
      await mutate().catch(() =>
        setNotice((message) => `${message} 목록 갱신에 실패했습니다. 목록 새로고침으로 확인하세요.`)
      )
      nameInput.current?.focus()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "저장하지 못했습니다.")
      setFailure(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link
          href="/admin/news-training"
          className="text-muted-foreground inline-flex items-center gap-1 hover:underline"
        >
          <ArrowLeft className="size-4" /> 학습 작업실
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <Link className="hover:underline" href="/admin/team-squads">
            선수단 확정·동기화
          </Link>
          <Link className="hover:underline" href="/admin/team-dictionary">
            팀 이름·경기 매핑
          </Link>
          <span className="bg-muted rounded-full px-3 py-1 text-xs">이번 방문 저장 {saved}건</span>
          <a href="#notation-editor" className="font-medium underline xl:hidden">
            입력창으로 이동 ↓
          </a>
        </div>
      </div>
      <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm">
        <p>
          <strong>이름 검색 → 기존 항목 수정 또는 새 등록 → 저장하고 다음 추가</strong>
          <span className="text-muted-foreground mt-1 block text-xs">
            인물은 첫 등장·이후 표기를 지정하고, 별칭에는 같은 대상을 가리키는 다른 이름을 넣습니다.
          </span>
        </p>
        <Link
          href="/admin/news-review/desk"
          className="shrink-0 font-medium underline underline-offset-4"
        >
          기사에서 적용 확인 →
        </Link>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.9fr)]">
        <section aria-label="사전 검색" className="min-w-0 space-y-4">
          <div className="bg-card space-y-3 rounded-xl border p-4">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-3 left-3 size-4" />
              <Input
                className="pl-9"
                aria-label="이름 또는 별칭 검색"
                placeholder="한글명, 원어 이름, 별칭 검색"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1.5" aria-label="검색 분류">
              {[["", "전체"], ...Object.entries(labels)].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={category === value}
                  onClick={() => {
                    setCategory(value)
                    setPage(0)
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${category === value ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <p aria-live="polite">
              {isLoading || search !== q
                ? "검색 중…"
                : `${(data?.total ?? 0).toLocaleString()}개 항목`}
            </p>
            <Button size="sm" variant="ghost" disabled={isValidating} onClick={() => void mutate()}>
              목록 새로고침
            </Button>
          </div>
          {dirty && (
            <p className="text-muted-foreground text-xs">
              작성 중인 입력이 있습니다. 저장하거나 입력을 비우면 다른 항목을 열 수 있습니다. 검색은
              계속 사용할 수 있습니다.
            </p>
          )}
          {error ? (
            <div role="alert" className="rounded-xl border p-5 text-sm">
              사전을 불러오지 못했습니다. 목록 새로고침으로 다시 시도하세요.
            </div>
          ) : isLoading ? (
            <div role="status" className="flex items-center gap-2 p-8 text-sm">
              <Loader2 className="size-4 animate-spin" /> 사전을 불러오는 중…
            </div>
          ) : (
            <>
              <div className="bg-card max-h-[66vh] divide-y overflow-auto rounded-xl border">
                {data?.entries.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={busy || dirty}
                    onClick={() => open(entryDraft(r))}
                    className={`flex w-full items-start gap-3 p-4 text-left transition-colors disabled:cursor-default disabled:opacity-60 ${draft.id === r.id ? "bg-primary/5 ring-primary ring-1 ring-inset" : "hover:bg-muted/50"}`}
                  >
                    <span className="bg-muted text-muted-foreground mt-0.5 shrink-0 rounded px-2 py-1 text-xs">
                      {labels[r.category]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{r.preferred_ko}</span>
                      <span className="text-muted-foreground mt-0.5 block truncate text-sm">
                        {r.romanized || "원어 이름 미등록"}
                      </span>
                      <span className="mt-2 line-clamp-2 text-xs leading-5 break-words">
                        {[...new Set([...(r.surfaces ?? []), ...(r.hangul_alts ?? [])])].join(
                          " · "
                        ) || "별칭 없음"}
                      </span>
                      {(r.category === "player" || r.category === "coach") && r.short_name_ko && (
                        <span className="text-primary mt-1 block text-xs">
                          기사 표기: {r.preferred_ko} → {r.short_name_ko}
                        </span>
                      )}
                      {r.disambiguation && (
                        <span className="text-muted-foreground mt-1 block truncate text-xs">
                          구분: {r.disambiguation}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {draft.id === r.id ? "편집 중" : "수정 →"}
                    </span>
                  </button>
                ))}
                {data?.total === 0 && (
                  <div className="space-y-3 p-8 text-center">
                    <BookOpen className="text-muted-foreground mx-auto size-7" />
                    <p className="font-medium">일치하는 이름이 없습니다</p>
                    <p className="text-muted-foreground text-sm">
                      검색한 이름이 새 대상이라면 오른쪽에서 등록하세요.
                    </p>
                    <Button
                      variant="outline"
                      disabled={busy || dirty}
                      onClick={() =>
                        open({
                          ...blank,
                          category:
                            category in labels ? (category as Draft["category"]) : draft.category,
                          preferred_ko: q,
                        })
                      }
                    >
                      검색한 이름으로 등록
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 0 || isValidating}
                  onClick={() => setPage(page - 1)}
                >
                  이전
                </Button>
                <span className="text-muted-foreground text-xs">
                  {page + 1} / {Math.max(1, Math.ceil((data?.total ?? 0) / 40))} 페이지 · 페이지당
                  40개
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={(page + 1) * 40 >= (data?.total ?? 0) || isValidating}
                  onClick={() => setPage(page + 1)}
                >
                  다음
                </Button>
              </div>
            </>
          )}
        </section>
        <section
          id="notation-editor"
          aria-label="표기 편집"
          className="bg-card min-w-0 scroll-mt-4 rounded-xl border xl:sticky xl:top-5"
        >
          <div className="flex items-center justify-between gap-3 border-b p-5">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <Plus className="size-4" />
                {draft.id ? "표기 수정" : "새 표기 등록"}
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                {dirty
                  ? "아직 저장하지 않은 입력 · 이 탭에 임시 보관"
                  : isPerson
                    ? "첫 등장 표기는 필수, 성·이름과 이후 표기는 선택입니다."
                    : "필수 항목은 대표 표기 하나입니다."}
              </p>
            </div>
            {draft.id && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || dirty}
                onClick={() => open({ ...blank, category: draft.category })}
              >
                새 등록
              </Button>
            )}
          </div>
          {notice && (
            <div
              role={failure ? "alert" : "status"}
              className={`m-4 rounded-lg border p-3 text-sm leading-6 ${failure ? "border-destructive/40 bg-destructive/5" : "bg-muted/40"}`}
            >
              <span className="flex items-start gap-2">
                {!failure && <Check className="mt-1 size-4 shrink-0" />}
                {notice}
              </span>
              {failure && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setQ(draft.preferred_ko)
                      setCategory("")
                      setPage(0)
                      void mutate()
                    }}
                  >
                    이 이름으로 중복 검색
                  </Button>
                  <span className="text-muted-foreground text-xs">입력 내용은 유지됩니다.</span>
                </div>
              )}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
            className="space-y-4 p-5"
          >
            <fieldset disabled={busy} className="space-y-4 disabled:opacity-70">
              <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
                <label className="text-sm font-medium">
                  등록 분류
                  <select
                    className={`${control} mt-1.5`}
                    value={draft.category}
                    onChange={(e) => change({ category: e.target.value as Draft["category"] })}
                  >
                    {Object.entries(labels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  {isPerson ? "첫 등장 표기" : "대표 표기"}{" "}
                  <span className="text-muted-foreground text-xs">필수</span>
                  <Input
                    ref={nameInput}
                    required
                    maxLength={100}
                    className="mt-1.5"
                    placeholder={isPerson ? "예: 부카요 사카" : "예: 아스널"}
                    value={draft.preferred_ko}
                    onChange={(e) => change({ preferred_ko: e.target.value })}
                  />
                </label>
              </div>
              {isPerson && (
                <div className="bg-muted/30 space-y-3 rounded-lg border p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-sm font-medium">
                      한국어 이름{" "}
                      <span className="text-muted-foreground text-xs font-normal">선택</span>
                      <Input
                        className="mt-1.5"
                        maxLength={100}
                        placeholder="부카요"
                        value={draft.given_name_ko}
                        onChange={(e) => change({ given_name_ko: e.target.value })}
                      />
                    </label>
                    <label className="text-sm font-medium">
                      한국어 성{" "}
                      <span className="text-muted-foreground text-xs font-normal">선택</span>
                      <Input
                        className="mt-1.5"
                        maxLength={100}
                        placeholder="사카"
                        value={draft.family_name_ko}
                        onChange={(e) => change({ family_name_ko: e.target.value })}
                        onBlur={(e) => {
                          if (!draft.short_name_ko.trim())
                            change({ short_name_ko: e.target.value.trim() })
                        }}
                      />
                    </label>
                    <label className="text-sm font-medium">
                      이후 표기{" "}
                      <span className="text-muted-foreground text-xs font-normal">선택</span>
                      <Input
                        className="mt-1.5"
                        maxLength={100}
                        placeholder="사카"
                        value={draft.short_name_ko}
                        onChange={(e) => change({ short_name_ko: e.target.value })}
                      />
                    </label>
                  </div>
                  <p className="text-muted-foreground text-xs leading-5">
                    성을 입력하고 다음 칸으로 이동하면 빈 이후 표기를 채웁니다. 손흥민은 이후에도
                    ‘손흥민’, 호날두는 ‘호날두’처럼 직접 지정하세요. 이후 표기를 비우면 첫 등장
                    표기를 계속 씁니다.
                  </p>
                  <p
                    className="bg-background flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-xs"
                    aria-label="기사 이름 표기 미리보기"
                  >
                    <span className="text-muted-foreground">첫 등장</span>
                    <strong>{draft.preferred_ko || "전체 이름"}</strong>
                    <span aria-hidden="true">→</span>
                    <span className="text-muted-foreground">이후</span>
                    <strong>{draft.short_name_ko || draft.preferred_ko || "같은 이름"}</strong>
                  </p>
                </div>
              )}
              <label className="block text-sm font-medium">
                원어 이름
                <Input
                  maxLength={150}
                  className="mt-1.5"
                  placeholder="예: Bukayo Saka"
                  value={draft.romanized}
                  onChange={(e) => change({ romanized: e.target.value })}
                />
              </label>
              <label className="block text-sm font-medium">
                별칭 <span className="text-muted-foreground text-xs font-normal">한 줄에 하나</span>
                <Textarea
                  className="mt-1.5"
                  rows={4}
                  placeholder={"Saka\n사카\n부카요 사카"}
                  value={draft.aliases}
                  onChange={(e) => change({ aliases: e.target.value })}
                />
                <span className="text-muted-foreground mt-1.5 block text-xs leading-5 font-normal">
                  영문 약칭, 다른 한글 표기처럼 같은 대상을 뜻하는 이름을 입력하세요. 이름이 비슷한
                  다른 선수는 별도 등록합니다.
                </span>
              </label>
              <details open={Boolean(draft.disambiguation || draft.notes)}>
                <summary className="text-muted-foreground cursor-pointer text-sm">
                  동명이인 구분·확인 메모
                </summary>
                <div className="mt-3 space-y-3">
                  <label className="block text-sm">
                    구분할 팀·문맥
                    <Input
                      maxLength={400}
                      className="mt-1.5"
                      placeholder="예: Arsenal|아스널"
                      value={draft.disambiguation}
                      onChange={(e) => change({ disambiguation: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    확인 근거·메모
                    <Textarea
                      className="mt-1.5"
                      rows={2}
                      maxLength={1000}
                      value={draft.notes}
                      onChange={(e) => change({ notes: e.target.value })}
                    />
                  </label>
                </div>
              </details>
            </fieldset>
            <div className="space-y-3 border-t pt-4">
              <Button
                disabled={busy || !draft.preferred_ko.trim()}
                type="submit"
                className="w-full"
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    저장 중…
                  </>
                ) : draft.id ? (
                  "수정 저장하고 다음 추가"
                ) : (
                  "저장하고 다음 추가"
                )}
              </Button>
              <div className="flex justify-between gap-2">
                <Button
                  disabled={busy}
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => open({ ...blank, category: draft.category })}
                >
                  입력 비우기
                </Button>
                {draft.id && (
                  <Button
                    disabled={busy}
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setDeleteOpen(!deleteOpen)}
                  >
                    이 항목 삭제
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground text-xs leading-5">
                저장 후 같은 분류로 다음 이름을 바로 입력할 수 있습니다. 새로고침해도 작성 중인
                입력은 이 탭에 남습니다.
              </p>
            </div>
            {deleteOpen && (
              <div className="border-destructive/40 space-y-2 rounded-lg border p-3 text-sm">
                <p>‘{draft.preferred_ko}’와 연결된 별칭을 사전에서 삭제합니다.</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    type="button"
                    disabled={busy}
                    onClick={() => void save(true)}
                  >
                    삭제 확정
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => setDeleteOpen(false)}
                  >
                    유지
                  </Button>
                </div>
              </div>
            )}
          </form>
        </section>
      </div>
    </div>
  )
}
