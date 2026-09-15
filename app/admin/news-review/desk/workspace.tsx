"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import {
  BookOpen,
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Save,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DeskArticlePicker } from "@/components/admin/desk-article-picker"
import {
  CATEGORY_LABELS,
  type DeskItem,
  type DeskLesson,
  type DeskRevision,
  type DeskResponse,
} from "@/lib/news/desk/types"

const API = "/api/admin/news-desk"
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "미확인"
const STATUS = {
  generating: "작성 중",
  drafted: "데스킹 대기",
  reviewed: "검수 완료",
  rejected: "보관",
  failed: "작성 보류",
}
const KIND = {
  CONFIRMED: "확인된 사실",
  REPORTED: "언론 보도",
  CLAIM: "당사자 주장",
  OPINION: "평가·의견",
}
const SKIP: Record<string, string> = {
  busy: "다른 초안을 작성 중입니다.",
  paused: "자동 작성이 멈춰 있습니다.",
  not_due: "다음 작성 시각을 기다리고 있습니다.",
  queue_full: "대기함이 찼습니다. 기사를 검수하거나 대기 목표를 늘려 주세요.",
  daily_limit: "오늘 생성 한도에 도달했습니다.",
  no_source: "최근 원문 중 아직 작성하지 않은 신뢰 출처가 없습니다.",
  duplicate_source: "이미 작성한 원문입니다.",
}
async function request(body?: unknown, url = API) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  })
  const data = await response.json()
  if (!response.ok) throw Error(data.error || "요청에 실패했습니다.")
  return data
}
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "요청을 완료하지 못했습니다."
const box = "rounded-xl border border-wc-line bg-wc-card"
const muted = "text-sm text-wc-mute"

export function DeskWorkspace() {
  const [selected, setSelected] = useState<string | null>(null)
  const { data, error, isLoading, mutate } = useSWR<DeskResponse>(
    selected ? `${API}?item=${selected}` : API,
    (url: string) => request(undefined, url),
    {
      refreshInterval: 10000,
      revalidateOnFocus: true,
    }
  )
  const [filter, setFilter] = useState("pending")
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [nextArticles, setNextArticles] = useState<Array<{ kind: "post" | "draft"; id: string }>>(
    []
  )
  const items = (data?.items ?? [])
    .filter((entry) => Boolean(entry.origin))
    .filter(
      (item) =>
        filter === "all" ||
        (filter === "pending" && ["drafted", "generating"].includes(item.status)) ||
        (filter === "reviewed" && item.status === "reviewed") ||
        (filter === "failed" && ["failed", "rejected"].includes(item.status))
    )
  const item = selected ? data?.items.find((i) => i.id === selected) : items[0]
  // Pin the first selection so a newly generated item cannot replace an editor's open draft.
  useEffect(() => {
    if (selected) return
    if (window.location.hash === "#lessons" && data) {
      const pending = new Set(
        data.lessons.filter((l) => l.review_status === "pending").map((l) => l.revision_id)
      )
      const recent =
        data.revisions.find(
          (r) => pending.has(r.id) && data.items.some((i) => i.id === r.item_id)
        ) ?? data.revisions.find((r) => data.items.some((i) => i.id === r.item_id))
      if (recent) {
        setFilter("all")
        setSelected(recent.item_id)
        return
      }
    }
    if (items[0]) setSelected(items[0].id)
  }, [selected, items, data])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault()
        event.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  const choose = (id: string) => {
    if (item?.id === id) return
    if (dirty && !window.confirm("저장하지 않은 수정이 있습니다. 다른 기사로 이동할까요?")) return
    setDirty(false)
    setSelected(id)
    setNextArticles([])
  }
  async function nextArticle() {
    const next = nextArticles[0]
    if (!next) return
    const response = await fetch(API + "/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    })
    const result = await response.json()
    if (!response.ok) throw Error(result.error || "다음 기사를 불러오지 못했습니다.")
    setSelected(result.id)
    setNextArticles((queue) => queue.slice(1))
  }
  async function act(body: unknown) {
    setBusy(true)
    setNotice("")
    try {
      const result = await request(body)
      setNotice(
        result.skipped
          ? (SKIP[result.skipped] ?? "지금은 추가 작성할 수 없습니다.")
          : result.id
            ? "새 초안을 작성하고 있습니다. 완료되면 대기함에 나타납니다."
            : "설정을 저장했습니다."
      )
      if (result.id && !dirty) setSelected(result.id)
      await mutate()
    } catch (e) {
      setNotice(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="text-wc-ink mx-auto w-full max-w-[1440px] space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-wc-mute text-xs font-medium tracking-wide">NEWSROOM / EDITOR’S DESK</p>
          <h1 className="text-2xl font-bold tracking-tight">기사 데스킹</h1>
          <p className={muted}>
            기사를 고치고 저장하면 실제 기사와 교정 사례에 바로 반영됩니다. 이유는 선택입니다.
          </p>
          {data?.isAdmin && (
            <nav aria-label="학습 작업 이동" className="flex gap-4 text-sm">
              <Link
                className="underline"
                href="/admin/news-training"
                onClick={(e) => {
                  if (
                    dirty &&
                    !window.confirm("저장하지 않은 수정이 있습니다. 학습 작업대로 이동할까요?")
                  )
                    e.preventDefault()
                }}
              >
                학습 작업대로
              </Link>
              <Link className="underline" href="/admin/news-dictionary" target="_blank">
                표기 사전 열기
              </Link>
            </nav>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void mutate()}
            aria-label="데스킹 새로고침"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </header>
      {notice && (
        <p role="status" className={box + " p-4 text-sm"}>
          {notice}
        </p>
      )}
      {error && (
        <div role="alert" className={box + " p-4 text-sm"}>
          {errorText(error)}{" "}
          <Button variant="link" onClick={() => void mutate()}>
            다시 불러오기
          </Button>
        </div>
      )}
      {isLoading && !data && (
        <p role="status" className={muted}>
          <Loader2 className="mr-2 inline size-4 animate-spin" />
          원문과 초안을 불러오고 있습니다.
        </p>
      )}
      {data && (
        <>
          <DeskArticlePicker
            disabled={dirty || busy}
            autoSelect={!selected}
            refreshKey={item ? `${item.id}:${item.version}` : undefined}
            onChoose={async (id, next) => {
              window.history.replaceState(null, "", window.location.pathname)
              setFilter("all")
              setSelected(id)
              setNextArticles(next ?? [])
              await mutate()
            }}
          />
          <details>
            <summary className="text-wc-mute cursor-pointer text-xs">
              별도 연습 초안 자동 작성 설정
            </summary>
            <section className={box + " mt-3 overflow-hidden"} aria-label="자동 작성 현황">
              <div className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <span>
                    대기 <strong className="ml-1 text-lg">{data.counts.pending}</strong>
                    <span className="text-wc-mute"> / {data.settings.pending_target}</span>
                  </span>
                  <span>
                    검수 완료 <strong className="ml-1 text-lg">{data.counts.reviewed}</strong>
                  </span>
                  <span>
                    활성 학습 <strong className="ml-1 text-lg">{data.counts.lessons}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    {data.settings.enabled ? (
                      <Play className="text-wc-burgundy size-3" />
                    ) : (
                      <Pause className="size-3" />
                    )}
                    {data.settings.enabled ? "매시간 자동 보충" : "자동 작성 멈춤"}
                  </span>
                  {data.isAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void act({
                          action: "settings",
                          enabled: !data.settings.enabled,
                          pending_target: data.settings.pending_target,
                          daily_limit: data.settings.daily_limit,
                        })
                      }
                    >
                      {data.settings.enabled ? "일시정지" : "다시 시작"}
                    </Button>
                  )}
                </div>
              </div>
              <details className="border-wc-line border-t px-4 py-3">
                <summary className="text-wc-mute cursor-pointer text-xs">
                  오늘 {data.counts.today} / {data.settings.daily_limit}건 · 운영 설정과 작성 원칙
                </summary>
                <div className="mt-4 grid gap-5 text-sm md:grid-cols-2">
                  <div className="space-y-2 leading-relaxed">
                    <p>
                      실제 축구 뉴스 원문에서 소재를 골라 별도 연습 초안을 만듭니다. 이 공간의
                      초안은 공개 발행되지 않습니다.
                    </p>
                    <p>
                      정확성 → 명료함 → 속도 → 문체 순으로 작성합니다. 원문에 없는 사실을 보태지
                      않고, 보도·주장·의견을 구분합니다.
                    </p>
                    <p className="text-wc-mute">
                      수정 전후와 이유를 다음 작성 때 참고합니다. 모델 자체를 재훈련하는 방식은
                      아닙니다. 이름·금액·날짜의 정정은 해당 사례에만 보관하고, 다음 기사에는 확인
                      원칙만 전달합니다.
                    </p>
                    <p className="text-wc-mute text-xs">
                      전체 기사 검색은 기간 제한 없이 제공하며, 아래 작업 목록에는 최근 데스킹
                      80건을 표시합니다.
                    </p>
                  </div>
                  <div>
                    {data.isAdmin && (
                      <SettingsForm
                        key={data.settings.pending_target + ":" + data.settings.daily_limit}
                        data={data}
                        busy={busy}
                        save={act}
                      />
                    )}
                    <p className="text-wc-mute mt-3 text-xs">
                      마지막 확인 {date(data.settings.last_run_at)} · 다음 보충{" "}
                      {date(data.settings.next_auto_at)} 이후
                    </p>
                    <p className="text-wc-mute mt-1 text-xs">
                      한국 시간 기준 · 실패한 작성도 생성 한도에 포함됩니다. 이미 시작한 작성은
                      일시정지 후에도 마무리됩니다.
                    </p>
                    {data.settings.last_error && (
                      <p className="text-wc-mute mt-2 text-sm">{data.settings.last_error}</p>
                    )}
                  </div>
                </div>
              </details>
            </section>
          </details>
          <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className={box + " min-w-0 p-3"} aria-label="기사 대기함">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">작업 목록</h2>
                <select
                  aria-label="기사 상태 필터"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="border-wc-line bg-wc-paper rounded-md border p-2 text-xs"
                >
                  <option value="pending">대기</option>
                  <option value="reviewed">검수 완료</option>
                  <option value="failed">보류·보관</option>
                  <option value="all">전체</option>
                </select>
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto lg:max-h-[75vh]">
                {!items.length && (
                  <p className="text-wc-mute px-2 py-6 text-sm leading-relaxed">
                    이 목록에 기사가 없습니다. 새 원문이 들어오면 초안을 보충합니다.
                  </p>
                )}
                {items.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => choose(i.id)}
                    aria-pressed={item?.id === i.id}
                    className={
                      "w-full rounded-lg border p-3 text-left transition-colors " +
                      (item?.id === i.id
                        ? "border-wc-burgundy bg-wc-paper"
                        : "hover:bg-wc-paper border-transparent")
                    }
                  >
                    <span className="text-wc-mute mb-2 flex items-center justify-between gap-2 text-xs">
                      <span>{STATUS[i.status]}</span>
                      <span>{date(i.created_at)}</span>
                    </span>
                    <span className="block text-sm leading-relaxed font-medium">
                      {i.draft?.title ?? i.sources[0]?.title ?? "새 기사 작성 중"}
                    </span>
                    <span className="text-wc-mute mt-2 flex items-center gap-1 text-xs">
                      {i.sources[0]?.source_name}
                      <ChevronRight className="size-3" />
                    </span>
                  </button>
                ))}
              </div>
            </aside>
            {item ? (
              <ArticleEditor
                key={item.id}
                item={item}
                data={data}
                dirtyChanged={setDirty}
                next={nextArticles.length ? nextArticle : undefined}
                refresh={async () => {
                  await mutate()
                }}
              />
            ) : (
              <div
                className={
                  box + " flex min-h-80 flex-col items-center justify-center gap-4 p-8 text-center"
                }
              >
                <BookOpen className="text-wc-mute size-8" />
                <h2 className="text-lg font-semibold">실제 작성된 기사를 선택해 주세요</h2>
                <p className={muted}>
                  위 전체 기사 목록에서 제목을 누르면 현재 원고가 열립니다.
                  <br />
                  수정 이유를 함께 적으면 의도를 더 정확히 반영합니다.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
function SettingsForm({
  data,
  busy,
  save,
}: {
  data: DeskResponse
  busy: boolean
  save: (body: unknown) => Promise<void>
}) {
  const [target, setTarget] = useState(data.settings.pending_target)
  const [limit, setLimit] = useState(data.settings.daily_limit)
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void save({
          action: "settings",
          enabled: data.settings.enabled,
          pending_target: target,
          daily_limit: limit,
        })
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <label className="space-y-2 text-xs">
        대기 목표
        <Input
          aria-label="대기 목표"
          type="number"
          min={1}
          max={20}
          required
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          className="mt-2 w-24"
        />
      </label>
      <label className="space-y-2 text-xs">
        하루 생성 한도
        <Input
          aria-label="하루 생성 한도"
          type="number"
          min={1}
          max={48}
          required
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="mt-2 w-28"
        />
      </label>
      <Button variant="outline" size="sm" disabled={busy}>
        설정 저장
      </Button>
    </form>
  )
}

function ArticleEditor({
  item,
  data,
  dirtyChanged,
  refresh,
  next,
}: {
  item: DeskItem
  data: DeskResponse
  dirtyChanged: (v: boolean) => void
  refresh: () => Promise<void>
  next?: () => Promise<void>
}) {
  const [draft, setDraft] = useState(item.draft ?? { title: "", article: "" })
  const [base, setBase] = useState(item.draft)
  const [version, setVersion] = useState(item.version)
  const [reason, setReason] = useState("")
  const [tab, setTab] = useState("edit")
  useEffect(() => {
    if (window.location.hash === "#lessons") setTab("learning")
  }, [])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [compare, setCompare] = useState(false)
  const [lessonEdits, setLessonEdits] = useState<Record<string, boolean>>({})
  const lessonDirtyChanged = useCallback((id: string, value: boolean) => {
    setLessonEdits((previous) => (previous[id] === value ? previous : { ...previous, [id]: value }))
  }, [])
  const hasLessonEdits = Object.values(lessonEdits).some(Boolean)
  const dirty =
    draft.title !== (base?.title ?? "") ||
    draft.article !== (base?.article ?? "") ||
    Boolean(reason)
  useEffect(() => {
    dirtyChanged(dirty || hasLessonEdits || busy)
  }, [dirty, hasLessonEdits, busy, dirtyChanged])
  useEffect(() => {
    if (!dirty && (item.version > version || (!base && item.draft))) {
      setDraft(item.draft ?? { title: "", article: "" })
      setBase(item.draft)
      setVersion(item.version)
    }
  }, [item.version, item.draft, version, base, dirty])
  const revisions = data.revisions.filter((r) => r.item_id === item.id)
  const lessons = data.lessons.filter((l) => revisions.some((r) => r.id === l.revision_id))
  async function save(status: "drafted" | "reviewed" | "rejected", advance = false) {
    setBusy(true)
    setNotice("")
    try {
      const saved = await request({ action: "save", id: item.id, version, draft, reason, status })
      const normalized = { title: draft.title.trim(), article: draft.article.trim() }
      setDraft(normalized)
      setBase(normalized)
      setVersion(saved.version)
      setReason("")
      dirtyChanged(hasLessonEdits)
      setNotice(
        saved.changed
          ? `${saved.applied_to_article ? "기사에 수정을 반영했습니다." : "수정을 저장했습니다."} 교정 사례를 다음 작성의 참고 자료에 추가했습니다. AI 해석은 ‘수정·학습 이력’에서 확인할 수 있습니다.`
          : "검수 상태를 저장했습니다."
      )
      await refresh()
      if (advance && next) await next()
    } catch (e) {
      setNotice(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className={box + " min-w-0 overflow-hidden"} aria-label="기사 편집">
      {item.origin && (
        <div className="border-wc-line bg-wc-paper border-b p-4 text-sm">
          <p className="font-medium">
            {item.origin.status === "deleted"
              ? "삭제된 기사"
              : item.origin.kind === "post"
                ? "발행된 기사"
                : item.origin.status === "rejected"
                  ? "반려 기사"
                  : "저장된 기사"}{" "}
            직접 수정
          </p>
          <p className="text-wc-mute mt-1 text-xs">
            저장하면 실제 제목·본문과 교정 사례가 함께 갱신됩니다. 현재 발행·반려·삭제 상태는
            유지됩니다.
          </p>
          {item.origin.kind === "post" && (
            <Link
              className="mt-2 inline-block underline"
              target="_blank"
              href={"/post/" + item.origin.id}
            >
              현재 발행본 열기
            </Link>
          )}
        </div>
      )}
      <div className="border-wc-line flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="text-wc-mute flex flex-wrap items-center gap-3 text-xs">
          <span className="bg-wc-paper text-wc-ink rounded-full px-3 py-1 font-medium">
            {STATUS[item.status]}
          </span>
          {item.research?.confidence && <span>근거 신뢰도 {item.research.confidence}</span>}
          <span>수정 {version}회</span>
        </div>
        <span className="text-wc-mute text-xs">{dirty ? "저장하지 않은 수정 있음" : "저장됨"}</span>
      </div>
      <div
        className="border-wc-line flex gap-1 border-b px-3"
        role="tablist"
        aria-label="기사 작업 탭"
      >
        {[
          ["edit", "기사 수정"],
          ["evidence", "원문·사실 확인"],
          ["learning", "수정·학습 이력"],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            aria-controls={"desk-panel-" + id}
            id={"desk-tab-" + id}
            onClick={() => setTab(id)}
            className={
              "border-b-2 px-3 py-4 text-sm " +
              (tab === id ? "border-wc-burgundy font-semibold" : "text-wc-mute border-transparent")
            }
          >
            {label}
          </button>
        ))}
      </div>
      {notice && (
        <p
          role="status"
          className="border-wc-line bg-wc-paper border-b p-4 text-sm leading-relaxed"
        >
          {notice}
        </p>
      )}
      {tab === "edit" && (
        <div
          role="tabpanel"
          id="desk-panel-edit"
          aria-labelledby="desk-tab-edit"
          className="space-y-5 p-4 sm:p-6"
        >
          {!item.draft ? (
            <div className="space-y-3 py-8">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                {item.status === "generating" && <Loader2 className="size-5 animate-spin" />}
                {item.status === "generating"
                  ? "원문을 확인하며 작성 중입니다"
                  : "기사 작성을 보류했습니다"}
              </h2>
              <p className={muted}>
                {item.error ??
                  "사실 목록 작성과 원문 대조가 끝나면 초안이 나타납니다. 다른 기사를 보셔도 작성은 계속됩니다."}
              </p>
              <Button variant="outline" onClick={() => setTab("evidence")}>
                확보한 원문 보기
              </Button>
            </div>
          ) : (
            <>
              {item.quality && !item.quality.pass && (
                <details className="border-wc-line bg-wc-paper rounded-lg border p-4" open>
                  <summary className="cursor-pointer text-sm font-medium">
                    초안 검수에서 확인이 필요한 부분 {item.quality.reasons.length}건
                  </summary>
                  <ul className="text-wc-mute mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
                    {item.quality.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                  <p className="text-wc-mute mt-3 text-xs">
                    AI 최초 초안의 검사 결과입니다. 수정 후에도 직접 원문과 대조해 주세요.
                  </p>
                </details>
              )}
              <label className="block space-y-2 text-sm font-medium">
                제목
                <Textarea
                  aria-label="기사 제목"
                  disabled={busy}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  maxLength={300}
                  rows={2}
                  className="resize-none text-lg leading-relaxed font-semibold"
                />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                <span className="flex justify-between">
                  본문
                  <span className="text-wc-mute text-xs font-normal">
                    {draft.article.length.toLocaleString()}자
                  </span>
                </span>
                <Textarea
                  aria-label="기사 본문"
                  disabled={busy}
                  value={draft.article}
                  onChange={(e) => setDraft({ ...draft, article: e.target.value })}
                  maxLength={8000}
                  className="min-h-[420px] resize-y text-base leading-8 font-normal"
                />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                수정 이유 <span className="text-wc-mute font-normal">(선택)</span>
                <Textarea
                  aria-label="수정 이유"
                  disabled={busy}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="예: 협상 단계인데 제목이 영입 확정처럼 보여 고쳤어요. 마지막 문단의 팬 반응은 원문에 없어 삭제했어요."
                  className="font-normal"
                />
              </label>
              <p className="text-wc-mute text-xs leading-relaxed">
                이유는 선택입니다. 직접 고친 원고를 기준으로 AI가 먼저 해석하고, ‘수정·학습
                이력’에서 의도에 맞게 설명을 보완할 수 있습니다.
              </p>
              <div className="flex flex-wrap justify-between gap-3">
                <Button variant="ghost" size="sm" onClick={() => setCompare(!compare)}>
                  {compare
                    ? "비교 원고 접기"
                    : item.origin
                      ? "처음 불러온 원고와 비교"
                      : "최초 AI 초안과 비교"}
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={busy} onClick={() => void save("rejected")}>
                    보관
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => void save("reviewed")}>
                    <Check className="mr-2 size-4" />
                    검수 완료
                  </Button>
                  <Button disabled={busy || !dirty} onClick={() => void save("drafted")}>
                    {busy ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 size-4" />
                    )}
                    수정 저장·기사 반영
                  </Button>
                  {next && (
                    <Button
                      variant="outline"
                      disabled={busy || hasLessonEdits}
                      onClick={() => void save("reviewed", true)}
                    >
                      저장 후 다음 기사
                    </Button>
                  )}
                </div>
              </div>
              {compare && item.original && (
                <div className="border-wc-line bg-wc-paper space-y-4 rounded-lg border p-4">
                  <h3 className="text-sm font-semibold">
                    {item.origin ? "처음 불러온 원고" : "최초 AI 초안"}
                  </h3>
                  <p className="leading-relaxed font-semibold">{item.original.title}</p>
                  <p className="text-sm leading-7 whitespace-pre-wrap">{item.original.article}</p>
                </div>
              )}
              <p className="text-wc-mute text-xs">
                이 기사에 참고한 기존 학습 {item.applied_lesson_ids.length}건 · 상시 원칙{" "}
                {item.applied_rule_ids?.length ?? 0}건 · 검수 완료는 공개 발행을 의미하지 않습니다.
              </p>
              {item.applied_lesson_ids.length > 0 && (
                <details>
                  <summary className="text-wc-mute cursor-pointer text-xs">
                    작성에 반영한 학습 보기
                  </summary>
                  <ul className="mt-3 space-y-2 text-sm">
                    {item.applied_lesson_ids.map((id) => {
                      const lesson = data.lessons.find((l) => l.id === id)
                      return (
                        <li key={id} className="bg-wc-paper rounded-lg p-3">
                          {lesson ? (
                            <>
                              <span className="font-medium">
                                {CATEGORY_LABELS[lesson.category]}
                              </span>{" "}
                              · {lesson.instruction}
                            </>
                          ) : (
                            "이전 학습 항목 " + id.slice(0, 8)
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
      {tab === "evidence" && (
        <div
          role="tabpanel"
          id="desk-panel-evidence"
          aria-labelledby="desk-tab-evidence"
          className="space-y-6 p-4 sm:p-6"
        >
          {!item.sources.length && (
            <p className="text-wc-mute rounded-lg border p-4 text-sm">
              이 기사와 연결된 외부 원문이 저장되어 있지 않습니다. 문장과 기사 구성은 교정할 수
              있으며, 사실 확인에는 별도의 원문 대조가 필요합니다.
            </p>
          )}
          {item.research && (
            <section className="space-y-4">
              <div>
                <h2 className="text-base font-semibold">기사의 핵심</h2>
                <p className="mt-2 text-sm leading-relaxed">
                  {item.research.angle || item.research.rejection_reason}
                </p>
              </div>
              {item.research.verification_gaps.length > 0 && (
                <div className="border-wc-line bg-wc-paper rounded-lg border p-4">
                  <h3 className="text-sm font-semibold">추가 확인이 필요한 정보</h3>
                  <ul className="text-wc-mute mt-2 list-disc space-y-2 pl-5 text-sm">
                    {item.research.verification_gaps.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
              {item.research.conflicts.length > 0 && (
                <p className="text-sm">출처 간 충돌: {item.research.conflicts.join(" / ")}</p>
              )}
              <h3 className="text-base font-semibold">사실·보도·주장·의견</h3>
              {item.research.facts.map((f) => (
                <details key={f.id} className="border-wc-line rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm leading-relaxed">
                    <span className="text-wc-mute mr-2 text-xs font-medium">
                      {f.id} · {KIND[f.kind]}
                    </span>
                    {f.text}
                  </summary>
                  {f.evidence.map((e, i) => (
                    <div key={i} className="bg-wc-paper mt-3 rounded-md p-3">
                      <p className="text-wc-mute mb-2 text-xs">
                        {item.sources.find((s) => s.id === e.source_id)?.source_name ?? "출처"}
                      </p>
                      <blockquote className="text-sm leading-relaxed whitespace-pre-wrap">
                        {e.quote}
                      </blockquote>
                    </div>
                  ))}
                </details>
              ))}
            </section>
          )}
          <section className="space-y-3">
            <h2 className="text-base font-semibold">확보한 원문 {item.sources.length}건</h2>
            <p className="text-wc-mute text-xs leading-relaxed">
              보관된 원문 발췌입니다. 링크에서 현재 원문과 수정 여부를 확인하세요. 배경 기사는 현재
              사건의 독립적인 추가 확인으로 세지 않습니다.
            </p>
            {item.sources.map((s, i) => (
              <details key={s.id} className="border-wc-line rounded-lg border p-4" open={i === 0}>
                <summary className="cursor-pointer text-sm leading-relaxed font-medium">
                  <span className="text-wc-mute mr-2 text-xs">
                    {s.role === "current" ? "현재 소재" : "이전 맥락"} · Tier {s.source_tier}
                  </span>
                  {s.title}
                </summary>
                <div className="mt-4 space-y-4">
                  <a
                    href={s.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-wc-burgundy inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4"
                  >
                    {s.source_name} 원문 열기
                    <ExternalLink className="size-3" />
                  </a>
                  <dl className="bg-wc-paper grid grid-cols-2 gap-3 rounded-md p-3 text-xs">
                    {[
                      ["보도 시각", date(s.published_at)],
                      ["원문 수정 시각", date(s.updated_at)],
                      ["작성자", s.author ?? "미확인"],
                      ["자료 유형", s.primary_or_secondary === "primary" ? "1차 출처" : "2차 보도"],
                      [
                        "자체 취재 여부",
                        s.original_reporting === null
                          ? "미확인"
                          : s.original_reporting
                            ? "1차 자료"
                            : "재인용",
                      ],
                      ["최초 출처 묶음", s.origin_group ?? "미확인 · 독립 검증으로 세지 않음"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-wc-mute">{label}</dt>
                        <dd className="mt-1 break-words">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="max-h-[520px] overflow-y-auto text-sm leading-7 break-words whitespace-pre-wrap">
                    {s.text}
                  </p>
                </div>
              </details>
            ))}
          </section>
        </div>
      )}
      <div
        hidden={tab !== "learning"}
        role="tabpanel"
        id="desk-panel-learning"
        aria-labelledby="desk-tab-learning"
        className="space-y-6 p-4 sm:p-6"
      >
        <div id="lessons" className="scroll-mt-6">
          <h2 className="text-base font-semibold">수정한 부분과 AI가 이해한 이유</h2>
          <p className="text-wc-mute mt-2 text-sm leading-relaxed">
            직접 저장한 교정 사례는 다음 작성의 참고 자료에 바로 추가됩니다. AI가 별도로 해석한
            이유와 상시 기준은 확인 후 사용할 수 있습니다. 의도와 다르면 직접 고쳐 주세요.
          </p>
        </div>
        {!revisions.length && (
          <p className="text-wc-mute py-8 text-sm">
            아직 저장된 수정이 없습니다. 제목이나 본문을 고친 뒤 ‘수정 저장·기사 반영’을 눌러
            주세요.
          </p>
        )}
        {revisions.map((r) => (
          <RevisionCard
            key={r.id}
            revision={r}
            lessons={lessons.filter((l) => l.revision_id === r.id)}
            refresh={refresh}
            dirtyChanged={lessonDirtyChanged}
          />
        ))}
      </div>
    </section>
  )
}
function RevisionCard({
  revision: r,
  lessons,
  refresh,
  dirtyChanged,
}: {
  revision: DeskRevision
  lessons: DeskLesson[]
  refresh: () => Promise<void>
  dirtyChanged: (id: string, value: boolean) => void
}) {
  const [notice, setNotice] = useState("")
  async function retry() {
    try {
      await request({ action: "retry_learning", id: r.id })
      setNotice("학습을 다시 시도합니다.")
      await refresh()
    } catch (e) {
      setNotice(errorText(e))
    }
  }
  return (
    <section className="space-y-3">
      <div className="text-wc-mute flex flex-wrap items-center justify-between gap-2 text-xs">
        <h3 className="text-wc-ink font-medium">수정 {r.version}회차</h3>
        <span>{date(r.created_at)}</span>
      </div>
      {r.editor_reason && (
        <p className="bg-wc-paper rounded-lg p-3 text-sm leading-relaxed">
          편집자 메모: {r.editor_reason}
        </p>
      )}
      {["pending", "processing"].includes(r.learning_state) && (
        <p role="status" className="text-wc-mute text-sm">
          <Loader2 className="mr-2 inline size-4 animate-spin" />
          저장 완료 · 수정 이유를 분석하고 있습니다.
        </p>
      )}
      {r.learning_state === "skipped" && (
        <p className="text-wc-mute text-sm">기사 내용 변경 없이 상태를 저장했습니다.</p>
      )}
      {r.learning_state === "failed" && (
        <div className="text-sm">
          <p>
            {r.learning_error}{" "}
            {r.learning_attempts < 3
              ? "자동으로 재시도합니다."
              : "자동 재시도 3회를 마쳤습니다. 수정 기록은 보관되어 있습니다."}
          </p>
          {r.learning_attempts < 3 && (
            <Button variant="outline" size="sm" onClick={() => void retry()}>
              지금 다시 분석
            </Button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {lessons.map((l) => (
        <LessonCard key={l.id} lesson={l} refresh={refresh} dirtyChanged={dirtyChanged} />
      ))}
      <details className="text-wc-mute text-xs">
        <summary className="cursor-pointer">저장된 수정 전후 전체 보기</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {[
            ["수정 전", r.before_draft],
            ["수정 후", r.after_draft],
          ].map(([label, article]) => {
            const a = article as DeskRevision["before_draft"]
            return (
              <div key={String(label)} className="border-wc-line rounded-lg border p-3">
                <p className="mb-2 font-medium">{String(label)}</p>
                <p className="text-wc-ink mb-3 font-medium">{a.title}</p>
                <p className="leading-6 whitespace-pre-wrap">{a.article}</p>
              </div>
            )
          })}
        </div>
      </details>
    </section>
  )
}
function LessonCard({
  lesson,
  refresh,
  dirtyChanged,
}: {
  lesson: DeskLesson
  refresh: () => Promise<void>
  dirtyChanged: (id: string, value: boolean) => void
}) {
  const [explanation, setExplanation] = useState(lesson.explanation)
  const [instruction, setInstruction] = useState(lesson.instruction)
  const [active, setActive] = useState(lesson.active)
  const [expected, setExpected] = useState(lesson.updated_at)
  const [reviewed, setReviewed] = useState(lesson.review_status !== "pending")
  const [base, setBase] = useState({
    explanation: lesson.explanation,
    instruction: lesson.instruction,
    active: lesson.active,
  })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const dirty =
    explanation !== base.explanation || instruction !== base.instruction || active !== base.active
  useEffect(() => {
    dirtyChanged(lesson.id, dirty)
  }, [dirty, dirtyChanged, lesson.id])
  useEffect(() => {
    if (!busy && !dirty && Date.parse(lesson.updated_at) > Date.parse(expected)) {
      setExplanation(lesson.explanation)
      setInstruction(lesson.instruction)
      setActive(lesson.active)
      setExpected(lesson.updated_at)
      setReviewed(lesson.review_status !== "pending")
      setBase({
        explanation: lesson.explanation,
        instruction: lesson.instruction,
        active: lesson.active,
      })
    }
  }, [busy, dirty, expected, lesson])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault()
        event.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  async function save(use = active) {
    setBusy(true)
    setNotice("")
    try {
      const result = await request({
        action: "lesson",
        id: lesson.id,
        explanation,
        instruction,
        active: use,
        expected,
      })
      setActive(use)
      setReviewed(true)
      setExpected(result.updated_at)
      setBase({ explanation, instruction, active: use })
      setNotice(
        use
          ? "이 해석을 학습에 사용합니다. 다음 기사 작성부터 참고합니다."
          : "이 해석은 학습에 사용하지 않도록 저장했습니다."
      )
      await refresh().catch(() =>
        setNotice("학습 설정은 저장했습니다. 목록 갱신은 다시 시도해 주세요.")
      )
    } catch (e) {
      setNotice(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      className={"border-wc-line space-y-4 rounded-lg border p-4 " + (!active ? "bg-wc-paper" : "")}
    >
      <div className="flex flex-wrap justify-between gap-2 text-xs">
        <span className="font-medium">
          {CATEGORY_LABELS[lesson.category]} · {lesson.field === "title" ? "제목" : "본문"}
        </span>
        <span className="text-wc-mute">
          {!reviewed ? "내 확인을 기다리는 AI 해석" : active ? "학습에 사용 중" : "사용 안 함"}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="bg-wc-paper min-w-0 rounded-md p-3">
          <p className="text-wc-mute mb-2 text-xs">수정 전</p>
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
            <del className="decoration-wc-mute">{lesson.wrong || "(없음)"}</del>
          </p>
        </div>
        <div className="border-wc-line min-w-0 rounded-md border p-3">
          <p className="text-wc-mute mb-2 text-xs">수정 후</p>
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
            <ins className="no-underline">{lesson.correct || "(삭제)"}</ins>
          </p>
        </div>
      </div>
      <label className="block text-xs font-medium">
        수정 이유 · AI 제안, 직접 수정 가능
        <Textarea
          aria-label={CATEGORY_LABELS[lesson.category] + " 수정 이유"}
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          maxLength={2000}
          className="mt-2 min-h-20 text-sm font-normal"
        />
      </label>
      <label className="block text-xs font-medium">
        다음 기사에 적용할 기준 · 직접 수정 가능
        <Textarea
          aria-label={CATEGORY_LABELS[lesson.category] + " 다음 작성 기준"}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          maxLength={1000}
          className="mt-2 min-h-20 text-sm font-normal"
        />
      </label>
      {lesson.scope === "case" && (
        <p className="text-wc-mute text-xs">
          이번 기사의 이름·금액·날짜 자체는 다른 기사에 복사하지 않고, 확인할 기준만 참고합니다.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {reviewed ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="accent-wc-burgundy size-4"
            />
            이 학습 사용
          </label>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || !explanation.trim() || instruction.trim().length < 5}
            onClick={() => void save(false)}
          >
            이 해석 사용 안 함
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={
            busy || !explanation.trim() || instruction.trim().length < 5 || (reviewed && !dirty)
          }
          onClick={() => void save(reviewed ? active : true)}
        >
          {reviewed ? "학습 설정 저장" : "이 해석으로 학습"}
        </Button>
      </div>
      {notice && (
        <p role="status" className="text-xs">
          {notice}
        </p>
      )}
    </div>
  )
}
