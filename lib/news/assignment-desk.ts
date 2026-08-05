import { createHash } from "node:crypto"
import { isContentFreeText } from "@/lib/news/content-quality"
import { PERSONAL_BLOG_RE, isWomensFootball } from "@/lib/news/quality-gate"

/**
 * 어사인먼트 데스크 (Phase 2 — shadow 전용).
 *
 * 후보 1건을 받아 "어느 데스크가 / 얼마나 급하게 / 어떤 형식으로 / 무엇을 검증하고"
 * 처리할지만 구조화 판정한다. 기사를 쓰지도, 사실을 검증하지도 않는다.
 *
 * shadow 인 이유: 기존 관심도 필터·자동발행 게이트를 대체하기 전에, 같은 후보에
 * 대해 새 판정이 실제 발행 결과와 얼마나 어긋나는지를 숫자로 먼저 봐야 한다.
 * 이 모듈의 어떤 함수도 news_reservoir·news_candidates 를 건드리지 않는다.
 *
 * 설계에서 양보하지 않는 것 두 가지:
 *  · **실패와 판정을 절대 합치지 않는다.** LLM 이 죽은 것(llm_error)과 "배정할 가치
 *    없음"(reject)은 다른 사건이다. 2026-08-04 에 사유 없이 continue 하던 필터가 큐의
 *    46%를 먹은 사고가 정확히 이 둘을 합쳤기 때문에 생겼다.
 *  · **같은 (후보, 내용, 프롬프트 버전)은 두 번 호출하지 않는다.** 재평가는 초안이
 *    바뀌었거나(content_hash 변화) 프롬프트를 올렸을 때(prompt_version)만 열린다.
 */

/**
 * 프롬프트와 결정론 규칙을 함께 덮는 버전. **둘 중 하나라도 바꾸면 반드시 올린다** —
 * 안 올리면 옛 판정이 재평가 없이 그대로 통계에 남아 변경 효과를 못 잰다.
 *
 * 이력:
 *  · 2026-08-05.1 — 최초. desk 6종 / reason code 20종 / check 7종.
 *    루머를 반려 사유에서 뺐다 (2026-08-04 운영자 확정: "오보 어차피 루머니까 상관 없어").
 */
export const ASSIGNMENT_PROMPT_VERSION = "assignment-desk@2026-08-05.1"

/** 판정 모델. GPT-5 계열이 아니므로 temperature 사용 가능 (supportsTemperature 참조) */
export const ASSIGNMENT_MODEL = "gpt-4o-mini"

/** LLM 없이 결정론 규칙만으로 끝난 판정의 model 값 */
export const ASSIGNMENT_RULE_MODEL = "rule:v1"

/** 회복 가능 실패를 몇 번까지 다시 볼 것인가 — 넘으면 dead_letter */
export const ASSIGNMENT_MAX_ATTEMPTS = 3

export const ASSIGNMENT_DESKS = [
  "transfer",
  "match",
  "official",
  "injury",
  "general",
  "saga",
] as const
export const ASSIGNMENT_RISKS = ["low", "medium", "high"] as const
export const ASSIGNMENT_FORMATS = ["breaking_brief", "standard", "saga_update", "hold"] as const
export const ASSIGNMENT_DECISIONS = ["assign", "hold", "duplicate", "reject"] as const

/** 후속 단계(팩트체커·카피데스크)가 반드시 돌려야 하는 검증 */
export const ASSIGNMENT_CHECKS = [
  "image_required",
  "player_dictionary",
  "duplicate_scan",
  "source_tier",
  "body_consistency",
  "translation",
  "saga_link",
] as const

/** 판정 사유. 자유 문장 대신 닫힌 집합이어야 분포를 집계하고 회귀를 감지할 수 있다. */
export const ASSIGNMENT_REASON_CODES = [
  // 배정 근거
  "big_club",
  "korean_player",
  "star_player",
  "official_announcement",
  "injury_update",
  "match_report",
  "saga_followup",
  "transfer_rumor",
  // 보류 근거
  "unclear_source",
  "thin_source",
  "personal_blog",
  "korean_media",
  "content_free",
  // 중복
  "duplicate_recent",
  // 반려 근거
  "minor_league",
  "admin_notice",
  "non_football",
  "womens_football",
  "low_interest",
  "stale",
] as const

export type AssignmentDesk = (typeof ASSIGNMENT_DESKS)[number]
export type AssignmentRisk = (typeof ASSIGNMENT_RISKS)[number]
export type AssignmentFormat = (typeof ASSIGNMENT_FORMATS)[number]
export type AssignmentDecision = (typeof ASSIGNMENT_DECISIONS)[number]
export type AssignmentCheck = (typeof ASSIGNMENT_CHECKS)[number]
export type AssignmentReasonCode = (typeof ASSIGNMENT_REASON_CODES)[number]

export interface AssignmentVerdict {
  desk: AssignmentDesk
  priority: number
  risk: AssignmentRisk
  format: AssignmentFormat
  required_checks: AssignmentCheck[]
  deadline_minutes: number
  decision: AssignmentDecision
  reason_codes: AssignmentReasonCode[]
  model: string
  prompt_version: string
}

export interface AssignmentInput {
  candidateId: string
  title: string
  /** 본문 평문 (TipTap 추출본) */
  body: string
  sourceUrl: string | null
}

export interface AssignmentUsage {
  inputTokens: number | null
  outputTokens: number | null
  cachedTokens: number | null
}

/** LLM 호출 실패의 성격. 재시도 가치 판단의 입력이지 결과가 아니다. */
export type AssignmentFailureKind = "http" | "network" | "parse" | "contract"

export type AssignmentCallResult =
  | {
      ok: true
      verdict: AssignmentVerdict
      usage: AssignmentUsage
      latencyMs: number
      /** 계약 밖 값이라 버린 것들 — 프롬프트 회귀 감지용 */
      dropped: { checks: string[]; reasonCodes: string[] }
    }
  | {
      ok: false
      /** 호출 자체가 죽었으면 llm_error, 응답이 계약을 못 지켰으면 invalid_output */
      outcome: "llm_error" | "invalid_output"
      kind: AssignmentFailureKind
      httpStatus?: number
      error: string
      latencyMs: number
      usage: AssignmentUsage
    }

const DESK_SET = new Set<string>(ASSIGNMENT_DESKS)
const RISK_SET = new Set<string>(ASSIGNMENT_RISKS)
const FORMAT_SET = new Set<string>(ASSIGNMENT_FORMATS)
const DECISION_SET = new Set<string>(ASSIGNMENT_DECISIONS)
const CHECK_SET = new Set<string>(ASSIGNMENT_CHECKS)
const REASON_SET = new Set<string>(ASSIGNMENT_REASON_CODES)

/** 마감 상한 — 뉴스 후보에 24시간을 넘는 마감은 의미가 없다(만료가 먼저 온다) */
const MAX_DEADLINE_MINUTES = 1440

const SYSTEM_PROMPT = `너는 한국 축구 팬 커뮤니티(EPL 중심)의 어사인먼트 데스크다.
기사 후보 1건을 받아 **처리 배정만** 한다. 기사를 쓰지 마라. 사실 검증도 하지 마라(팩트체커 몫).

## desk — 어느 데스크 소관인가
- transfer: 이적·계약·연봉·바이아웃
- match: 경기 결과·프리뷰·전술·순위
- official: 구단/리그/협회의 공식 발표
- injury: 부상·수술·복귀 일정
- saga: 이미 진행 중인 이적 스레드의 후속 보도
- general: 위에 안 맞는 축구 소식

## priority (0~100) — 한국 독자 기준 주목도
90+ 빅클럽 오피셜·한국인 선수 / 70~89 스타 선수 이적설·빅매치 / 40~69 일반 EPL 소식
/ 20~39 주변부 / 0~19 거의 무관심

## risk — 오보·정책 위반 위험
low 공식 발표·확정 보도 / medium 기자발 단독·미확정 / high 출처 불명·과장 제목·자극적 프레이밍

## format
breaking_brief 속보 단신 / standard 일반 기사 / saga_update 사가 엔트리 / hold 지금은 작성 보류

## decision
- assign: 처리한다
- hold: 지금은 보류(자료 부족·출처 불명 등). **애매하면 reject 가 아니라 hold** — 잘못 버리는 게 더 나쁘다
- duplicate: 이미 다룬 소식의 재탕으로 보임
- reject: 우리 독자에게 명백히 무가치

## required_checks — 후속 단계가 반드시 돌려야 할 검증 (없으면 빈 배열)
image_required / player_dictionary / duplicate_scan / source_tier / body_consistency / translation / saga_link

## reason_codes — 아래 목록에서만 고른다 (1~3개)
배정: big_club, korean_player, star_player, official_announcement, injury_update, match_report, saga_followup, transfer_rumor
보류: unclear_source, thin_source, personal_blog, korean_media, content_free
중복: duplicate_recent
반려: minor_league, admin_notice, non_football, womens_football, low_interest, stale

## 운영 규칙 (반드시 지킨다)
- **이적 루머는 반려 사유가 아니다.** 여름 이적시장 기사 대부분이 루머다 — transfer_rumor 로 배정하되 risk 를 올려라
- 여자 축구는 커버리지 밖 → reject + womens_football
- 한국 매체에서 퍼온 기사는 피드에 넣지 않는다 → hold + korean_media
- 개인 블로그·뉴스레터 출처는 사람 검수로 → hold + personal_blog

## deadline_minutes
이 시간을 넘기면 가치가 크게 떨어지는 분(minute). 속보 30, 일반 360, 보류/반려 0.

JSON만 출력:
{"desk":"...","priority":0,"risk":"...","format":"...","required_checks":[],"deadline_minutes":0,"decision":"...","reason_codes":[]}`

/** GPT-5 계열은 temperature 를 받지 않는다 — 넣으면 400 이고, fail-closed 경로에서는
 *  전건 반려로 조용히 죽는다(2026-08-04 불변식). 모델을 바꿔도 재발하지 않도록
 *  호출부가 아니라 여기서 판정한다. */
export function supportsTemperature(model: string): boolean {
  return !/^gpt-5/i.test(model)
}

/**
 * 배정 입력의 안정 해시. 초안이 수정되면 값이 바뀌어 재평가가 열리고, 안 바뀌면
 * 프롬프트 버전이 같은 한 다시 호출하지 않는다.
 * 공백만 다른 초안을 다른 내용으로 보지 않도록 정규화한다.
 */
export function assignmentContentHash(
  input: Pick<AssignmentInput, "title" | "body" | "sourceUrl">
) {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim()
  return createHash("sha256")
    .update(
      JSON.stringify([
        normalize(input.title),
        normalize(input.body).slice(0, 4000),
        input.sourceUrl ?? "",
      ])
    )
    .digest("hex")
}

function verdict(partial: Omit<AssignmentVerdict, "model" | "prompt_version">, model: string) {
  return { ...partial, model, prompt_version: ASSIGNMENT_PROMPT_VERSION }
}

/**
 * 결정론 선판정 — 규칙으로 이미 답이 정해진 후보는 LLM 을 부르지 않는다.
 *
 * 비용 절감이 목적이지만 그게 전부는 아니다. 여자 축구·개인 블로그는 운영자가 확정한
 * 정책이라 LLM 의 판단 재량에 둘 이유가 없다("규칙 판정은 LLM 에 맡기지 않는다").
 * 규칙은 quality-gate 와 **같은 상수**를 쓴다 — 복제하면 한쪽만 고쳐지는 드리프트가 난다.
 *
 * @returns 규칙으로 끝났으면 판정, 아니면 null(= LLM 호출 필요)
 */
export function preAssign(input: AssignmentInput): AssignmentVerdict | null {
  if (isWomensFootball(input.title, input.body.slice(0, 400), input.sourceUrl)) {
    return verdict(
      {
        desk: "general",
        priority: 0,
        risk: "high",
        format: "hold",
        required_checks: [],
        deadline_minutes: 0,
        decision: "reject",
        reason_codes: ["womens_football"],
      },
      ASSIGNMENT_RULE_MODEL
    )
  }
  if (input.sourceUrl && PERSONAL_BLOG_RE.test(input.sourceUrl)) {
    return verdict(
      {
        desk: "general",
        priority: 20,
        risk: "high",
        format: "hold",
        required_checks: ["source_tier"],
        deadline_minutes: 0,
        decision: "hold",
        reason_codes: ["personal_blog"],
      },
      ASSIGNMENT_RULE_MODEL
    )
  }
  if (isContentFreeText(input.body)) {
    return verdict(
      {
        desk: "general",
        priority: 10,
        risk: "medium",
        format: "hold",
        required_checks: ["body_consistency"],
        deadline_minutes: 0,
        decision: "hold",
        reason_codes: ["content_free"],
      },
      ASSIGNMENT_RULE_MODEL
    )
  }
  return null
}

export type AssignmentParseResult =
  | { ok: true; verdict: AssignmentVerdict; dropped: { checks: string[]; reasonCodes: string[] } }
  | { ok: false; error: string }

/**
 * LLM 응답 → 배정 계약. 계약을 못 지킨 응답은 **추측으로 메우지 않고 실패로 돌린다**
 * (invalid_output). 기본값으로 채우면 모델이 망가진 걸 통계가 정상으로 보고한다.
 * 단, 배열 원소 중 모르는 값만 있는 경우는 버리고 dropped 로 보고한다 — 열거형이
 * 커질 때마다 전건 실패하면 shadow 가 아무것도 못 배운다.
 */
export function parseAssignmentVerdict(raw: unknown, model: string): AssignmentParseResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "응답이 객체가 아님" }
  const r = raw as Record<string, unknown>

  const desk = String(r.desk ?? "")
  if (!DESK_SET.has(desk)) return { ok: false, error: `desk 값 밖: ${desk || "(없음)"}` }
  const risk = String(r.risk ?? "")
  if (!RISK_SET.has(risk)) return { ok: false, error: `risk 값 밖: ${risk || "(없음)"}` }
  const format = String(r.format ?? "")
  if (!FORMAT_SET.has(format)) return { ok: false, error: `format 값 밖: ${format || "(없음)"}` }
  const decision = String(r.decision ?? "")
  if (!DECISION_SET.has(decision))
    return { ok: false, error: `decision 값 밖: ${decision || "(없음)"}` }

  const priority = Number(r.priority)
  if (!Number.isFinite(priority) || priority < 0 || priority > 100)
    return { ok: false, error: `priority 범위 밖: ${String(r.priority)}` }

  const deadline = Number(r.deadline_minutes)
  if (!Number.isFinite(deadline) || deadline < 0 || deadline > MAX_DEADLINE_MINUTES)
    return { ok: false, error: `deadline_minutes 범위 밖: ${String(r.deadline_minutes)}` }

  const rawChecks = Array.isArray(r.required_checks) ? r.required_checks.map(String) : []
  const rawReasons = Array.isArray(r.reason_codes) ? r.reason_codes.map(String) : []
  const checks = [...new Set(rawChecks.filter((c) => CHECK_SET.has(c)))] as AssignmentCheck[]
  const reasons = [
    ...new Set(rawReasons.filter((c) => REASON_SET.has(c))),
  ] as AssignmentReasonCode[]

  // 사유가 하나도 안 남으면 "왜 그렇게 판정했는지 모르는 행"이 된다 — 그건 침묵 실패다.
  if (reasons.length === 0) return { ok: false, error: "알려진 reason_code 없음" }

  return {
    ok: true,
    verdict: verdict(
      {
        desk: desk as AssignmentDesk,
        priority: Math.round(priority),
        risk: risk as AssignmentRisk,
        format: format as AssignmentFormat,
        required_checks: checks,
        deadline_minutes: Math.round(deadline),
        decision: decision as AssignmentDecision,
        reason_codes: reasons,
      },
      model
    ),
    dropped: {
      checks: rawChecks.filter((c) => !CHECK_SET.has(c)),
      reasonCodes: rawReasons.filter((c) => !REASON_SET.has(c)),
    },
  }
}

/**
 * 실패를 재시도 대기와 영구 실패로 가른다.
 * 인증·요청 형식 오류(4xx)는 같은 입력으로 다시 보내도 같은 답이므로 재시도 예산을
 * 태우지 않는다. 429(rate limit)·408(timeout)만 예외 — 시간이 해결한다.
 */
export function classifyAssignmentFailure(input: {
  kind: AssignmentFailureKind
  httpStatus?: number
  attempt: number
}): "retry_wait" | "dead_letter" {
  const { kind, httpStatus, attempt } = input
  if (kind === "http" && httpStatus !== undefined) {
    const transient = httpStatus === 429 || httpStatus === 408 || httpStatus >= 500
    if (!transient) return "dead_letter"
  }
  return attempt >= ASSIGNMENT_MAX_ATTEMPTS ? "dead_letter" : "retry_wait"
}

/**
 * 1M 토큰당 USD. 외부에서 자동 갱신되지 않는 **수동 표**다 — 요율이 바뀌면 여기를 고친다.
 * 표에 없는 모델은 0 이 아니라 null 을 돌려준다: 모르는 비용을 0 으로 적으면 예산 보고가
 * 거짓말을 하고, 그 거짓말은 모델을 바꾼 순간부터 조용히 시작된다.
 */
const MODEL_RATES_USD_PER_MTOK: Record<string, { input: number; cached: number; output: number }> =
  {
    "gpt-4o-mini": { input: 0.15, cached: 0.075, output: 0.6 },
    "gpt-4.1-mini": { input: 0.4, cached: 0.1, output: 1.6 },
    "gpt-4o": { input: 2.5, cached: 1.25, output: 10 },
  }

/** 결정론 규칙 판정은 호출이 없으므로 비용 0 (null 이 아니라 진짜 0 이다) */
export function estimateAssignmentCostUsd(model: string, usage: AssignmentUsage): number | null {
  if (model.startsWith("rule:")) return 0
  const rate = MODEL_RATES_USD_PER_MTOK[model]
  if (!rate) return null
  const input = usage.inputTokens ?? 0
  const output = usage.outputTokens ?? 0
  // OpenAI 의 cached_tokens 는 input 의 부분집합이다 — 따로 더하면 이중 계상된다.
  const cached = Math.min(usage.cachedTokens ?? 0, input)
  const cost = ((input - cached) * rate.input + cached * rate.cached + output * rate.output) / 1e6
  return Number(cost.toFixed(6))
}

function readUsage(payload: unknown): AssignmentUsage {
  const usage = (payload as { usage?: Record<string, unknown> } | null)?.usage
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
  return {
    inputTokens: num(usage?.prompt_tokens),
    outputTokens: num(usage?.completion_tokens),
    cachedTokens: num(
      (usage?.prompt_tokens_details as { cached_tokens?: unknown } | undefined)?.cached_tokens
    ),
  }
}

const EMPTY_USAGE: AssignmentUsage = { inputTokens: null, outputTokens: null, cachedTokens: null }

/** 배정 LLM 1회 호출. 성공/실패 어느 쪽이든 계측(latency·usage)을 반드시 담아 돌려준다. */
export async function requestAssignment(
  input: AssignmentInput,
  opts: { apiKey: string; model?: string; timeoutMs?: number }
): Promise<AssignmentCallResult> {
  const model = opts.model ?? ASSIGNMENT_MODEL
  const started = Date.now()
  const fail = (
    outcome: "llm_error" | "invalid_output",
    kind: AssignmentFailureKind,
    error: string,
    extra?: { httpStatus?: number; usage?: AssignmentUsage }
  ): AssignmentCallResult => ({
    ok: false,
    outcome,
    kind,
    error: error.slice(0, 500),
    latencyMs: Date.now() - started,
    usage: extra?.usage ?? EMPTY_USAGE,
    ...(extra?.httpStatus !== undefined ? { httpStatus: extra.httpStatus } : {}),
  })

  let payload: unknown
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model,
        ...(supportsTemperature(model) ? { temperature: 0 } : {}),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              `제목: ${input.title}`,
              `출처: ${input.sourceUrl ?? "(없음)"}`,
              "",
              `본문:\n${input.body.slice(0, 2500)}`,
            ].join("\n"),
          },
        ],
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    })
    if (!res.ok) {
      return fail("llm_error", "http", `HTTP ${res.status}`, { httpStatus: res.status })
    }
    payload = await res.json()
  } catch (e) {
    return fail("llm_error", "network", e instanceof Error ? e.message : String(e))
  }

  const usage = readUsage(payload)
  const text = (payload as { choices?: { message?: { content?: string } }[] })?.choices?.[0]
    ?.message?.content
  if (!text) return fail("invalid_output", "parse", "응답 본문 없음", { usage })

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return fail("invalid_output", "parse", e instanceof Error ? e.message : "JSON 파싱 실패", {
      usage,
    })
  }

  const parsed = parseAssignmentVerdict(raw, model)
  if (!parsed.ok) return fail("invalid_output", "contract", parsed.error, { usage })

  return {
    ok: true,
    verdict: parsed.verdict,
    dropped: parsed.dropped,
    usage,
    latencyMs: Date.now() - started,
  }
}
