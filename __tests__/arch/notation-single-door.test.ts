import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

/**
 * 아키텍처 가드 — 표기 사전에는 문이 하나다.
 *
 * ## 왜 이 테스트가 존재하는가
 * 2026-08-09 하루에 표기 사고가 다섯 번 났다. 감독 이름이 4중 방어를 통과했고,
 * 매체명이 영·한으로 섞여 68건 나갔고, 사전이 1,000행에서 조용히 잘렸고,
 * 네이버가 오답을 근거와 함께 확정했고, 그걸 잡을 표기 감시 자체가 사각이었다.
 *
 * 원인은 전부 같았다 — **사전은 하나인데 읽는 경로가 7개였고 전부 제각각이었다.**
 * category 필터도, 페이징 유무도, 검사 범위(제목/본문)도, 최소 글자수도, 실패 처리도
 * 경로마다 달랐다. 그래서 매번 *다르게* 틀렸고, 다섯 번 다 사람이 눈으로 찾았다.
 *
 * 개별 버그는 다 고쳤다. 하지만 **8번째 경로가 또 다르게 틀리는 것**은 코드를 정리한다고
 * 막히지 않는다. 그래서 규칙을 테스트로 굳힌다: 뉴스 경로에서 사전을 직접 읽지 마라.
 *
 * ## 실패했다면
 * `news_alias_dictionary` 를 직접 쓰지 말고 `@/lib/news/notation` 에서 받아 써라.
 * 정말로 예외가 필요하면 아래 ALLOWED 에 **이유와 함께** 추가하라 — 그 목록이
 * "왜 여기만 직접 읽는가"의 유일한 설명이 된다.
 */

/**
 * 실제 **접근**만 잡는다. 주석·타입 정의(database.types.ts)의 단순 언급까지 잡으면
 * 가드가 시끄러워지고, 시끄러운 가드는 곧 무시당한다 — 그러면 없느니만 못하다.
 */
const ACCESS_RE = /\.from\(\s*["']news_alias_dictionary["']\s*\)/
const ROOT = process.cwd()
const SCAN_DIRS = ["lib", "app", "scripts"]

/**
 * 직접 접근이 허용된 파일과 그 이유.
 * ⚠️ 새로 추가할 때는 "왜 notation 을 못 쓰는가"를 반드시 적을 것.
 */
const ALLOWED: Record<string, string> = {
  // ── 표기 모듈 자신 ──
  "lib/news/dictionary-fetch.ts": "전량 조회 트랜스포트 — notation 모듈만 이걸 부른다",

  // ── 쓰기 경로 (읽기 정책과 별개) ──
  "lib/news/naming-verify-loop.ts": "네이버 검증 결과 등재/별칭 흡수 — 쓰기",
  "lib/news/learn-corrections.ts": "운영자 수정 diff 학습 등재 — 쓰기",
  "app/api/admin/player-dictionary/route.ts": "운영자 1클릭 사전 CRUD — 쓰기",
  "app/api/admin/published-fixes/route.ts": "발행분 교정 시 별칭 등재 — 쓰기",
  "scripts/seed-naver-player-notation.ts":
    "네이버 스포츠 정본 시드 CLI — 쓰기(읽기는 loadNotation 사용)",
  "scripts/harvest-team-notation.ts": "팀 뉴스 수확 시드 CLI — 쓰기(읽기는 loadNotation 사용)",
  "lib/dictionary/sync-news.ts":
    "스쿼드 사전 → 뉴스 사전 단방향 동기화 — 쓰기. 읽기는 '이미 있는지' 존재 확인뿐이고" +
    " 표기 판정에 쓰지 않는다(덮어쓰지 않고 없는 것만 넣는다). notation 모듈은 기사 본문" +
    " 치환용 뷰라 여기서 필요한 '전체 목록 대조' 를 못 준다.",
  "scripts/seed-dictionary-from-squads.ts":
    "스쿼드 수확분 시드 CLI — 쓰기(읽기는 loadNotation 사용, 신규 신원만)",
  "scripts/sync-team-shorts-to-notation.ts":
    "팀 통칭 동기화 CLI — 쓰기(읽기는 loadNotation 사용, team 한정)",

  // ── 사가: 의도적으로 별개 정책 ──
  // 사가는 선수 이적이라 player 한정이다. 감독을 섞으면 무인 사서를 폐지시킨
  // 오염("은퇴 레전드·감독을 선수로")이 재발한다. 뉴스 표기와 합치지 말 것.
  "lib/saga/publish.ts": "사가 인물 식별 — player 한정(의도적)",
  "app/api/cron/saga-extract/route.ts": "사가 추출 — player 한정(의도적)",
  "scripts/saga-backfill-dryrun.ts": "사가 백필 CLI — player 한정(의도적)",
  "scripts/saga-drain-queue.ts": "사가 큐 처리 CLI — player 한정(의도적)",
  "scripts/saga-seed-aliases.ts": "사가 별칭 시드 CLI — player 한정(의도적)",
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(full)
  }
  return out
}

describe("아키텍처: 표기 사전은 문이 하나다", () => {
  const offenders = walk(join(ROOT, SCAN_DIRS[0]))
    .concat(walk(join(ROOT, SCAN_DIRS[1])), walk(join(ROOT, SCAN_DIRS[2])))
    .filter((f) => ACCESS_RE.test(readFileSync(f, "utf8")))
    .map((f) => relative(ROOT, f).split(sep).join("/"))

  it("notation 모듈 밖에서 news_alias_dictionary 를 직접 읽지 않는다", () => {
    const unexpected = offenders.filter((f) => !ALLOWED[f] && !f.startsWith("lib/news/notation/"))
    expect(
      unexpected,
      `표기 사전을 직접 쓰는 새 경로가 생겼다. @/lib/news/notation 에서 받아 쓰거나, ` +
        `정말 예외라면 이 테스트의 ALLOWED 에 이유와 함께 등록하라.\n` +
        `(이 규칙이 없던 시절 경로가 7개로 갈라져 하루에 표기 사고가 다섯 번 났다)`
    ).toEqual([])
  })

  it("ALLOWED 목록에 죽은 항목이 없다 — 예외는 실제로 쓰이는 것만 남긴다", () => {
    const stale = Object.keys(ALLOWED).filter((f) => !offenders.includes(f))
    expect(stale, "ALLOWED 에 있는데 실제로는 사전을 안 쓰는 파일 — 목록에서 지워라").toEqual([])
  })
})
