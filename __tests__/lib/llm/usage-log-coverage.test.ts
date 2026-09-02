import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * openai 를 부르는 자리가 사용량을 남기는가.
 *
 * ## 왜
 * 계기판(`llm_usage_log`)은 2026-08-25 에 생겼는데, 2026-09-02 전수 감사에서 **호출부
 * 27자리 중 9곳이 아무것도 안 남기고 있었다.** 그중 뉴스 데스크는 자체 표에는 적으면서
 * 통합 계기판에는 안 잡혀, 운영자가 보는 "오늘 $X" 가 실제보다 적었다.
 *
 * 새 호출부를 추가할 때 계측을 같이 붙이는 건 사람이 기억해야 하는 일이었다. 그래서
 * 여기로 옮긴다 — 안 붙이면 이 시험이 먼저 빨개진다.
 *
 * ## ⚠️ SDK 도 본다 (2026-09-02 같은 날 두 번째 수정)
 * 첫 판은 `api.openai.com/v1/chat` 문자열만 훑었다. 그래서 `openai` SDK 로 부르는
 * `data/crawlers/`·`data/agents/`(별도 package.json) 가 **통째로 빠졌다** — 운영자가
 * "어제 여러 번 충전됐다"고 했을 때 계기판엔 $1 이 찍혀 있었고, 그 차이가 여기 있었다.
 * 스캔 패턴을 `chat.completions.create(` · `new OpenAI(` 까지 넓힌다.
 *
 * ## 면제 목록에 이유를 같이 적는 이유
 * 이유 없는 면제는 다음 사람이 지워도 되는지 판단할 수 없다. 그리고 면제 항목이 실제로
 * 존재하는지도 함께 검사한다 — 파일이 사라졌는데 면제만 남으면 목록이 거짓말을 한다.
 */

const ROOTS = ["app", "lib", "scripts", "data"]
const EXT = /\.(ts|tsx|mjs|js)$/
const SKIP = new Set(["node_modules", ".next", "dist", "build", ".turbo"])

/** openai 를 부른다고 볼 수 있는 흔적 — 직접 fetch 와 SDK 둘 다 */
const CALLS_OPENAI = /api\.openai\.com\/v1\/chat|chat\.completions\.create\(|new OpenAI\(/

/** 계측했다고 볼 수 있는 흔적. chatWithRetry·recordUsage 는 data/crawlers 쪽 계측기다 */
const INSTRUMENTED =
  /\b(logUsage|logUsageTokens|logUsageFailure|openaiChat|chatWithRetry|recordUsage)\b/

const EXEMPT: Record<string, string> = {
  "lib/llm/usage-log.ts": "계기판 본체 — 자기가 자기를 부를 수는 없다",

  // ⚠️ 계측을 **호출부(라우트)에서** 한다. 이 파일은 시험 2개가 직접 import 하는 순수
  //    모듈이라, server-only 인 계기판을 최상위에서 끌어오면 그 시험들이 env 없이 못 돈다
  //    (같은 함정으로 검사 55개가 하루 동안 건너뛰어진 적이 있다 — 2026-08-26).
  //    실제 기록은 app/api/cron/news-assignment-desk/route.ts 가 한다.
  "lib/news/assignment-desk.ts": "순수 모듈 유지 — 계측은 news-assignment-desk 라우트에서",

  // ⚠️ VPS 배포 단위는 **무의존 단일 파일**이라 `@/lib/...` 를 import 할 수 없다.
  //    chatParams 도 같은 이유로 복제돼 있고, 그 복제는 전용 시험이 따로 감시한다
  //    (openai-params-vps-sync.test.ts). 계측은 아직 복제하지 않았다 — 넣으려면
  //    supabase 클라이언트까지 복제해야 해서 배포 단위가 무너진다.
  "scripts/news-scanner.mjs": "VPS 무의존 단일 파일 — @/lib import 불가",
  "scripts/vps-news-scanner/news-scanner.mjs": "VPS 무의존 단일 파일 — @/lib import 불가",

  // ⚠️ 맨 `tsx` 로 돌리면 `usage-log.ts` 첫 줄의 `import "server-only"` 가 throw 한다.
  //    **다만 그건 스크립트의 결함이 아니라 실행법 문제다** — `scripts/tsconfig.server-stub.json`
  //    이 server-only 를 빈 모듈로 바꿔치기하고, 스크립트 10여 개가 이미 그 방식으로 돈다:
  //        pnpm exec tsx --tsconfig scripts/tsconfig.server-stub.json scripts/<이름>.ts
  //    아래 셋은 문서화된 실행법이 맨 tsx 라 그 우회를 안 거친다. 계측을 붙이려면 실행
  //    명령을 바꿔야 하는데, 운영자가 손으로 돌리는 것들이라 옛 명령으로 돌리면 통째로
  //    죽는다. 그 위험을 지금 지지 않는다 — 붙일 거면 실행법 변경과 **같이** 해야 한다.
  "scripts/draft-squad-names.ts": "맨 tsx 실행 — 붙이려면 스텁 tsconfig 로 실행법 변경이 선행",
  "scripts/reddit-daily-seed.ts": "맨 tsx 실행 — 붙이려면 스텁 tsconfig 로 실행법 변경이 선행",
  "scripts/seed-replies.ts": "맨 tsx 실행 — 붙이려면 스텁 tsconfig 로 실행법 변경이 선행",
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXT.test(name)) out.push(full)
  }
  return out
}

describe("LLM 사용량 계측 전수", () => {
  const files = ROOTS.flatMap((r) => walk(join(process.cwd(), r)))
    .filter((f) => CALLS_OPENAI.test(readFileSync(f, "utf8")))
    .map((f) => relative(process.cwd(), f).replace(/\\/g, "/"))

  it("스캔이 살아 있다 — 대상 0개면 아무것도 안 본 것이다", () => {
    expect(files.length).toBeGreaterThan(15)
    // SDK 경로가 실제로 스캔에 잡히는지 — 이게 빠지면 첫 판의 구멍이 그대로 다시 열린다.
    // (summarizer 가 아니라 래퍼다: summarizer 는 chatWithRetry 만 부르므로 SDK 흔적이 없다 — 그게 정상)
    expect(files).toContain("data/crawlers/core/openai-client.js")
  })

  it("openai 를 부르는 파일은 사용량을 남긴다", () => {
    const missing = files
      .filter((f) => !(f in EXEMPT))
      .filter((f) => !INSTRUMENTED.test(readFileSync(join(process.cwd(), f), "utf8")))
    expect(
      missing,
      `계측 없이 openai 를 부르는 파일이다.\n` +
        `성공은 logUsage(task, model, data) / logUsageTokens(...), 실패는 logUsageFailure(task, model, reason).\n` +
        `정말 못 붙이는 자리면 이 시험의 EXEMPT 에 **이유와 함께** 등록하라.`
    ).toEqual([])
  })

  it("면제 목록에 죽은 항목이 없다 — 사라진 파일의 면제는 거짓말이다", () => {
    const stale = Object.keys(EXEMPT).filter((f) => !files.includes(f))
    expect(stale, "면제된 파일이 더는 openai 를 부르지 않는다. 목록에서 지워라.").toEqual([])
  })
})
