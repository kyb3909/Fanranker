import { createHash } from "node:crypto"
import { isContentFreeText } from "@/lib/news/content-quality"
import { PERSONAL_BLOG_RE, isWomensFootball } from "@/lib/news/quality-gate"
import { titleSimilarity } from "@/lib/saga/cluster"

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
 *  · 2026-08-05.2 — 첫 shadow 40건 실측에서 나온 결함 3종 수정.
 *    ① 오차단: "월드컵 개최 도시들, FIFA 지불 거부"를 non_football 로 반려했는데 실제로는
 *       발행된 기사였다(reject 4건 중 1건 = 25%). non_football 을 "다른 종목"으로 좁히고
 *       reject 자체를 훨씬 보수적으로 못박았다.
 *    ② 계약 모순: decision=assign 인데 reason 이 low_interest·non_football 인 행이 통과했다.
 *       배정해놓고 반려 사유를 다는 판정은 근거를 못 믿는다 → 그룹 정합성 검증 추가.
 *    ③ 중복 판정 불능: 후보를 1건씩 독립 호출하면서 decision 에 duplicate 를 넣어둬,
 *       LLM 이 판단할 재료가 없었다(기마랑이스 3건·비니시우스 6건 전부 assign).
 *       duplicate 는 LLM 에서 빼고 제목 유사도 규칙으로 내렸다 — "규칙 판정은 LLM 에
 *       맡기지 않는다" 원칙과도 맞고 중복분은 호출 자체를 안 한다.
 */
export const ASSIGNMENT_PROMPT_VERSION = "assignment-desk@2026-08-05.2"

/** 판정 모델. GPT-5 계열이 아니므로 temperature 사용 가능 (supportsTemperature 참조) */
export const ASSIGNMENT_MODEL = "gpt-4o-mini"

/** LLM 없이 결정론 규칙만으로 끝난 판정의 model 값. 규칙이 바뀌면 함께 올린다. */
export const ASSIGNMENT_RULE_MODEL = "rule:v2"

/** 같은 소식으로 접는 제목 유사도 임계 — auto-publish 중복 게이트와 같은 값 */
export const ASSIGNMENT_DUPLICATE_THRESHOLD = 0.5

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

/** 배정 근거 */
export const ASSIGN_REASON_CODES = [
  "big_club",
  "korean_player",
  "star_player",
  "official_announcement",
  "injury_update",
  "match_report",
  "saga_followup",
  "transfer_rumor",
] as const
/** 보류 근거 */
export const HOLD_REASON_CODES = [
  "unclear_source",
  "thin_source",
  "personal_blog",
  "korean_media",
  "content_free",
] as const
/** 중복 근거 (규칙 판정 전용 — LLM 은 이 결정을 내리지 않는다) */
export const DUPLICATE_REASON_CODES = ["duplicate_recent"] as const
/** 반려 근거 */
export const REJECT_REASON_CODES = [
  "minor_league",
  "admin_notice",
  "non_football",
  "womens_football",
  "low_interest",
  "stale",
] as const

/** 판정 사유. 자유 문장 대신 닫힌 집합이어야 분포를 집계하고 회귀를 감지할 수 있다. */
export const ASSIGNMENT_REASON_CODES = [
  ...ASSIGN_REASON_CODES,
  ...HOLD_REASON_CODES,
  ...DUPLICATE_REASON_CODES,
  ...REJECT_REASON_CODES,
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
      dropped: { checks: string[]; reasonCodes: string[]; mismatched: string[] }
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

/**
 * 결정별로 허용되는 사유 그룹.
 *
 * 배정해놓고 반려 사유를 다는 판정은 근거가 흔들린 신호다 (2026-08-05 shadow 실측:
 * decision=assign 인데 reason 이 low_interest·non_football 인 행 2건). 그대로 두면
 * 사유 분포 통계가 오염되고, 나중에 이 사유로 실집행을 열면 엉뚱한 걸 버린다.
 *
 * 보류·중복은 "배정 가치는 있는데 지금은 아님"이 정상이라 배정 근거를 함께 허용한다.
 */
const ALLOWED_REASONS_BY_DECISION: Record<AssignmentDecision, Set<string>> = {
  assign: new Set<string>(ASSIGN_REASON_CODES),
  hold: new Set<string>([...HOLD_REASON_CODES, ...ASSIGN_REASON_CODES]),
  duplicate: new Set<string>([...DUPLICATE_REASON_CODES, ...ASSIGN_REASON_CODES]),
  reject: new Set<string>(REJECT_REASON_CODES),
}

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

## decision — assign 이 기본값이다
- assign: 처리한다
- hold: 지금은 보류(출처 불명·자료 부족). **애매하면 reject 가 아니라 hold** — 잘못 버리는 게 훨씬 나쁘다
- reject: 아래 넷 중 하나가 **명백할 때만**. 조금이라도 걸리면 hold 로 내려라
  · 여자 축구
  · 축구가 아닌 다른 종목(농구·야구·테니스·e스포츠 등)
  · 무명 하부리그·마이너 리그의 소소한 이적/임대
  · 팬이 볼 이유가 전혀 없는 순수 행정 공지

⚠️ **non_football 은 "다른 종목"일 때만 쓴다.** FIFA·UEFA·프리미어리그·월드컵·구단이
관련되면 행정·법정·사건사고·스폰서십이라도 **전부 축구다.** 이걸 반려하면 실제로 나갔어야 할
기사를 버린다(실사고: "월드컵 개최 도시들, FIFA 지불 거부에 대응"을 non_football 로 반려).

## 중복은 판정하지 마라
같은 소식이 여러 건 들어오는지는 규칙이 따로 판정한다. 너는 이 후보 하나만 보고 있으므로
중복 여부를 알 수 없다. 추측하지 말고 이 후보 자체의 가치로만 판정하라.

## required_checks — 후속 단계가 반드시 돌려야 할 검증 (없으면 빈 배열)
image_required / player_dictionary / duplicate_scan / source_tier / body_consistency / translation / saga_link

## reason_codes — 아래에서 고른다 (1~3개)
배정: big_club, korean_player, star_player, official_announcement, injury_update, match_report, saga_followup, transfer_rumor
보류: unclear_source, thin_source, personal_blog, korean_media, content_free
반려: minor_league, admin_notice, non_football, womens_football, low_interest, stale

⚠️ **사유는 decision 과 같은 줄에서만 고른다.** assign 인데 low_interest, assign 인데
non_football 같은 조합은 금지다 — 배정해놓고 반려 사유를 달면 판정을 믿을 수 없다.
보류는 배정 근거를 함께 써도 된다(예: big_club + unclear_source).

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
 * 중복도 여기서 본다. 후보를 1건씩 독립 호출하는 구조라 LLM 은 다른 후보를 볼 수 없어
 * 중복을 원리적으로 못 잡았다 (2026-08-05 실측: 기마랑이스 3건·비니시우스 6건이 전부
 * assign). 제목 유사도는 auto-publish 중복 게이트와 같은 함수·같은 임계를 쓴다.
 *
 * @param seenTitles 이 후보보다 먼저 본 제목들. 비어 있으면 중복 판정을 건너뛴다.
 * @returns 규칙으로 끝났으면 판정, 아니면 null(= LLM 호출 필요)
 */
export function preAssign(
  input: AssignmentInput,
  seenTitles: string[] = []
): AssignmentVerdict | null {
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
  // 정책 반려·보류를 먼저 본다 — 여자 축구 기사가 둘 들어오면 '중복'이 아니라 '여자 축구'다.
  const duplicateOf = seenTitles.find(
    (seen) => titleSimilarity(seen, input.title) >= ASSIGNMENT_DUPLICATE_THRESHOLD
  )
  if (duplicateOf) {
    return verdict(
      {
        desk: "general",
        priority: 10,
        risk: "low",
        format: "hold",
        required_checks: ["duplicate_scan"],
        deadline_minutes: 0,
        decision: "duplicate",
        reason_codes: ["duplicate_recent"],
      },
      ASSIGNMENT_RULE_MODEL
    )
  }
  return null
}

export type AssignmentParseResult =
  | {
      ok: true
      verdict: AssignmentVerdict
      dropped: { checks: string[]; reasonCodes: string[]; mismatched: string[] }
    }
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

  // 결정과 안 맞는 사유는 버린다. 모르는 값(오타·환각)과는 따로 세야 프롬프트 회귀를
  // 진단할 수 있다 — 전자는 "모델이 계약을 모른다", 후자는 "판정이 흔들린다"로 원인이 다르다.
  const allowed = ALLOWED_REASONS_BY_DECISION[decision as AssignmentDecision]
  const reasons = [...new Set(rawReasons.filter((c) => allowed.has(c)))] as AssignmentReasonCode[]

  // 사유가 하나도 안 남으면 "왜 그렇게 판정했는지 모르는 행"이 된다 — 그건 침묵 실패다.
  if (reasons.length === 0) {
    return { ok: false, error: `decision=${decision} 에 맞는 reason_code 없음` }
  }

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
      /** 아는 사유지만 이 결정과 모순이라 버린 것 (assign 인데 low_interest 류) */
      mismatched: rawReasons.filter((c) => REASON_SET.has(c) && !allowed.has(c)),
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
