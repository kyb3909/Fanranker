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
 * ## 면제 목록에 이유를 같이 적는 이유
 * 이유 없는 면제는 다음 사람이 지워도 되는지 판단할 수 없다. 그리고 면제 항목이 실제로
 * 존재하는지도 함께 검사한다 — 파일이 사라졌는데 면제만 남으면 목록이 거짓말을 한다.
 */

const ROOTS = ["app", "lib", "scripts", "data"]
const EXT = /\.(ts|tsx|mjs|js)$/
const SKIP = new Set(["node_modules", ".next", "dist", "build", ".turbo"])

/** 계측했다고 볼 수 있는 흔적 */
const INSTRUMENTED = /\b(logUsage|logUsageTokens|logUsageFailure|openaiChat)\b/

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

  // ⚠️ tsx 로 도는 수동 CLI 는 계기판을 못 쓴다. `lib/llm/usage-log.ts` 첫 줄이
  //    `import "server-only"` 인데, 그 패키지는 react-server 조건이 없는 런타임에서
  //    **throw 한다**(2026-09-02 실측). 우회하려면 계측기를 한 벌 더 만들어야 하고,
  //    그러면 VPS 복제본과 같은 드리프트 표면이 하나 더 생긴다. 손으로 돌리는 스크립트는
  //    사람이 출력을 보고 있으므로 대시보드 가치도 낮다 — 안 하는 쪽을 택했다.
  "scripts/draft-squad-names.ts": "수동 CLI — tsx 에서 server-only 가 throw",
  "scripts/reddit-daily-seed.ts": "수동 CLI — tsx 에서 server-only 가 throw",
  "scripts/seed-replies.ts": "수동 CLI — tsx 에서 server-only 가 throw",
  "scripts/_eval-tarot.ts": "평가용 CLI — tsx 에서 server-only 가 throw",

  // ⚠️ 이건 면제가 아니라 **고장**이다. `@/lib/naming/verify`(server-only)를 import 해서
  //    import 단계에서 throw 한다 — 지금 상태로는 아예 실행되지 않는다. package.json 에도
  //    vercel.json 에도 안 걸려 있다. 고치거나 지우는 건 별건으로 남긴다.
  "scripts/harvest-team-notation.ts": "현재 실행 불가(server-only throw) — 별건",
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
    .filter((f) => readFileSync(f, "utf8").includes("api.openai.com/v1/chat"))
    .map((f) => relative(process.cwd(), f).replace(/\\/g, "/"))

  it("스캔이 살아 있다 — 대상 0개면 아무것도 안 본 것이다", () => {
    expect(files.length).toBeGreaterThan(15)
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
