// data/crawlers/core/openai-client.js
//
// Shared OpenAI client + retry wrapper. Exists here (not in data/agents/) so that
// Node's module resolution from data/agents/scripts/* can walk through
// this file's parent directory and find data/crawlers/node_modules/openai.
// Same pattern as core/db.js.
//
// ## 사용량 계측 (2026-09-02)
// 이 패키지는 본체 앱의 `lib/llm/usage-log.ts` 를 import 할 수 없다(별도 package.json,
// server-only, 다른 런타임). 그래서 같은 표(`llm_usage_log`)에 **직접** 넣는다.
// 본체 계기판(/admin/system)이 그 표만 읽으므로, 여기서 안 넣으면 크롤러·에이전트 비용은
// 대시보드에서 통째로 사라진다 — 2026-09-02 감사 전까지 실제로 그랬다.
//
// ⚠️ 요율표는 `lib/llm/usage-log.ts` 의 **복사본**이다(세 번째 사본 — assignment-desk 에도
//    하나 있다). 새 모델을 쓰면 세 곳을 같이 고칠 것. 표에 없는 모델은 비용 null 로 남긴다
//    (0 이 아니다 — "모른다"는 뜻이고, 그래야 집계에서 티가 난다).

import OpenAI from 'openai'

let client = null

/** 지연 생성 — import 시점에 키를 요구하지 않는다 (dry-run 등 키 없는 경로를 살린다) */
function getClient() {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY')
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return client
}

/** 2026-08-30 확인. lib/llm/usage-log.ts RATES_USD_PER_MTOK 와 같은 값 — 한쪽 고치면 양쪽. */
const RATES_USD_PER_MTOK = {
  'gpt-4.1-mini': { input: 0.4, cached: 0.1, output: 1.6 },
  'gpt-4.1': { input: 2.0, cached: 0.5, output: 8.0 },
  'gpt-5.1': { input: 1.25, cached: 0.125, output: 10 },
  'gpt-5.6-terra': { input: 2.0, cached: 0.2, output: 12 },
  'gpt-5.6-luna': { input: 0.2, cached: 0.02, output: 1.2 },
}

function estimateCostUsd(model, usage) {
  const rate = RATES_USD_PER_MTOK[model]
  if (!rate) return null
  const input = usage.input_tokens ?? 0
  const output = usage.output_tokens ?? 0
  // cached 는 input 의 부분집합 — 잘라서 빼야 이중 계상이 안 된다
  const cached = Math.min(usage.cached_tokens ?? 0, input)
  return Number(
    (((input - cached) * rate.input + cached * rate.cached + output * rate.output) / 1e6).toFixed(6)
  )
}

/**
 * ⚠️ fail-open. 기록 실패가 크롤을 막으면 안 된다 — 티커가 멈추는 쪽이 훨씬 비싸다.
 * ⚠️ `db.js` 는 env 가 없으면 import 시점에 process.exit 한다. 그건 catch 가 안 되므로
 *    import 전에 env 를 먼저 본다 — 없으면 기록만 조용히 건너뛴다.
 */
async function recordUsage(task, model, response, ok, latencyMs, failReason) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return
    const { default: supabase } = await import('./db.js')
    const u = response?.usage ?? {}
    const usage = {
      input_tokens: Number.isFinite(u.prompt_tokens) ? u.prompt_tokens : null,
      cached_tokens: Number.isFinite(u.prompt_tokens_details?.cached_tokens)
        ? u.prompt_tokens_details.cached_tokens
        : null,
      output_tokens: Number.isFinite(u.completion_tokens) ? u.completion_tokens : null,
    }
    await supabase.from('llm_usage_log').insert({
      task,
      model,
      ...usage,
      estimated_cost_usd: ok ? estimateCostUsd(model, usage) : 0,
      ok,
      latency_ms: latencyMs,
      fail_reason: failReason ?? null,
    })
  } catch {
    /* 계기판이 본 작업을 막으면 안 된다 */
  }
}

/**
 * openai.chat.completions.create() with exponential backoff retry.
 * Retries on 429 (rate limit) and 5xx (server errors). All other errors throw immediately.
 *
 * @param {object} params - Same params as openai.chat.completions.create()
 * @param {number} [maxRetries=2] - Maximum retry attempts (0 = no retries)
 * @param {string} [task='crawler'] - 계기판 집계 축. 짧은 kebab-case (예: crawler-summarize)
 * @returns {Promise<object>} OpenAI response
 */
export async function chatWithRetry(params, maxRetries = 2, task = 'crawler') {
  const model = String(params?.model ?? 'unknown')
  const startedAt = Date.now()
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await getClient().chat.completions.create(params)
      // 성공 1건 = 행 1개. 중간에 429 로 물러났다 성공한 것은 성공 행 하나로만 남긴다.
      void recordUsage(task, model, response, true, Date.now() - startedAt)
      return response
    } catch (e) {
      const status = e.status || e.statusCode
      if (attempt === maxRetries || !(status === 429 || (status >= 500 && status < 600))) {
        // 최종 실패 — 사유를 남긴다. 4xx 는 재시도 없이 바로 여기로 온다.
        const reason = status ? `http_${status}` : e.name === 'AbortError' ? 'timeout' : 'network'
        void recordUsage(task, model, null, false, Date.now() - startedAt, reason)
        throw e
      }
      const waitMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 30000)
      await new Promise((r) => setTimeout(r, waitMs))
    }
  }
}
