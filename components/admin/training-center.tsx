"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FilePenLine,
  FlaskConical,
  Loader2,
  Plus,
  SlidersHorizontal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CATEGORY_LABELS, type DeskArticle, type DeskSource } from "@/lib/news/desk/types"
import type {
  EditorialRule,
  EvaluationReview,
  TrainingJob,
  TrainingSettings,
} from "@/lib/news/training/types"

type Category = keyof typeof CATEGORY_LABELS
type Lesson = {
  id: string
  category: Category
  explanation: string
  instruction: string
  priority: number
  active: boolean
  review_status?: "pending" | "reviewed" | "legacy"
  updated_at: string
}
interface TrainingData {
  settings: TrainingSettings & { effective_enabled: boolean }
  rules: EditorialRule[]
  lessons: Lesson[]
  items: { id: string; draft: DeskArticle; status: string; needs_research?: boolean }[]
  jobs: TrainingJob[]
  aggSources: { id: string; source_title: string; category: string | null }[]
  aggHistory: {
    id: string
    source_title: string
    ai_title: string
    ai_body: string
    fix_title: string | null
    fix_body: string | null
    reject_reason: string | null
    status: string
  }[]
  summary: { count: number; baselineClean: number; learnedClean: number; improved: number }
  correctionIds: string[]
  modelReady: boolean
}
type Send = (body: unknown) => Promise<boolean>
const API = "/api/admin/news-training"
async function request(body?: unknown): Promise<TrainingData> {
  const res = await fetch(API, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  })
  const data = await res.json()
  if (!res.ok) throw Error(data.error || "요청을 처리하지 못했습니다.")
  return data
}
const box = "bg-card space-y-4 rounded-xl border p-5"
const selectClass = "border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
const tabs = {
  guide: "작업실",
  rules: "편집 원칙",
  evaluation: "비교 평가",
  publishing: "발행 설정",
  community: "커뮤니티 연습",
}
type Tab = keyof typeof tabs

export function TrainingCenter({ communityOnly = false }: { communityOnly?: boolean }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(communityOnly ? "community" : "guide")
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false)
  useEffect(() => {
    if (communityOnly) return
    const read = () => {
      const value = window.location.hash.slice(1)
      if (value in tabs) setTab(value as Tab)
    }
    read()
    window.addEventListener("hashchange", read)
    return () => window.removeEventListener("hashchange", read)
  }, [communityOnly])
  function navigate(next: Tab) {
    setTab(next)
    if (!communityOnly) window.history.replaceState(null, "", `#${next}`)
  }
  const { data, error, isLoading, mutate } = useSWR<TrainingData>(API, () => request(), {
    refreshInterval: 10000,
    revalidateOnFocus: false,
  })
  const send: Send = async (body) => {
    if (busy) return false
    setBusy(true)
    setNotice("")
    setFailed(false)
    try {
      await request(body)
      const action = (body as { action?: string }).action
      setNotice(
        action === "evaluate" || action === "generate_agg" || action === "retry"
          ? "작성을 시작했습니다. 결과는 아래 실행 목록에 자동으로 나타납니다."
          : action === "review"
            ? "비교 평가를 저장했습니다. 남은 오류는 기사 데스킹에서 교정하거나 편집 원칙으로 추가하세요."
            : "저장했습니다. 이후 생성하는 글부터 적용됩니다."
      )
      await mutate().catch(() =>
        setNotice("요청은 반영됐습니다. 현황 갱신에 실패했으니 현황 새로고침으로 확인하세요.")
      )
      return true
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "요청을 처리하지 못했습니다.")
      setFailed(true)
      return false
    } finally {
      setBusy(false)
    }
  }
  const running = data?.jobs.some((j) => j.status === "queued" || j.status === "running") ?? false
  return (
    <div className="space-y-5">
      {!communityOnly && (
        <div className="bg-background/95 sticky top-0 z-20 space-y-3 border-b pt-2 pb-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href="/admin/news-review/desk">
                  <FilePenLine className="mr-1.5 size-4" />
                  올라온 기사 데스킹
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/news-dictionary">
                  <BookOpen className="mr-1.5 size-4" />
                  이름·표기 사전
                </Link>
              </Button>
            </div>
            <span className="text-muted-foreground text-xs">
              저장한 기준은 다음 글부터 적용됩니다
            </span>
          </div>
          <nav aria-label="학습 관리 항목" className="flex gap-1 overflow-x-auto">
            {Object.entries(tabs).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={tab === key ? "secondary" : "ghost"}
                className={`shrink-0 ${key === "publishing" ? "ml-auto" : ""}`}
                aria-pressed={tab === key}
                onClick={() => navigate(key as Tab)}
              >
                {label}
              </Button>
            ))}
          </nav>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <p className="text-muted-foreground flex items-center gap-2">
          {running ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              AI 작성 진행 중 · 10초마다 갱신
            </>
          ) : (
            "학습 현황은 10초마다 갱신됩니다"
          )}
        </p>
        <div className="flex items-center gap-3">
          {data &&
            (communityOnly ? (
              <Link
                href="/admin/news-training#publishing"
                className="rounded-full border px-2.5 py-1"
              >
                실제 자동발행 {data.settings.effective_enabled ? "켜짐" : "꺼짐"} →
              </Link>
            ) : (
              <button
                onClick={() => navigate("publishing")}
                className="rounded-full border px-2.5 py-1"
              >
                실제 자동발행 {data.settings.effective_enabled ? "켜짐" : "꺼짐"}
              </button>
            ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void mutate()
              if (communityOnly) router.refresh()
            }}
          >
            현황 새로고침
          </Button>
        </div>
      </div>
      {notice && (
        <p
          role={failed ? "alert" : "status"}
          className={`rounded-lg border p-3 text-sm leading-6 ${failed ? "border-destructive/40 bg-destructive/5" : "bg-muted/40"}`}
        >
          {notice}
          {failed && (
            <span className="text-muted-foreground mt-1 block text-xs">
              입력은 유지됩니다. 다른 창에서 변경된 경우 내용을 복사해 둔 뒤 새로고침하세요.
            </span>
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md border p-4 text-sm">
          {error.message}
        </p>
      )}
      {isLoading && <p role="status">학습 현황을 불러오는 중…</p>}
      {data && !data.modelReady && (
        <p role="status" className="rounded-lg border p-4 text-sm">
          AI 작성 연결이 준비되지 않아 새 초안 생성은 대기 중입니다. 사전 추가와 기존 교정·편집 원칙
          정리는 계속할 수 있습니다.
        </p>
      )}
      {data && (
        <>
          {!communityOnly && (
            <div hidden={tab !== "guide"}>
              <Guide data={data} navigate={navigate} />
            </div>
          )}
          <div hidden={tab !== "rules"}>
            <Rules data={data} send={send} busy={busy} />
          </div>
          <div hidden={tab !== "publishing"}>
            <Publishing settings={data.settings} send={send} busy={busy} />
          </div>
          <div hidden={tab !== "evaluation"} className="space-y-5">
            <div className={box}>
              <h2 className="text-lg font-semibold">같은 원문으로 학습 적용 비교</h2>
              <p className="text-muted-foreground text-sm">
                기본 작성 원칙·사전·사실 목록은 동일하게 유지합니다. 왼쪽은 추가 학습 없이, 오른쪽은
                현재 편집 원칙과 교정 사례를 적용해 새로 작성합니다. 결과는 비공개 연습으로
                저장됩니다. 원문 사실 확인이 아직 없는 기사는 먼저 사실을 정리한 뒤, 같은 근거로 두
                초안을 만듭니다.
              </p>
              <JobLauncher
                kind="evaluation"
                data={data}
                send={send}
                disabled={busy || running || !data.modelReady}
              />
              {!data.modelReady && <p className="text-sm">AI 작성 연결을 사용할 수 없습니다.</p>}
              <p className="text-muted-foreground text-xs">
                한 번의 비교에 기사 작성과 자동 검사가 각각 2회 실행됩니다. 생성의 변동이 있으므로
                여러 소재를 비교하세요. 교정했던 소재는 연습 확인용이며 새로운 소재에서도 별도로
                평가해야 합니다.
              </p>
            </div>
            <div className={box}>
              <h2 className="font-semibold">직접 평가한 결과</h2>
              {data.summary.count ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="평가 완료" value={`${data.summary.count}건`} />
                  <Metric
                    label="오류 없음 · 기본 → 학습 적용"
                    value={`${data.summary.baselineClean} → ${data.summary.learnedClean}건`}
                  />
                  <Metric label="학습 적용 초안 선호" value={`${data.summary.improved}건`} />
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  아래 비교 결과를 직접 평가하면 집계합니다. 자동 검사 통과를 사람의 검수 완료로
                  계산하지 않습니다.
                </p>
              )}
              <p className="text-muted-foreground text-xs">
                최근 실행 30건 중 직접 평가한 비교만 집계합니다.
              </p>
            </div>
            <Jobs
              jobs={data.jobs.filter((j) => j.kind === "news_evaluation")}
              send={send}
              busy={busy}
              running={running}
            />
          </div>
          <div hidden={tab !== "community"} className="space-y-5">
            <div className={box}>
              <h2 className="text-lg font-semibold">커뮤니티 글 연습 생성</h2>
              <p className="text-muted-foreground text-sm">
                수집된 소재로 비공개 초안 1건을 만듭니다. 교정·반려를 저장하면 최근 교정 8건과 반려
                8건을 다음 생성에서 참고합니다.
              </p>
              <JobLauncher
                kind="community"
                data={data}
                send={send}
                disabled={busy || running || !data.modelReady}
              />
              <p className="text-muted-foreground text-xs">
                같은 소재를 다시 선택해 교정 전후를 비교할 수 있습니다. AI가 소재를 반려하면 이유가
                실행 결과에 표시됩니다.
              </p>
              <Link
                className="inline-block text-sm underline"
                href="/admin/agg-training"
                onClick={() => router.refresh()}
              >
                생성된 연습 검수하기
              </Link>
            </div>
            <Jobs
              jobs={data.jobs.filter((j) => j.kind === "agg_generation")}
              send={send}
              busy={busy}
              running={running}
            />
            <details className={box}>
              <summary className="cursor-pointer font-semibold">
                커뮤니티 교정·반려 이력{" "}
                <span className="text-muted-foreground text-sm">{data.aggHistory.length}건</span>
              </summary>
              {data.aggHistory.length === 0 && (
                <p className="text-muted-foreground text-sm">저장된 검수 이력이 없습니다.</p>
              )}
              {data.aggHistory.map((r) => (
                <details key={r.id} className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm">
                    {r.ai_title} ·{" "}
                    {r.status === "corrected" ? "교정" : r.status === "rejected" ? "반려" : "통과"}{" "}
                    ·{" "}
                    {data.correctionIds.includes(r.id)
                      ? "다음 생성 참고 대상"
                      : r.status === "passed"
                        ? "평가 기록"
                        : "보관된 사례"}
                  </summary>
                  <div className="mt-3 space-y-3 text-sm">
                    <p className="text-muted-foreground">소재: {r.source_title}</p>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2 rounded-lg border p-4">
                        <h3 className="font-semibold">처음 작성한 글</h3>
                        <p className="font-medium">{r.ai_title}</p>
                        <p className="leading-7 whitespace-pre-wrap">{r.ai_body}</p>
                      </div>
                      {r.fix_title && (
                        <div className="bg-primary/5 space-y-2 rounded-lg border p-4">
                          <h3 className="font-semibold">내가 교정한 글</h3>
                          <p className="font-medium">{r.fix_title}</p>
                          <p className="leading-7 whitespace-pre-wrap">{r.fix_body}</p>
                        </div>
                      )}
                    </div>
                    {r.reject_reason && <p>반려 이유: {r.reject_reason}</p>}
                  </div>
                </details>
              ))}
            </details>
          </div>
        </>
      )}
    </div>
  )
}
function Guide({ data, navigate }: { data: TrainingData; navigate: (tab: Tab) => void }) {
  const awaiting = data.jobs.filter(
    (j) => j.kind === "news_evaluation" && j.status === "completed" && !j.review
  ).length
  const activeRules = data.rules.filter((r) => r.active).length
  const activeLessons = data.lessons.filter((r) => r.active).length
  const pendingLessons = data.lessons.filter((r) => r.review_status === "pending").length
  return (
    <div className="space-y-5">
      <section className="bg-card overflow-hidden rounded-2xl border">
        <div className="bg-primary/5 space-y-3 border-b p-5 sm:p-7">
          <p className="text-primary text-xs font-semibold tracking-wide">
            내 데스킹으로 가르치는 작업실
          </p>
          <h2 className="text-xl font-semibold sm:text-2xl">
            기사를 직접 고치면, AI가 교정 이유를 정리합니다.
          </h2>
          <p className="text-muted-foreground max-w-2xl text-sm leading-6">
            올라온 기사를 골라 평소 데스킹하듯 제목과 본문을 고치세요. AI가 수정 전후를 비교해 왜
            바꿨는지 설명합니다. 그 설명을 확인하고 보완하면서 내 편집 기준을 쌓아갑니다.
          </p>
        </div>
        <div className="grid divide-y md:grid-cols-[1.4fr_1fr] md:divide-x md:divide-y-0">
          <Link
            href="/admin/news-review/desk"
            className="bg-primary/5 hover:bg-primary/10 group space-y-4 p-5 transition-colors sm:p-7"
          >
            <FilePenLine className="text-primary size-6" />
            <div>
              <h3 className="text-lg font-semibold">올라온 기사 데스킹</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                기사를 고르고, 직접 고치고, AI의 설명을 확인합니다.
                <br className="hidden sm:block" /> 수정 이유는 필요할 때만 덧붙이면 됩니다.
              </p>
            </div>
            <span className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium">
              기사 선택하고 데스킹{" "}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
          <Link
            href="/admin/news-dictionary"
            className="hover:bg-muted/40 group space-y-4 p-5 transition-colors sm:p-7"
          >
            <BookOpen className="text-muted-foreground size-5" />
            <div>
              <h3 className="font-semibold">데스킹 중 이름이 틀렸다면</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                선수·팀의 표기와 별칭을 사전에도 남기세요.
                <br className="hidden sm:block" /> 첫 등장과 이후 이름도 지정할 수 있습니다.
              </p>
            </div>
            <span className="text-primary inline-flex items-center gap-2 text-sm font-medium">
              이름·표기 정리{" "}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        </div>
      </section>
      {pendingLessons > 0 && (
        <div className="bg-primary/5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <div>
            <p className="text-sm font-semibold">
              AI가 정리한 교정 이유 {pendingLessons}건을 확인해 주세요.
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              조회된 학습 이력 중 확인 대기 · 내 의도와 맞는지 읽고 보완하세요.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/admin/news-review/desk#lessons">AI 설명 확인하기</Link>
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="항상 참고하는 편집 원칙" value={`${activeRules} / 20개`} />
        <Metric label="조회된 활성 교정 사례" value={`${activeLessons}건 · 최대 12건 참고`} />
        <Metric label="내 비교 평가를 기다리는 결과" value={`${awaiting}건`} />
      </div>
      {awaiting > 0 && (
        <div className="bg-primary/5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <p className="flex items-center gap-2 text-sm">
            <FlaskConical className="text-primary size-4" />
            <strong>비교 초안 {awaiting}건이 준비됐습니다.</strong> 개선됐는지 확인해 주세요.
          </p>
          <Button size="sm" onClick={() => navigate("evaluation")}>
            결과 평가하기
          </Button>
        </div>
      )}
      <section className={box}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="text-primary size-5" />
          <h2 className="font-semibold">한 기사씩, 이 흐름만 반복하세요</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              n: "01",
              title: "올라온 기사 선택",
              detail:
                "데스킹 화면에서 고칠 기사를 고릅니다. 제목과 본문을 읽고 원문에서 사실과 맥락을 확인하세요.",
              link: "/admin/news-review/desk",
              label: "기사 고르기",
            },
            {
              n: "02",
              title: "평소처럼 직접 수정",
              detail:
                "제목과 본문을 직접 고치고 저장합니다. 수정 이유는 선택 입력입니다. 꼭 알려주고 싶은 의도만 짧게 덧붙이세요.",
              link: "/admin/news-review/desk",
              label: "데스킹 열기",
            },
            {
              n: "03",
              title: "AI의 교정 이유 확인",
              detail:
                "AI가 수정 전후를 읽고 설명한 이유가 내 의도와 맞는지 확인합니다. 잘못 짚은 설명은 직접 고쳐주세요.",
              link: "/admin/news-review/desk#lessons",
              label: "AI 설명 확인",
            },
            {
              n: "04",
              title: "다음 기사에서 확인",
              detail:
                "저장한 교정은 이후 작성에 참고됩니다. 새 글을 다시 데스킹하고, 필요할 때 비교 평가로 개선을 확인하세요.",
              tab: "evaluation" as Tab,
              label: "비교 평가",
            },
          ].map((step) => (
            <div key={step.n} className="bg-muted/30 flex flex-col rounded-xl border p-4">
              <span className="text-primary mb-3 text-xs font-semibold">{step.n}</span>
              <h3 className="text-sm font-semibold">{step.title}</h3>
              <p className="text-muted-foreground my-3 flex-1 text-xs leading-6">{step.detail}</p>
              {step.link ? (
                <Link className="text-sm font-medium hover:underline" href={step.link}>
                  {step.label} →
                </Link>
              ) : (
                <button
                  className="text-left text-sm font-medium hover:underline"
                  onClick={() => navigate(step.tab!)}
                >
                  {step.label} →
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
      <div className="grid items-start gap-5 lg:grid-cols-[1.3fr_1fr]">
        <section className={box}>
          <h2 className="font-semibold">설명은 AI가 먼저, 판단은 내가</h2>
          <p className="text-muted-foreground text-sm">
            먼저 기사를 고치세요. AI가 내 수정을 제대로 이해했는지 읽고, 의도가 다르면 설명을
            보완합니다.
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="bg-muted rounded-md px-3 py-2">
              내 수정: ‘이적 확정’ → ‘이적 협상 중’
            </span>
          </div>
          <blockquote className="bg-muted/40 border-primary rounded-r-lg border-l-2 p-4 text-sm leading-7">
            <span className="text-muted-foreground mb-1 block text-xs">AI 교정 이유 예시</span>
            “협상 단계의 보도를 확정된 사실로 단정하지 않도록 수정했습니다. 이후 기사에서도
            협상·합의·공식 발표를 구분해야 합니다.”
          </blockquote>
          <p className="text-muted-foreground text-xs leading-6">
            설명이 내 의도와 다르면 그 이유를 고치면 됩니다. 여러 기사에 계속 적용할 기준은 편집
            원칙으로 따로 정리할 수 있습니다.
          </p>
        </section>
        <section className={box}>
          <h2 className="flex items-center gap-2 font-semibold">
            <SlidersHorizontal className="size-4" />
            데스킹을 돕는 도구
          </h2>
          <div className="divide-y text-sm">
            <button className="flex w-full justify-between py-3" onClick={() => navigate("rules")}>
              반복할 기준·교정 우선순위 <span>→</span>
            </button>
            <Link href="/admin/team-squads" className="flex justify-between py-3">
              선수단 이름 확정·기사 사전 동기화 <span>→</span>
            </Link>
            <Link href="/admin/team-dictionary" className="flex justify-between py-3">
              팀 이름·alias·경기 매핑 <span>→</span>
            </Link>
            <Link href="/admin/news-review" className="flex justify-between py-3">
              발행 전 뉴스·막힌 표기 후보 <span>→</span>
            </Link>
            <button
              className="flex w-full justify-between py-3"
              onClick={() => navigate("publishing")}
            >
              실제 자동발행·실행 한도{" "}
              <span>{data.settings.effective_enabled ? "켜짐" : "꺼짐"} →</span>
            </button>
            <Link href="/admin/agg-training" className="flex justify-between py-3">
              커뮤니티 글 학습 <span>→</span>
            </Link>
          </div>
        </section>
      </div>
      <p className="text-muted-foreground text-xs leading-6">
        저장한 교정과 편집 기준은 이후 작성에 참고됩니다. 다음 기사에서 같은 오류가 반복되면 다시
        고치고 AI의 설명을 보완하세요.
      </p>
    </div>
  )
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  )
}

function JobLauncher({
  kind,
  data,
  send,
  disabled,
}: {
  kind: "evaluation" | "community"
  data: TrainingData
  send: Send
  disabled: boolean
}) {
  const [selected, setSelected] = useState("")
  const needsResearch =
    kind === "evaluation" && data.items.some((i) => i.id === selected && i.needs_research)
  const options =
    kind === "evaluation"
      ? data.items.map((i) => ({
          id: i.id,
          title: `${i.status === "reviewed" ? "[데스킹 완료]" : "[데스킹 전]"} ${i.draft.title}`,
        }))
      : data.aggSources.map((s) => ({ id: s.id, title: s.source_title }))
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          className={selectClass}
          aria-label={kind === "evaluation" ? "비교할 기사" : "연습 소재"}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">
            {options.length ? "소재를 선택해 주세요" : "사용할 소재가 없습니다"}
          </option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
        <Button
          className="shrink-0"
          disabled={disabled || !options.some((o) => o.id === selected)}
          onClick={() =>
            void send(
              kind === "evaluation"
                ? { action: "evaluate", item_id: selected }
                : { action: "generate_agg", source_id: selected }
            )
          }
        >
          {kind === "evaluation" ? "비교 초안 생성" : "연습 1건 생성"}
        </Button>
      </div>
      {needsResearch && (
        <p className="text-muted-foreground text-xs">
          원문에서 사실을 먼저 확인한 뒤 같은 근거로 두 초안을 비교합니다.
        </p>
      )}
      {!options.length && (
        <p className="text-muted-foreground text-sm">
          {kind === "evaluation" ? (
            <Link className="underline" href="/admin/news-review/desk">
              데스킹에서 연습 기사부터 생성하세요 →
            </Link>
          ) : (
            "수집된 본문 소재가 들어오면 여기에서 선택할 수 있습니다."
          )}
        </p>
      )}
    </div>
  )
}
function Rules({ data, send, busy }: { data: TrainingData; send: Send; busy: boolean }) {
  const [editing, setEditing] = useState<EditorialRule | "new" | null>(null)
  const [search, setSearch] = useState("")
  const applied = data.lessons.filter((l) => l.active).slice(0, 12)
  const archived = data.lessons.filter((l) => !applied.some((a) => a.id === l.id))
  const matches = data.rules.filter((r) =>
    `${r.title} ${r.instruction}`.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div className="space-y-5">
      <div className={box}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">매번 적용할 편집 원칙</h2>
          <Button disabled={Boolean(editing)} onClick={() => setEditing("new")}>
            <Plus className="mr-1 size-4" />
            원칙 추가
          </Button>
        </div>
        <p className="text-muted-foreground text-sm leading-6">
          여러 기사에서 반복되는 기준을 여기에 모으세요. 활성 원칙{" "}
          <strong>{data.rules.filter((r) => r.active).length}/20개</strong>를 매번 참고합니다. 높은
          우선순위부터 적용하며, 잠시 쓰지 않을 원칙은 수정 화면에서 비활성화할 수 있습니다.
        </p>
        {editing && (
          <RuleForm
            key={editing === "new" ? "new" : editing.id + editing.version}
            rule={editing === "new" ? undefined : editing}
            busy={busy}
            send={send}
            close={() => setEditing(null)}
          />
        )}
        {data.rules.length > 0 && (
          <Input
            aria-label="편집 원칙 검색"
            placeholder="원칙 이름·내용 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        {matches.map((r) => (
          <div
            key={r.id}
            className={`flex items-start justify-between gap-4 rounded-lg border p-4 ${r.active ? "" : "bg-muted/40 text-muted-foreground"}`}
          >
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap gap-2 text-xs">
                <span className="bg-muted rounded px-2 py-0.5">{CATEGORY_LABELS[r.category]}</span>
                <span>
                  {r.active ? "사용 중" : "비활성"} · 우선순위 {r.priority}
                </span>
              </div>
              <p className="text-sm font-semibold">{r.title}</p>
              <p className="mt-2 text-sm leading-6 whitespace-pre-wrap">{r.instruction}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(editing)}
              onClick={() => setEditing(r)}
            >
              수정
            </Button>
          </div>
        ))}
        {!data.rules.length && (
          <div className="bg-muted/30 space-y-2 rounded-lg p-6 text-center">
            <p className="text-sm font-medium">첫 원칙은 자주 고치는 것부터</p>
            <p className="text-muted-foreground text-sm">
              ‘원칙 추가’에서 이적 보도·출처·문장 예시로 시작할 수 있습니다.
            </p>
          </div>
        )}
        {data.rules.length > 0 && !matches.length && (
          <p className="text-muted-foreground text-sm">검색어와 일치하는 원칙이 없습니다.</p>
        )}
      </div>
      <div className={box}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">다음 작성에 참고할 교정 사례</h2>
          <Link href="/admin/news-review/desk#lessons" className="text-sm underline">
            학습 설명·활성 여부 수정 →
          </Link>
        </div>
        <p className="text-muted-foreground text-sm leading-6">
          활성 사례 중 우선순위가 높은 순으로 최대 12건을 참고합니다. 같은 우선순위에서는 최근에
          수정한 사례가 먼저입니다. 오래 유지할 기준은 위의 편집 원칙에도 정리하세요.
        </p>
        {applied.map((l) => (
          <LessonPriority key={l.id} lesson={l} send={send} busy={busy} />
        ))}
        {!applied.length && (
          <p className="bg-muted/30 rounded-lg p-4 text-sm">
            데스킹에서 ‘수정 저장·학습’을 진행하면 교정 사례가 여기에 쌓입니다.
          </p>
        )}
        {archived.length > 0 && (
          <details className="space-y-3 rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              나머지 교정 사례 {archived.length}건 · 우선순위 조정
            </summary>
            {archived.map((l) => (
              <LessonPriority key={l.id} lesson={l} send={send} busy={busy} />
            ))}
          </details>
        )}
      </div>
    </div>
  )
}
function RuleForm({
  rule,
  send,
  busy,
  close,
}: {
  rule?: EditorialRule
  send: Send
  busy: boolean
  close: () => void
}) {
  const [draft, setDraft] = useState(
    rule ?? {
      title: "",
      instruction: "",
      category: "style" as Category,
      priority: 50,
      active: true,
      version: 0,
    }
  )
  return (
    <form
      className="bg-muted space-y-3 rounded-lg p-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await send({ action: "rule", rule: draft })) close()
      }}
    >
      {!rule && !draft.title && !draft.instruction && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">예시를 선택한 뒤 내 기준에 맞게 고치세요.</p>
          <div className="flex flex-wrap gap-2">
            {[
              {
                title: "이적 보도 수준 구분",
                category: "certainty" as Category,
                instruction:
                  "관심·협상·합의·공식 발표를 제목과 본문에서 구분한다. 협상 중인 사안을 이적 확정으로 표현하지 않는다.",
              },
              {
                title: "보도와 주장에 출처 표시",
                category: "attribution" as Category,
                instruction:
                  "매체의 보도, 당사자의 주장, 기자의 의견을 구분하고 문장에 출처를 명시한다. 원문에서 확인할 수 없는 단정은 추가하지 않는다.",
              },
              {
                title: "핵심 사실부터 간결하게",
                category: "structure" as Category,
                instruction:
                  "첫 문단에는 가장 중요한 새 사실과 관련 인물을 쓴다. 배경 설명은 뒤로 옮기고 같은 내용을 반복하는 문장을 줄인다.",
              },
            ].map((preset) => (
              <Button
                type="button"
                size="sm"
                variant="outline"
                key={preset.title}
                onClick={() => setDraft({ ...draft, ...preset })}
              >
                {preset.title}
              </Button>
            ))}
          </div>
        </div>
      )}
      <label className="block text-sm">
        원칙 이름
        <Input
          required
          minLength={2}
          maxLength={100}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        적용할 기준
        <Textarea
          required
          minLength={5}
          maxLength={1000}
          rows={4}
          placeholder="어떤 상황에서 어떻게 작성할지 구체적으로 적으세요."
          value={draft.instruction}
          onChange={(e) => setDraft({ ...draft, instruction: e.target.value })}
        />
        <span className="text-muted-foreground mt-1 block text-xs">
          {draft.instruction.length}/1,000자 · 한 원칙에 한 가지 판단 기준
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          분류
          <select
            className={selectClass}
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })}
          >
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          우선순위
          <Input
            type="number"
            min={0}
            max={100}
            value={draft.priority}
            onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.active}
          onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
        />
        이 원칙 사용
      </label>
      <div className="flex gap-2">
        <Button disabled={busy} type="submit">
          {busy ? "저장 중…" : "원칙 저장"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={close}>
          작성 취소
        </Button>
      </div>
    </form>
  )
}
function LessonPriority({ lesson, send, busy }: { lesson: Lesson; send: Send; busy: boolean }) {
  const [priority, setPriority] = useState(lesson.priority)
  const [expected, setExpected] = useState(lesson.updated_at)
  useEffect(() => {
    if (priority === lesson.priority) setExpected(lesson.updated_at)
  }, [priority, lesson.priority, lesson.updated_at])
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs">
          {CATEGORY_LABELS[lesson.category]} · {lesson.active ? "활성" : "비활성"}
        </p>
        <p className="mt-1 text-sm leading-6">{lesson.explanation}</p>
      </div>
      <label className="text-xs">
        우선순위
        <Input
          className="w-20"
          type="number"
          min={0}
          max={100}
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
        />
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || priority === lesson.priority}
        onClick={() => void send({ action: "lesson_priority", id: lesson.id, priority, expected })}
      >
        저장
      </Button>
    </div>
  )
}
function Publishing({
  settings,
  send,
  busy,
}: {
  settings: TrainingData["settings"]
  send: Send
  busy: boolean
}) {
  const [mode, setMode] = useState(
    settings.publish_enabled === null ? "inherit" : settings.publish_enabled ? "on" : "off"
  )
  const [cap, setCap] = useState(settings.per_run_cap),
    [limit, setLimit] = useState(settings.daily_job_limit)
  const [version, setVersion] = useState(settings.version),
    [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (dirty) return
    setMode(settings.publish_enabled === null ? "inherit" : settings.publish_enabled ? "on" : "off")
    setCap(settings.per_run_cap)
    setLimit(settings.daily_job_limit)
    setVersion(settings.version)
  }, [settings, dirty])
  return (
    <form
      className={`${box} max-w-3xl`}
      onSubmit={async (e) => {
        e.preventDefault()
        if (
          await send({
            action: "settings",
            version,
            publish_enabled: mode === "inherit" ? null : mode === "on",
            per_run_cap: cap,
            daily_job_limit: limit,
          })
        )
          setDirty(false)
      }}
    >
      <h2 className="text-lg font-semibold">실제 뉴스 자동발행</h2>
      <div className="bg-muted/40 space-y-2 rounded-lg border p-4">
        <p className="text-sm">
          현재 상태:{" "}
          <strong>{settings.effective_enabled ? "자동발행 켜짐" : "자동발행 꺼짐"}</strong>
        </p>
        <p className="text-muted-foreground text-sm leading-6">
          켜짐으로 저장하면 다음 자동 실행부터 품질 검사를 통과한 기사가 실제 게시판에 발행됩니다.
          정지 전에 발행을 시작한 기사는 완료될 수 있습니다.
        </p>
      </div>
      {dirty && version !== settings.version && (
        <p role="alert" className="border-destructive/40 rounded-lg border p-3 text-sm">
          다른 창에서 설정이 변경됐습니다. 입력을 보존했습니다.{" "}
          <button type="button" className="underline" onClick={() => setDirty(false)}>
            현재 서버 설정으로 다시 불러오기
          </button>
        </p>
      )}
      <label className="block text-sm">
        발행 설정
        <select
          className={`${selectClass} mt-2`}
          value={mode}
          onChange={(e) => {
            setMode(e.target.value)
            setDirty(true)
          }}
        >
          <option value="inherit">기존 서버 설정 따르기</option>
          <option value="off">자동발행 끄기</option>
          <option value="on">자동발행 켜기</option>
        </select>
      </label>
      <label className="block text-sm">
        자동 실행 한 번에 발행할 최대 기사 수
        <Input
          className="mt-2 max-w-40"
          type="number"
          required
          min={1}
          max={10}
          value={cap}
          onChange={(e) => {
            setCap(Number(e.target.value))
            setDirty(true)
          }}
        />
      </label>
      <div className="space-y-3 border-t pt-4">
        <h3 className="font-semibold">비공개 연습 한도</h3>
        <label className="block text-sm">
          하루 연습·비교 평가 실행 한도
          <Input
            className="mt-2 max-w-40"
            type="number"
            required
            min={1}
            max={48}
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value))
              setDirty(true)
            }}
          />
          <span className="text-muted-foreground mt-2 block text-xs leading-6">
            한국 시간 기준. 커뮤니티 연습 생성과 기사 비교 평가의 합계이며 실패한 실행도 포함합니다.
          </span>
        </label>
        <Link className="text-sm underline" href="/admin/news-review/desk">
          데스킹 자동 보충·하루 한도는 데스킹에서 설정 →
        </Link>
      </div>
      <Button disabled={busy || !dirty || version !== settings.version} type="submit">
        {busy ? "저장 중…" : "자동발행·실행 한도 저장"}
      </Button>
      <p className="text-muted-foreground text-xs">품질 검사와 원문 확인은 계속 적용됩니다.</p>
    </form>
  )
}
function Jobs({
  jobs,
  send,
  busy,
  running,
}: {
  jobs: TrainingJob[]
  send: Send
  busy: boolean
  running: boolean
}) {
  const [more, setMore] = useState(false)
  if (!jobs.length)
    return (
      <div className="bg-muted/30 rounded-xl border border-dashed p-8 text-center">
        <FlaskConical className="text-muted-foreground mx-auto mb-3 size-6" />
        <p className="text-sm font-medium">아직 실행한 작업이 없습니다</p>
        <p className="text-muted-foreground mt-2 text-sm">
          위에서 소재를 고르면 진행 상태와 결과가 여기에 나타납니다.
        </p>
      </div>
    )
  const statuses = {
    queued: "시작 대기",
    running: "작성·검사 중",
    completed: "완료",
    failed: "실패",
  }
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">실행 결과</h2>
      {jobs.map((job, index) => (
        <section hidden={!more && index >= 3} key={job.id} className={box}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-muted-foreground text-xs font-medium">
              {new Date(job.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}{" "}
              <span className="bg-muted text-foreground ml-2 rounded-full px-2 py-1">
                {statuses[job.status]}
              </span>
            </h3>
            {job.status === "failed" && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || running}
                onClick={() => void send({ action: "retry", id: job.id })}
              >
                다시 실행
              </Button>
            )}
          </div>
          {job.error && (
            <p role="alert" className="text-sm">
              {job.error}
            </p>
          )}
          {job.status === "running" || job.status === "queued" ? (
            <p className="text-muted-foreground text-sm">
              화면을 닫아도 작업은 계속됩니다. 결과는 자동으로 갱신됩니다.
            </p>
          ) : null}
          {job.status === "completed" && job.kind === "agg_generation" && (
            <p className="text-sm">
              {job.result?.rejected
                ? `소재 반려: ${String(job.result.reason)}`
                : `연습 생성 완료: ${String(job.result?.title ?? "")}`}{" "}
              · 참고한 교정{" "}
              {Array.isArray(job.result?.applied_ids) ? job.result.applied_ids.length : 0}건
            </p>
          )}
          {job.status === "completed" && job.kind === "news_evaluation" && (
            <Evaluation
              key={job.id}
              job={job}
              send={send}
              busy={busy}
              initiallyOpen={index === 0 && !job.review}
            />
          )}
        </section>
      ))}
      {jobs.length > 3 && (
        <Button variant="outline" onClick={() => setMore(!more)}>
          {more ? "최근 3건만 보기" : `이전 실행 ${jobs.length - 3}건 더 보기`}
        </Button>
      )}
    </div>
  )
}
function Evaluation({
  job,
  send,
  busy,
  initiallyOpen,
}: {
  job: TrainingJob
  send: Send
  busy: boolean
  initiallyOpen: boolean
}) {
  const result = job.result as {
    baseline: DeskArticle
    learned: DeskArticle
    baseline_quality: { pass: boolean; reasons: string[] }
    learned_quality: { pass: boolean; reasons: string[] }
    rules: EditorialRule[]
    lessons: { id: string; instruction: string }[]
  }
  const [review, setReview] = useState<EvaluationReview>(
    job.review ?? { baseline_errors: [], learned_errors: [], preference: "tie", note: "" }
  )
  const [version, setVersion] = useState(job.review_version)
  const [checked, setChecked] = useState({
    baseline: Boolean(job.review),
    learned: Boolean(job.review),
  })
  const [open, setOpen] = useState(initiallyOpen)
  const sources = (job.payload.sources ?? []) as DeskSource[]
  function toggle(field: "baseline_errors" | "learned_errors", category: Category) {
    setReview((r) => ({
      ...r,
      [field]: r[field].includes(category)
        ? r[field].filter((c) => c !== category)
        : [...r[field], category],
    }))
  }
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-sm leading-6 font-medium">
        {result.learned.title}{" "}
        <span className="text-muted-foreground ml-2 text-xs">
          {job.review ? "직접 평가 완료" : "평가 대기 · 비교 열기"}
        </span>
      </summary>
      <div className="mt-4 space-y-5">
        <p className="bg-muted/40 rounded-lg p-3 text-xs leading-6">
          두 초안 모두 같은 원문·사전·사실 목록으로 새로 작성했습니다. 오른쪽에는 저장한 편집 원칙과
          교정 사례를 추가했습니다. 원문 대조 → 양쪽 오류 선택 → 더 나은 초안 평가 순으로
          진행하세요.
        </p>
        <details>
          <summary className="cursor-pointer text-sm">원문·적용한 기준 확인</summary>
          <div className="mt-3 space-y-4">
            {sources.map((s) => (
              <div key={s.id}>
                <a
                  className="text-sm underline"
                  href={s.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {s.title}
                </a>
                <p className="text-muted-foreground text-xs">
                  {s.source_name} · {s.role === "current" ? "현재 소재" : "배경 자료"}
                </p>
                <p className="mt-2 max-h-72 overflow-auto text-sm whitespace-pre-wrap">{s.text}</p>
              </div>
            ))}
            <p className="text-sm">
              상시 원칙 {result.rules.length}건 · 교정 사례 {result.lessons.length}건
            </p>
            {[...result.rules, ...result.lessons].map((r) => (
              <p key={r.id} className="text-xs">
                {r.instruction}
              </p>
            ))}
          </div>
        </details>
        <div className="grid gap-5 lg:grid-cols-2">
          {(["baseline", "learned"] as const).map((side) => {
            const quality = result[`${side}_quality`]
            const field = side === "baseline" ? "baseline_errors" : "learned_errors"
            return (
              <section
                key={side}
                aria-label={side === "baseline" ? "기본 초안" : "학습 적용 초안"}
                className="min-w-0 overflow-hidden rounded-xl border"
              >
                <div
                  className={`border-b p-4 ${side === "learned" ? "bg-primary/5" : "bg-muted/40"}`}
                >
                  <h4 className="font-semibold">
                    {side === "baseline" ? "기본 작성" : "학습 적용"}
                  </h4>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {side === "baseline"
                      ? "추가 편집 원칙·교정 사례 없이"
                      : `편집 원칙 ${result.rules.length}개 · 교정 사례 ${result.lessons.length}개 참고`}
                  </p>
                </div>
                <div className="space-y-4 p-4">
                  <div className="max-h-[36rem] space-y-4 overflow-auto pr-1">
                    <p className="text-lg leading-7 font-semibold">{result[side].title}</p>
                    <p className="text-sm leading-7 whitespace-pre-wrap">{result[side].article}</p>
                  </div>
                  <details className="bg-muted/40 rounded-md p-3 text-xs">
                    <summary className="cursor-pointer">
                      자동 검사 {quality.pass ? "통과" : "확인 필요"} · 결과 보기
                    </summary>
                    <div className="mt-2 space-y-2">
                      {quality.reasons.map((r) => (
                        <p key={r}>{r}</p>
                      ))}
                      {!quality.reasons.length && <p>추가 지적 사항 없음</p>}
                    </div>
                  </details>
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium">직접 확인한 오류</legend>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                        <label
                          key={k}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-2 text-xs ${review[field].includes(k as Category) ? "border-destructive/40 bg-destructive/5" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={review[field].includes(k as Category)}
                            onChange={() => toggle(field, k as Category)}
                          />
                          {v}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="flex items-start gap-2 border-t pt-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked[side]}
                      onChange={(e) => setChecked({ ...checked, [side]: e.target.checked })}
                    />
                    <span>
                      {side === "baseline" ? "기본 초안 확인 완료" : "학습 적용 초안 확인 완료"}
                      <span className="text-muted-foreground mt-1 block text-xs">
                        오류가 없으면 위 오류 항목은 비워두세요.
                      </span>
                    </span>
                  </label>
                </div>
              </section>
            )
          })}
        </div>
        <div className="bg-muted/30 space-y-4 rounded-xl border p-4">
          <label className="block text-sm font-medium">
            더 나은 초안
            <select
              className={`${selectClass} mt-2`}
              value={review.preference}
              onChange={(e) =>
                setReview({
                  ...review,
                  preference: e.target.value as EvaluationReview["preference"],
                })
              }
            >
              <option value="tie">차이 없음</option>
              <option value="learned">학습 적용</option>
              <option value="baseline">기본 작성</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            평가 이유
            <Textarea
              className="mt-2"
              rows={3}
              maxLength={2000}
              placeholder="어떤 오류가 줄었고, 무엇을 더 가르쳐야 하나요?"
              value={review.note}
              onChange={(e) => setReview({ ...review, note: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">
              두 초안의 확인을 완료하면 평가를 저장할 수 있습니다.
            </p>
            <Button
              disabled={busy || !checked.baseline || !checked.learned}
              onClick={async () => {
                if (await send({ action: "review", id: job.id, version, review }))
                  setVersion((v) => v + 1)
              }}
            >
              비교 평가 저장
            </Button>
          </div>
        </div>
      </div>
    </details>
  )
}
