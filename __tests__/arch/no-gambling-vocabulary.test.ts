import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

/**
 * 아키텍처 가드 — 유저에게 보이는 곳에 도박 어휘를 쓰지 않는다.
 *
 * ## 왜 이 테스트가 존재하는가
 * 카카오 비즈앱 심사에서 우리 소명은 "금전 베팅을 제공하지 않는다"이다(약관 제6조의2).
 * 화면에 '베팅'이 찍혀 있으면 그 소명이 스스로 무너진다.
 *
 * 그런데 이 어휘는 **두 번 새어 나왔다**:
 *   · 2026-07-29 1차 정비 — `.tsx` 만 훑어 API 응답·훅 문구 13곳을 놓쳤다(거버넌스가 적발)
 *   · 2026-08-10 3차 점검 — 그러고도 라이브 공개 페이지 2곳이 남아 있었다
 *       `/saga` PageBand "결말에 **베팅**하세요" (심사자 착지 가능)
 *       `/design-demo/success-modal` "3볼 **베팅** 완료!" (미들웨어 차단 없음 = 공개)
 *
 * 사람이 grep 으로 훑는 방식은 매번 다른 곳을 놓쳤다. 그래서 테스트로 굳힌다.
 *
 * ## 실패했다면
 * 유저에게 보이는 문자열이면 어휘를 바꿔라: 베팅/배팅 → 예측, 배당 → 점수 배율.
 * 주석·admin·약관 선언은 애초에 검사 대상이 아니다(아래 참조). 그 외 정당한 예외는
 * ALLOWED 에 **이유와 함께** 등록하라.
 */

/** 유저 노출 시 문제가 되는 어휘. '프로토타입'은 도박 용어가 아니므로 경계를 둔다. */
const BANNED = /베팅|배팅|프로토(?!타입)/

/**
 * 어휘가 아니라 **말투**로 새는 도박 색채 (2026-08-12 운영자 지적: "가입하면 무료 10볼
 * — 이 부분은 베팅 색채가 너무 난다").
 *
 * 금지 단어를 하나도 안 쓰고도 도박 사이트가 되는 방법이 둘 있고, 우리는 둘 다 쓰고 있었다:
 *
 *  1. **판돈을 거는 동사** — "픽을 걸다", "오늘 픽 걸러 가기", "오늘 안 걸면".
 *     '걸다'는 판돈을 거는 그 동사다. '예측하다'로 쓰면 같은 뜻이 전달되면서 색채만 빠진다.
 *  2. **웰컴 보너스 구조** — "가입하면 무료 10볼". 가입 대가로 칩을 지급한다는 카지노 문법.
 *     볼이 무료라는 사실 자체는 오히려 소명에 유리하므로(현금 아님) 지우지 않는다.
 *     지우는 건 "가입하면 준다"는 **거래 구조**다 — 혜택은 '오늘 경기를 예측할 수 있다'로.
 *
 * ⚠️ 이 패턴들은 좁게 잡았다. '걸다'는 일상어라("전화를 걸다", "링크를 걸다")
 * 넓게 잡으면 오탐이 쏟아진다. 그래서 세 가지 꼴만 잡는다:
 *   · 픽·볼이 목적어로 붙은 '걸다'        — "픽을 걸", "볼 걸"
 *   · 목적어가 생략된 판돈 관용구          — "안 걸면", "걸러 가"
 *   · 가입/로그인 대가로 볼을 준다는 구조   — "가입하면 무료 10볼"
 * 실제로 이 저장소에 있던 옛 문구 6종으로 검증했다(4종만 잡히던 초안을 넓힌 결과).
 */
const BANNED_FRAMING =
  /(픽|볼)\s*(을|를)?\s*걸|안\s*걸(면|고)|걸러\s*가|(가입|로그인)[^"']{0,12}무료\s*\d+\s*볼/

const ROOT = process.cwd()
const SCAN_DIRS = ["app", "components", "hooks", "lib"]

/**
 * 검사에서 빼는 파일과 그 이유.
 * ⚠️ 추가할 때는 "왜 유저에게 안 보이는가"를 반드시 적을 것.
 */
const ALLOWED: Record<string, string> = {
  "components/legal/terms-content.tsx":
    "약관 제6조의2 — '금전 베팅을 제공하지 않는다' 선언 자체. 지우면 소명이 사라진다",
  "lib/news/quality-gate.ts": "LLM 검사 프롬프트 — '도박/베팅 사이트 홍보 차단' 규칙문",
  "lib/tarot/safety.ts":
    "타로 도박 유도 질문 탐지 패턴 — 막으려면 그 단어를 알아야 한다(유저 노출 아님)",
}

/**
 * 주석을 걷어낸 코드만 남긴다 — 주석은 화면에 안 나온다.
 * 전체 주석 줄, JSX 주석(빌드에서 제거됨), **줄 끝 주석**을 모두 처리한다.
 * 줄 끝 주석을 놓쳤다가 `const X = 5 // 배팅 경기 목록` 을 오탐한 적이 있다.
 * `//` 앞이 `:` 이면 URL(`https://`)이므로 자르지 않는다.
 */
function codeOnly(line: string): string {
  const t = line.trim()
  if (
    t.startsWith("//") ||
    t.startsWith("*") ||
    t.startsWith("/*") ||
    t.startsWith("{/*") ||
    t === "*/"
  ) {
    return ""
  }
  return line.replace(/(^|[^:])\/\/.*$/, "$1")
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
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

describe("아키텍처: 유저 화면에 도박 어휘가 없다", () => {
  const hits: string[] = []
  const framingHits: string[] = []

  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const rel = relative(ROOT, file).split(sep).join("/")
      // 어드민은 운영자 전용 화면이라 심사 대상이 아니다
      if (rel.includes("/admin")) continue
      if (ALLOWED[rel]) continue

      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const code = codeOnly(line)
          if (BANNED.test(code)) hits.push(`${rel}:${i + 1}  ${line.trim()}`)
          if (BANNED_FRAMING.test(code)) framingHits.push(`${rel}:${i + 1}  ${line.trim()}`)
        })
    }
  }

  it("베팅·배팅·프로토가 유저 노출 문자열에 없다", () => {
    expect(
      hits,
      `도박 어휘가 유저에게 보이는 코드에 들어왔다.\n` +
        `카카오 심사 소명("금전 베팅 미제공", 약관 제6조의2)과 정면으로 모순된다.\n` +
        `→ 베팅/배팅은 '예측'으로 바꾸고, 정당한 예외라면 이 테스트의 ALLOWED 에 이유와 함께 등록하라.\n` +
        `(사람이 grep 으로 훑던 시절 같은 어휘가 두 번 새어 나갔다)`
    ).toEqual([])
  })

  it("판돈 말투·웰컴 보너스 구조가 유저 노출 문자열에 없다", () => {
    expect(
      framingHits,
      `금지 어휘는 안 썼지만 도박 사이트의 말투가 들어왔다.\n` +
        `→ "픽을 걸다/걸러 가기"는 판돈을 거는 동사다. '예측하다'로 바꿔라.\n` +
        `→ "가입하면 무료 10볼"은 카지노 웰컴 보너스 구조다. 혜택은 지급물이 아니라\n` +
        `   행동으로 말하라 — "가입하고 오늘 경기 예측하기".\n` +
        `   (볼이 무료라는 사실 자체는 소명에 유리하니 지우지 말 것. 지울 건 거래 구조다)`
    ).toEqual([])
  })

  it("ALLOWED 목록에 죽은 항목이 없다 — 예외는 실제로 필요한 것만 남긴다", () => {
    const stale = Object.keys(ALLOWED).filter((rel) => {
      try {
        return !readFileSync(join(ROOT, rel), "utf8")
          .split("\n")
          .some((line) => BANNED.test(codeOnly(line)))
      } catch {
        return true // 파일 자체가 사라졌으면 목록에서도 지워야 한다
      }
    })
    expect(stale, "ALLOWED 에 있는데 실제로는 해당 어휘가 없는 파일 — 목록에서 지워라").toEqual([])
  })
})
