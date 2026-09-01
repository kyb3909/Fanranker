import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * openai chat/completions 를 부르는 모든 자리가 `chatParams` 를 거치는가.
 *
 * ## 왜 주석이 아니라 시험인가
 * 규약은 이미 세 곳에 적혀 있었다 — `lib/llm/openai-params.ts` 상단, `CLAUDE.md`,
 * `.claude/skills/gongnori-llm-call`. 그런데 2026-09-02 전수 감사에서
 * `lib/news/quality-gate.ts:222` 하나가 `model: "gpt-5.6-terra"` 를 직접 적고 있었다.
 *
 * **파일 단위 grep 으로는 안 잡히는 형태였다.** 같은 파일 위쪽(158행)의 다른 호출은
 * 규약을 지키고 있어서 "이 파일은 chatParams 를 쓴다"가 참이었기 때문이다. 위반은
 * 줄 단위였고, 사람이 읽는 규약은 이런 걸 놓친다.
 *
 * ## 왜 이게 조용한 고장인가
 * 이 파이프라인 상당수가 fail-closed 다. 모델 문자열을 바꿨는데 파라미터가 그 세대에
 * 안 맞으면 400 이 나고, 400 이면 "검증 실패 = 전건 보류"가 되어 **에러 없이 발행이
 * 멈춘다.** 화면에는 그냥 기사가 안 올라올 뿐이라 원인을 역추적하기 어렵다.
 *
 * ## 판별 방법
 * `chatParams(model, ...)` 는 `{ model, ... }` 을 펼쳐 넣으므로, 요청 본문에 리터럴
 * `model:` 키가 남아 있으면 우회다. 이 신호는 좁지만 정확하다 — 감사 시점 기준 저장소
 * 전체에서 정확히 1건만 걸렸고 그게 진짜 위반이었다.
 *
 * ⚠️ `/v1/images` 는 대상이 아니다. 이미지 생성 API 는 샘플링 파라미터 자체가 없어
 *    `chatParams` 가 할 일이 없다. 감사 시점 기준 두 엔드포인트를 함께 쓰는 파일은
 *    없으므로(전수 확인) 파일 단위로 갈라도 오탐이 안 난다. 언젠가 한 파일이 둘 다
 *    쓰게 되면 이 시험이 먼저 빨개질 것이고, 그때 대상을 줄 범위로 좁히면 된다.
 */

const ROOTS = ["app", "lib", "scripts", "data"]
const EXT = /\.(ts|tsx|mjs|js)$/
const SKIP = new Set(["node_modules", ".next", "dist", "build", ".turbo"])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXT.test(name)) out.push(full)
  }
  return out
}

/** 요청 본문에 직접 박은 모델 키. `...chatParams(...)` 로 펼치면 이 형태가 안 남는다 */
const LITERAL_MODEL = /^\s*model\s*:\s*["'`]/

describe("chatParams 규약 전수", () => {
  const files = ROOTS.flatMap((r) => walk(join(process.cwd(), r))).filter((f) =>
    readFileSync(f, "utf8").includes("api.openai.com/v1/chat")
  )

  it("스캔 자체가 살아 있다 — 대상이 0개면 시험이 통과한 게 아니라 아무것도 안 본 것이다", () => {
    expect(files.length).toBeGreaterThan(15)
  })

  it("모델을 요청 본문에 직접 적은 자리가 없다", () => {
    const violations: string[] = []
    for (const f of files) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (LITERAL_MODEL.test(line)) {
            violations.push(`${relative(process.cwd(), f).replace(/\\/g, "/")}:${i + 1}`)
          }
        })
    }
    expect(
      violations,
      `모델은 \`...chatParams(모델, { ... })\` 로만 넣는다.\n` +
        `직접 적으면 모델을 바꾸는 순간 400 이 나고, fail-closed 라 에러 없이 발행이 멈춘다.\n` +
        `근거: lib/llm/openai-params.ts 상단 실측 주석`
    ).toEqual([])
  })
})
