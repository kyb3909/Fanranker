import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { extractTextFromTipTapJSON } from "@/lib/tiptap/extract-text"
import {
  ASSIGNMENT_MODEL,
  ASSIGNMENT_PROMPT_VERSION,
  assignmentContentHash,
  classifyAssignmentFailure,
  estimateAssignmentCostUsd,
  preAssign,
  requestAssignment,
  type AssignmentInput,
  type AssignmentVerdict,
} from "@/lib/news/assignment-desk"
import { newsCandidateRunId } from "@/lib/news/candidate-ledger"
import type { TipTapNode } from "@/types/post"

export const maxDuration = 120
export const dynamic = "force-dynamic"

/**
 * 어사인먼트 데스크 cron — **shadow 전용**.
 *
 * 이 라우트는 발행 파이프라인을 대체하지 않는다. news_reservoir 와 news_candidates 를
 * 읽기만 하고 절대 쓰지 않으며(원장 상태 전이도 기록하지 않는다), 판정 결과는
 * news_assignments 에만 append 한다. 켜는 유일한 이유는 "새 배정이 기존 관심도
 * 필터·실제 발행 결과와 얼마나 다른가"를 실데이터로 재는 것이다.
 *
 * 켜기: Vercel env `NEWS_ASSIGNMENT_DESK=shadow` (기본값 없음 = 완전 정지).
 *   · 값이 없거나 'shadow' 가 아니면 LLM 을 한 번도 부르지 않고 즉시 끝난다.
 *   · 'on' 같은 다른 값도 동작하지 않는다 — 실집행 전환은 shadow 데이터 검증 뒤
 *     별도 커밋으로만 열린다(이 파일에 실집행 코드는 없다).
 *
 * 멱등: (candidate_id, content_hash, prompt_version) 이 종착(ok/dead_letter)이면
 * 다시 호출하지 않는다. 부분 유니크 인덱스로 DB 도 같은 계약을 강제한다.
 */

/** 회당 판정 상한 — 정상 유입(≈130/일)이면 시간당 6건이라 여유가 크다 */
const BATCH = 20
/** 후보 조회 창 (시간) */
const DEFAULT_LOOKBACK_HOURS = 24
/** maxDuration 120s 안에서 안전하게 멈출 시점 — 넘으면 남은 건 다음 회차로 미룬다 */
const TIME_BUDGET_MS = 90_000

interface AssignmentRowInsert {
  candidate_id: string
  run_id: string
  content_hash: string
  prompt_version: string
  attempt: number
  outcome: string
  status: string
  desk: string | null
  priority: number | null
  risk: string | null
  format: string | null
  required_checks: string[]
  deadline_minutes: number | null
  reason_codes: string[]
  model: string
  latency_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  cached_tokens: number | null
  estimated_cost_usd: number | null
  error: string | null
  details: Record<string, unknown>
}

function verdictRow(
  base: { candidateId: string; runId: string; contentHash: string; attempt: number },
  verdict: AssignmentVerdict,
  metrics: {
    latencyMs: number | null
    inputTokens?: number | null
    outputTokens?: number | null
    cachedTokens?: number | null
    details?: Record<string, unknown>
  }
): AssignmentRowInsert {
  return {
    candidate_id: base.candidateId,
    run_id: base.runId,
    content_hash: base.contentHash,
    prompt_version: verdict.prompt_version,
    attempt: base.attempt,
    outcome: verdict.decision,
    status: "ok",
    desk: verdict.desk,
    priority: verdict.priority,
    risk: verdict.risk,
    format: verdict.format,
    required_checks: verdict.required_checks,
    deadline_minutes: verdict.deadline_minutes,
    reason_codes: verdict.reason_codes,
    model: verdict.model,
    latency_ms: metrics.latencyMs,
    input_tokens: metrics.inputTokens ?? null,
    output_tokens: metrics.outputTokens ?? null,
    cached_tokens: metrics.cachedTokens ?? null,
    estimated_cost_usd: estimateAssignmentCostUsd(verdict.model, {
      inputTokens: metrics.inputTokens ?? null,
      outputTokens: metrics.outputTokens ?? null,
      cachedTokens: metrics.cachedTokens ?? null,
    }),
    error: null,
    details: metrics.details ?? {},
  }
}

async function run(request: NextRequest) {
  const denied = verifyCronSecret(request)
  if (denied) return denied

  const mode = process.env.NEWS_ASSIGNMENT_DESK
  if (mode !== "shadow") {
    return NextResponse.json({
      ok: true,
      skipped: `어사인먼트 데스크 정지 (env NEWS_ASSIGNMENT_DESK=shadow 필요, 현재: ${mode ?? "미설정"})`,
    })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // 설정 누락은 조용히 넘기지 않는다 — 판정 0건이 "볼 게 없었다"로 오인된다.
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY 없음" }, { status: 500 })
  }

  const supabase = createServiceRoleClient()
  const runId = newsCandidateRunId("news-assignment-desk")
  const dry = request.nextUrl.searchParams.get("dry") === "1"
  const requestedHours = Number(request.nextUrl.searchParams.get("hours") ?? DEFAULT_LOOKBACK_HOURS)
  const hours = Number.isFinite(requestedHours)
    ? Math.min(72, Math.max(1, Math.round(requestedHours)))
    : DEFAULT_LOOKBACK_HOURS
  const since = new Date(Date.now() - hours * 3_600_000).toISOString()

  // 대상은 원장에 잡힌 후보다. reservoir 를 직접 훑지 않는 이유: shadow 는 Phase 1
  // 원장 위에서 돌아야 후보 단위 비교가 성립하고, FK 도 그 전제로 걸려 있다.
  const { data: candidates, error: candidateError } = await supabase
    .from("news_candidates")
    .select("candidate_id, state")
    .gte("first_seen_at", since)
    .order("first_seen_at", { ascending: false })
    .limit(BATCH * 5)
  if (candidateError) {
    return NextResponse.json({ ok: false, error: candidateError.message }, { status: 500 })
  }
  const candidateIds = (candidates ?? []).map((row) => row.candidate_id as string)
  if (candidateIds.length === 0) {
    return NextResponse.json({ ok: true, dry, considered: 0, assessed: 0 })
  }

  const [{ data: reservoir, error: reservoirError }, { data: priorRows, error: priorError }] =
    await Promise.all([
      supabase.from("news_reservoir").select("id, draft, urls").in("id", candidateIds),
      supabase
        .from("news_assignments")
        .select("candidate_id, content_hash, status")
        .eq("prompt_version", ASSIGNMENT_PROMPT_VERSION)
        .in("candidate_id", candidateIds),
    ])
  if (reservoirError || priorError) {
    return NextResponse.json(
      { ok: false, error: reservoirError?.message ?? priorError?.message },
      { status: 500 }
    )
  }

  // (후보, 내용) 별로 종착 여부와 재시도 횟수를 미리 접어둔다.
  const settledKeys = new Set<string>()
  const attempts = new Map<string, number>()
  for (const row of (priorRows ?? []) as {
    candidate_id: string
    content_hash: string
    status: string
  }[]) {
    const key = `${row.candidate_id}:${row.content_hash}`
    if (row.status === "ok" || row.status === "dead_letter") settledKeys.add(key)
    else attempts.set(key, (attempts.get(key) ?? 0) + 1)
  }

  const draftById = new Map(
    ((reservoir ?? []) as { id: string; draft: unknown; urls: unknown }[]).map((row) => [
      row.id,
      row,
    ])
  )

  // 중복 판정 재료 — 이번 회차에서 이미 본 제목. 이미 판정이 끝난 후보의 제목으로
  // 씨를 뿌려야 회차가 갈려도 같은 소식을 중복으로 잡는다. 다만 조회 창(candidateIds)
  // 밖의 후보는 여기 안 들어오므로 창을 넘는 중복은 여전히 못 잡는다 — 알려진 한계다.
  const seenTitles: string[] = []
  const started = Date.now()
  const rows: AssignmentRowInsert[] = []
  const skipCounts: Record<string, number> = {}
  const noteSkip = (reason: string) => {
    skipCounts[reason] = (skipCounts[reason] ?? 0) + 1
  }
  let deferred = 0

  for (const candidateId of candidateIds) {
    if (rows.length >= BATCH) {
      deferred++
      continue
    }
    if (Date.now() - started > TIME_BUDGET_MS) {
      // 조용히 자르지 않는다 — 몇 건을 다음 회차로 미뤘는지 응답에 남긴다.
      deferred++
      continue
    }

    const source = draftById.get(candidateId)
    if (!source) {
      noteSkip("reservoir_row_missing")
      continue
    }
    const draft = source.draft as { title?: string; content?: unknown } | null
    const title = draft?.title?.trim()
    if (!title) {
      noteSkip("no_title")
      continue
    }
    const body = extractTextFromTipTapJSON(draft?.content as TipTapNode)
    const input: AssignmentInput = {
      candidateId,
      title,
      body,
      sourceUrl: (source.urls as { source?: string | null } | null)?.source ?? null,
    }
    const contentHash = assignmentContentHash(input)
    const key = `${candidateId}:${contentHash}`
    if (settledKeys.has(key)) {
      // 판정이 끝난 후보라도 제목은 중복 재료로 남긴다 — 안 그러면 이미 다룬 소식의
      // 재탕이 매 회차 새 후보로 보인다.
      seenTitles.push(title)
      noteSkip("already_assessed")
      continue
    }
    const attempt = (attempts.get(key) ?? 0) + 1

    // 규칙으로 답이 정해진 후보는 LLM 을 부르지 않는다 (비용 + 정책 일관성)
    const ruled = preAssign(input, seenTitles)
    seenTitles.push(title)
    if (ruled) {
      rows.push(verdictRow({ candidateId, runId, contentHash, attempt }, ruled, { latencyMs: 0 }))
      continue
    }

    const result = await requestAssignment(input, { apiKey })
    if (result.ok) {
      rows.push(
        verdictRow({ candidateId, runId, contentHash, attempt }, result.verdict, {
          latencyMs: result.latencyMs,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cachedTokens: result.usage.cachedTokens,
          details:
            result.dropped.checks.length > 0 || result.dropped.reasonCodes.length > 0
              ? { dropped: result.dropped }
              : {},
        })
      )
      continue
    }

    const status = classifyAssignmentFailure({
      kind: result.kind,
      httpStatus: result.httpStatus,
      attempt,
    })
    rows.push({
      candidate_id: candidateId,
      run_id: runId,
      content_hash: contentHash,
      prompt_version: ASSIGNMENT_PROMPT_VERSION,
      attempt,
      outcome: result.outcome,
      status,
      desk: null,
      priority: null,
      risk: null,
      format: null,
      required_checks: [],
      deadline_minutes: null,
      reason_codes: [],
      model: ASSIGNMENT_MODEL,
      latency_ms: result.latencyMs,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      cached_tokens: result.usage.cachedTokens,
      estimated_cost_usd: estimateAssignmentCostUsd(ASSIGNMENT_MODEL, result.usage),
      error: result.error,
      details: {
        kind: result.kind,
        ...(result.httpStatus ? { http: result.httpStatus } : {}),
        // 계약 위반이면 모델 원문을 남긴다 — 안 남기면 다음 프롬프트 수정이 또 추측이 된다
        ...(result.raw ? { raw: result.raw } : {}),
      },
    })
  }

  const summary = {
    ok: true,
    dry,
    mode,
    promptVersion: ASSIGNMENT_PROMPT_VERSION,
    considered: candidateIds.length,
    assessed: rows.length,
    llmCalls: rows.filter((r) => !r.model.startsWith("rule:")).length,
    ruleCalls: rows.filter((r) => r.model.startsWith("rule:")).length,
    settled: rows.filter((r) => r.status === "ok").length,
    retryWait: rows.filter((r) => r.status === "retry_wait").length,
    deadLetter: rows.filter((r) => r.status === "dead_letter").length,
    estimatedCostUsd: Number(
      rows.reduce((sum, r) => sum + (r.estimated_cost_usd ?? 0), 0).toFixed(6)
    ),
    ...(deferred > 0 ? { deferred } : {}),
    ...(Object.keys(skipCounts).length > 0 ? { skipCounts } : {}),
  }

  if (dry || rows.length === 0) {
    return NextResponse.json({ ...summary, persisted: 0 })
  }

  const { error: insertError } = await supabase.from("news_assignments").insert(rows)
  if (!insertError) {
    return NextResponse.json({ ...summary, persisted: rows.length })
  }

  // 배치 하나가 통째로 날아가는 게 최악이다 (동시 실행이 유니크 인덱스에 걸리면
  // 나머지 판정도 같이 사라진다). 행별로 다시 넣고 충돌만 따로 센다.
  let persisted = 0
  let conflicts = 0
  const rowErrors: string[] = []
  for (const row of rows) {
    const { error } = await supabase.from("news_assignments").insert(row)
    if (!error) {
      persisted++
      continue
    }
    if (error.code === "23505") conflicts++
    else rowErrors.push(`${row.candidate_id}: ${error.message}`)
  }
  console.error("[news-assignment-desk] 배치 적재 실패 — 행별 재시도", {
    batchError: insertError.message,
    persisted,
    conflicts,
    rowErrors: rowErrors.slice(0, 10),
  })
  return NextResponse.json(
    {
      ...summary,
      ok: rowErrors.length === 0,
      persisted,
      conflicts,
      ...(rowErrors.length > 0 ? { errors: rowErrors.slice(0, 10) } : {}),
    },
    { status: rowErrors.length > 0 ? 500 : 200 }
  )
}

export async function GET(request: NextRequest) {
  return withCronLog("news-assignment-desk", run)(request)
}
export async function POST(request: NextRequest) {
  return run(request)
}
