/**
 * OpenAI chat/completions 요청에서 **모델 세대에 맞는 파라미터만** 내보낸다.
 *
 * 왜 필요한가: 호출부가 모델 문자열만 바꾸면 조용히 죽는 구조였다. 5세대 모델은
 * 4세대가 받던 파라미터 여럿을 거부하는데, 거부는 400 이고 우리 파이프라인의
 * 상당수는 fail-closed 다 — 표기 검증이 400 이면 "검증 실패 = 전건 보류"가 되어
 * **에러 없이 발행이 멈춘다**. 그래서 판정을 호출부가 아니라 여기 한 곳에 둔다.
 *
 * 2026-08-09 실측 (프로브, gpt-5.6-terra):
 *   temperature: 0.4   → 400  "Only the default (1) value is supported"
 *   top_p: 0.9         → 400  "Unsupported parameter: 'top_p'"
 *   max_tokens: 64     → 400  "Use 'max_completion_tokens' instead"
 *   위 셋을 뺀 요청     → 200
 *   response_format json_object → 200 (검사관이 이미 라이브로 쓰는 중)
 *
 * ⚠️ 같은 프로브에서 **gpt-5.1 + temperature 0.3 은 200 이었다** — "GPT-5 계열
 * 전체가 거부한다"는 통념(2026-08-08 감사 기재)은 사실이 아니다. 그럼에도 여기서는
 * 5 계열 전체를 보수적으로 막는다: 과하게 빼서 잃는 것은 샘플링 파라미터 하나지만,
 * 덜 빼서 잃는 것은 파이프라인 전체다. gpt-5.1 을 쓰는 라이브 경로는 별도 패키지인
 * data/crawlers 뿐이라 이 보수적 규칙의 실손실은 현재 0 이다.
 */

/** 모델이 temperature/top_p 같은 샘플링 파라미터를 받는가 */
export function supportsSamplingParams(model: string): boolean {
  return !/^gpt-5/i.test(model)
}

interface SamplingParams {
  temperature?: number
  top_p?: number
  /** 5세대에서는 max_completion_tokens 로 자동 변환된다 */
  max_tokens?: number
}

/**
 * 요청 본문의 모델·샘플링 파라미터 조각을 만든다.
 *
 * ```ts
 * body: JSON.stringify({
 *   ...chatParams("gpt-4o-mini", { temperature: 0 }),
 *   response_format: { type: "json_object" },
 *   messages: [...],
 * })
 * ```
 *
 * 모델과 파라미터를 **한 호출 안에** 묶는 게 요점이다 — 모델만 바꾸고 파라미터를
 * 못 고치는 드리프트가 구조적으로 불가능해진다. 지원 모델은 값을 그대로 통과시키므로
 * 오늘 동작하는 호출의 동작은 바뀌지 않는다.
 */
export function chatParams(model: string, params: SamplingParams = {}): Record<string, unknown> {
  if (supportsSamplingParams(model)) return { model, ...params }

  const { temperature: _temperature, top_p: _topP, max_tokens: maxTokens, ...rest } = params
  return maxTokens === undefined
    ? { model, ...rest }
    : { model, ...rest, max_completion_tokens: maxTokens }
}
