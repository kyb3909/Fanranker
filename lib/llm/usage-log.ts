import "server-only"

/**
 * OpenAI 사용량 계기판 (2026-08-25).
 *
 * ## 왜 필요한가
 * 호출부가 **22곳**인데 사용량을 남기는 곳은 뉴스 데스크 하나뿐이었다. 운영자가
 * "오늘 OpenAI 를 얼마나 썼나" 물었을 때 답을 못 했다 — 기록이 없으니까.
 * 어제 겪은 LFA 크레딧 화재와 **똑같은 구조**다: 계기판이 없으면 새는 걸 모른다.
 * `lfa_usage_log` 를 만들고 나서야 "하루 21,000건"을 발견했던 그 교훈이다.
 *
 * ## 왜 fetch 를 감싸나
 * 사용량(`usage`)은 **응답**에 있다. `chatParams` 는 요청 본문만 만들므로 응답을 못 본다.
 * 그래서 호출 자체를 여기로 모은다 — 한 곳을 지나면 전부 기록된다.
 *
 * ⚠️ 기록 실패가 **본 작업을 막으면 안 된다**. 전부 fail-open 이다 (LFA 계기판과 같은 규율).
 * ⚠️ OpenAI 의 `cached_tokens` 는 `prompt_tokens` 의 **부분집합**이다 — 따로 더하면
 *    이중 계상된다 (assignment-desk 의 estimateAssignmentCostUsd 주석과 같은 함정).
 */

/** 2026-08-09 확인 (OpenAI 공식 요율표). assignment-desk.ts 와 같은 표 — 한쪽 고치면 양쪽. */
const RATES_USD_PER_MTOK: Record<string, { input: number; cached: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, cached: 0.075, output: 0.6 },
  "gpt-4.1-mini": { input: 0.4, cached: 0.1, output: 1.6 },
  "gpt-4.1": { input: 2.0, cached: 0.5, output: 8.0 },
  "gpt-4o": { input: 2.5, cached: 1.25, output: 10 },
  "gpt-5.6-terra": { input: 2.0, cached: 0.2, output: 12 },
  "gpt-5.1": { input: 1.25, cached: 0.125, output: 10 },
  // 2026-08-30 확인. 4o/4.1 항목은 지우지 않는다 — 과거 usage 행이 그 키로 남아 있다.
  "gpt-5.6-luna": { input: 0.2, cached: 0.02, output: 1.2 },
}

export interface LlmUsage {
  inputTokens: number | null
  cachedTokens: number | null
  outputTokens: number | null
}

/** 응답 payload 에서 usage 를 꺼낸다 — 모양이 다르면 전부 null (기록만 비고 계산은 건너뛴다) */
export function readUsage(payload: unknown): LlmUsage {
  const u = (payload as { usage?: Record<string, unknown> } | null)?.usage
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
  const details = u?.prompt_tokens_details as { cached_tokens?: unknown } | undefined
  return {
    inputTokens: num(u?.prompt_tokens),
    cachedTokens: num(details?.cached_tokens),
    outputTokens: num(u?.completion_tokens),
  }
}

/** 요율표 기준 추정 비용. 표에 없는 모델이면 null (0 이 아니다 — 모른다는 뜻). */
export function estimateCostUsd(model: string, usage: LlmUsage): number | null {
  const rate = RATES_USD_PER_MTOK[model]
  if (!rate) return null
  const input = usage.inputTokens ?? 0
  const output = usage.outputTokens ?? 0
  // cached 는 input 의 부분집합 — min 으로 자르고 input 에서 빼야 이중 계상이 안 된다
  const cached = Math.min(usage.cachedTokens ?? 0, input)
  const cost = ((input - cached) * rate.input + cached * rate.cached + output * rate.output) / 1e6
  return Number(cost.toFixed(6))
}

/**
 * **최소 침습 기록** — 이미 파싱한 응답 payload 만 넘기면 된다.
 *
 * 호출부 22곳은 각자 fetch 방식(타임아웃·에러 처리·재시도)이 조금씩 다르다. 전부
 * `openaiChat` 으로 갈아엎으면 diff 가 커지고 그만큼 회귀 위험도 커진다. 그래서
 * **기록만 얹는** 이 함수를 기본 경로로 둔다 — 호출부는 한 줄만 추가하면 된다:
 *
 * ```ts
 * const data = await res.json()
 * logUsage("naming-verify", "gpt-4o-mini", data)   // ← 이 한 줄
 * ```
 *
 * ⚠️ await 하지 않는다. 기록이 느리다고 본 작업이 기다릴 이유가 없다.
 */
export function logUsage(task: string, model: string, payload: unknown, latencyMs = 0): void {
  void record(task, model, readUsage(payload), true, latencyMs)
}

/**
 * 토큰 수를 **이미 뽑아둔** 호출부용 (2026-09-02).
 *
 * 뉴스 데스크(`app/api/cron/news-assignment-desk/route.ts`)가 그렇다. 자체 표로 이미
 * 상세히 기록하고 있어서 응답 원본이 그 자리까지 안 온다. 그런데 통합 계기판은
 * `llm_usage_log` 만 읽으므로 **데스크 비용이 대시보드에서 통째로 빠져 있었다** —
 * 운영자가 보는 "오늘 $X" 가 실제보다 적었다.
 *
 * 판정·프롬프트 같은 상세는 데스크 표가 정본이고, 여기는 비용 원장이다. 역할이 갈린다.
 */
export function logUsageTokens(task: string, model: string, usage: LlmUsage, latencyMs = 0): void {
  void record(task, model, usage, true, latencyMs)
}

/**
 * **실패 기록** (2026-09-02 추가).
 *
 * 종전엔 `logUsage` 의 네 번째 인자 `ok = true` 가 이 자리를 맡는 척했지만, **false 를
 * 넘기는 호출부가 하나도 없었다**(전수 확인). 실패는 어디에도 안 남았고, `ok` 컬럼은
 * 쓰기만 하고 읽는 곳도 없었다. 그래서 계기판이 이런 상태였다:
 *
 *   "오늘 뉴스가 한 건도 안 올라왔다" → 로그의 호출 수는 정상 → 원인 못 찾음
 *
 * 이 파이프라인 상당수가 fail-closed 다. 400 하나가 "에러 없이 발행 정지"가 되는데,
 * 계기판이 실패를 안 세면 그 정지가 **정상 조용함과 구분이 안 된다.**
 *
 * `reason` 은 짧은 키로 통일한다 — `http_400` · `timeout` · `network` · `parse`.
 * 자유 문장을 넣으면 집계(api_cost_summary 의 failReasons)가 흩어져 못 읽는다.
 *
 * ⚠️ 실패 행은 토큰이 없으므로 추정 비용이 0 이다 — 비용 합계를 흔들지 않는다.
 *    다만 `callsToday` 에는 잡히므로, 뷰가 성공/실패를 나눠 보여준다
 *    (`supabase/migrations/20260902_llm_usage_failures.sql`).
 */
export function logUsageFailure(task: string, model: string, reason: string, latencyMs = 0): void {
  void record(
    task,
    model,
    { inputTokens: null, cachedTokens: null, outputTokens: null },
    false,
    latencyMs,
    reason
  )
}

/**
 * OpenAI chat/completions 호출 + 사용량 기록.
 *
 * 호출부는 이것만 쓰면 된다 — 응답 JSON 을 그대로 돌려주므로 기존 파싱 코드는 그대로다.
 * 실패(네트워크·비 200)는 `null` 을 돌려주고, 그 사실도 `ok=false` 로 남긴다.
 *
 * @param task 어느 작업이 썼는지 (집계 축). 짧은 kebab-case 로 통일할 것.
 */
export async function openaiChat(
  task: string,
  body: Record<string, unknown>,
  init?: { signal?: AbortSignal }
): Promise<unknown | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  const model = String(body.model ?? "unknown")
  const startedAt = Date.now()
  let payload: unknown = null
  let ok = false
  let reason: string | undefined
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: init?.signal,
    })
    if (res.ok) {
      payload = await res.json()
      ok = true
    } else {
      reason = `http_${res.status}`
    }
  } catch (e) {
    // AbortSignal.timeout 은 AbortError 로 온다 — 네트워크 단절과 구분해서 남긴다
    reason = e instanceof Error && e.name === "AbortError" ? "timeout" : "network"
  }
  void record(task, model, readUsage(payload), ok, Date.now() - startedAt, reason)
  return ok ? payload : null
}

/**
 * ⚠️ fail-open — 기록 실패가 본 작업을 막으면 안 된다. await 하지 않고 흘려보낸다.
 *
 * ⚠️ DB 클라이언트를 **여기서** 가져온다 (최상위 import 아님). 이유:
 *    `lib/supabase/server` → `lib/env` 는 **import 되는 순간** 환경변수를 검증하고
 *    없으면 throw 한다. 이 파일을 최상위에서 끌어오는 모듈은 그래서 vitest 에서
 *    파일조차 못 열렸다 — 검사 55개가 실패도 통과도 아닌 채로 건너뛰어졌다
 *    (2026-08-26 발견, `43ab0d7a` 이후 하루간).
 *
 *    이 파일이 내보내는 것 중 DB 가 필요한 건 이 함수 하나뿐이다. `readUsage` ·
 *    `estimateCostUsd` 는 순수 계산인데 파일을 여는 것만으로 DB·환경변수를
 *    요구할 이유가 없다. 모듈 캐시가 있어 두 번째 호출부터는 비용이 없다.
 */
async function record(
  task: string,
  model: string,
  usage: LlmUsage,
  ok: boolean,
  latencyMs: number,
  failReason?: string
): Promise<void> {
  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    await createServiceRoleClient()
      .from("llm_usage_log")
      .insert({
        task,
        model,
        input_tokens: usage.inputTokens,
        cached_tokens: usage.cachedTokens,
        output_tokens: usage.outputTokens,
        estimated_cost_usd: estimateCostUsd(model, usage),
        ok,
        latency_ms: latencyMs,
        fail_reason: failReason ?? null,
      })
  } catch {
    /* 계기판이 본 파이프라인을 막으면 안 된다 */
  }
}
