import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { chatParams } from "@/lib/llm/openai-params"

/**
 * 정본(`lib/llm/openai-params.ts`)과 VPS 복제본이 갈라지면 실패한다.
 *
 * ## 왜 복제본이 있는가
 * `scripts/vps-news-scanner/news-scanner.mjs` 는 **무의존 단일 파일**이다 — VPS 에
 * 파일 하나만 올려 돌리는 배포 단위라 `@/lib/...` 를 import 할 수 없다. 그래서
 * 같은 함수가 손으로 복제돼 있다.
 *
 * ## 왜 시험이 필요한가
 * "한쪽 고치면 양쪽 고칠 것"이라는 주석은 사람이 읽어야 지켜진다. 실제로 갈라져
 * 있었다 (2026-08-26 발견): 복제본이 `temperature`·`max_tokens` 만 구조분해하고
 * 나머지를 **두 경로 모두에서 조용히 버렸다**. `top_p` 를 넘기는 호출부가 아직
 * 없어서 사고는 안 났지만, 넘기는 순간 VPS 만 다르게 동작했을 것이다.
 *
 * 조용한 드리프트가 위험한 이유는 이 파이프라인이 fail-closed 라서다 —
 * 파라미터가 하나 틀리면 400 이고, 400 이면 발행이 **에러 없이** 멈춘다.
 *
 * ## 읽는 방법
 * 복제본은 최상위 부작용이 있는 실행 스크립트라 import 하면 스캐너가 돌아버린다.
 * 그래서 함수 원문만 잘라내 평가한다 — 시험 대상이 "두 **소스 파일**이 같은가"이므로
 * 소스에서 직접 읽는 것이 오히려 정확하다.
 */
function loadVpsChatParams(): (model: string, params?: Record<string, unknown>) => unknown {
  const src = readFileSync(
    join(process.cwd(), "scripts", "vps-news-scanner", "news-scanner.mjs"),
    "utf8"
  )
  const start = src.indexOf("function chatParams(")
  expect(start, "복제본에서 chatParams 를 못 찾았다 — 이름이 바뀌었나?").toBeGreaterThan(-1)

  // ⚠️ 본문 시작을 `indexOf("{")` 로 찾으면 안 된다 — 기본값 `params = {}` 의
  //    중괄호가 먼저 걸린다. 매개변수 목록을 괄호 균형으로 건너뛴 뒤에 찾는다.
  let paren = 0
  let bodyStart = -1
  for (let i = src.indexOf("(", start); i < src.length; i++) {
    if (src[i] === "(") paren++
    else if (src[i] === ")" && --paren === 0) {
      bodyStart = src.indexOf("{", i)
      break
    }
  }
  expect(bodyStart, "복제본 chatParams 의 본문 시작을 못 찾았다").toBeGreaterThan(start)

  let depth = 0
  let end = -1
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}" && --depth === 0) {
      end = i + 1
      break
    }
  }
  expect(end, "복제본 chatParams 의 끝을 못 찾았다").toBeGreaterThan(bodyStart)

  const body = src.slice(start, end)
  return new Function(`${body}; return chatParams`)() as ReturnType<typeof loadVpsChatParams>
}

/** 실제 호출부가 쓰는 조합 + 앞으로 쓸 법한 조합 */
const MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-5.1", "gpt-5.6-terra"]
const PARAM_SETS: Record<string, unknown>[] = [
  {},
  { temperature: 0 },
  { temperature: 0.4 },
  { max_tokens: 800 },
  { temperature: 0.3, max_tokens: 1400 },
  { top_p: 0.9 }, // 갈라짐이 처음 드러난 자리
  { temperature: 0.4, top_p: 0.9, max_tokens: 600 },
  { seed: 7 }, // 앞으로 붙을 법한 파라미터 — 복제본이 조용히 버리면 안 된다
]

describe("chatParams 정본 ↔ VPS 복제본", () => {
  const vps = loadVpsChatParams()

  for (const model of MODELS) {
    for (const params of PARAM_SETS) {
      it(`${model} ← ${JSON.stringify(params)}`, () => {
        expect(vps(model, { ...params })).toEqual(chatParams(model, { ...params }))
      })
    }
  }

  it("복제본이 정본과 같은 키 집합을 낸다 (전 조합)", () => {
    for (const model of MODELS) {
      for (const params of PARAM_SETS) {
        const a = Object.keys(chatParams(model, { ...params })).sort()
        const b = Object.keys(vps(model, { ...params }) as object).sort()
        expect(b, `${model} / ${JSON.stringify(params)}`).toEqual(a)
      }
    }
  })
})
