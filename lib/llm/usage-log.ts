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
export function logUsage(task: string, model: string, payload: unknown, ok = true): void {
  void record(task, model, payload, ok, 0)
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
    }
  } catch {
    /* 네트워크 실패도 아래에서 ok=false 로 남긴다 */
  }
  void record(task, model, payload, ok, Date.now() - startedAt)
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
  payload: unknown,
  ok: boolean,
  latencyMs: number
): Promise<void> {
  try {
    const usage = readUsage(payload)
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
      })
  } catch {
    /* 계기판이 본 파이프라인을 막으면 안 된다 */
  }
}
