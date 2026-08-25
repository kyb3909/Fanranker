#!/usr/bin/env node
/**
 * 디자인 시스템 가드 (2026-08-25 Design System Rebuild).
 *
 * ## 왜 스크립트인가
 * 문서만 쓰면 다시 무너진다. 2026-08-25 감사에서 확인된 실측이 그 증거다 —
 * 토큰 파일이 5개나 있는데도 유저 지면 TSX 안에 **raw hex 677회 / 185종**이 있었고,
 * 브랜드 와인색이 `#961e37` 과 `#8b1e3f` **두 값**으로 갈려 있었다(심지어 후자가
 * `var(--wc-burgundy)` 의 폴백으로 박혀 있어 토큰과 어긋났다).
 *
 * 그래서 **기계가 세게 한다**. 사람이 리뷰에서 놓쳐도 이 스크립트는 안 놓친다.
 *
 * ## 래칫(ratchet) 방식 — 전면 금지가 아니다
 * 지금 677곳을 한 번에 고치는 건 regression 위험이 너무 크다. 대신 **현재 숫자를
 * 상한으로 박아 두고, 늘어나면 실패**시킨다. 줄면 상한을 내려 다시 잠근다.
 * "새 코드가 더 나빠지지 않는다" 만 보장해도 시스템은 서서히 회복한다.
 *
 * 사용:
 *   node scripts/check-design-tokens.mjs           # 검사
 *   node scripts/check-design-tokens.mjs --report  # 위반 위치까지 출력
 *   node scripts/check-design-tokens.mjs --update  # 현재 값으로 상한 재설정(줄었을 때만)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { execSync } from "node:child_process"

const BUDGET_FILE = "scripts/design-token-budget.json"

/**
 * ⚠️ 검사 대상은 **유저가 보는 지면만**이다.
 *    - `app/admin`, `app/dev`, `app/design-demo`, `app/design-preview` = 내부 도구·실험실.
 *      여기까지 조이면 실험이 막히고, 정작 유저 지면의 신호가 노이즈에 묻힌다.
 *    - `components/ui` = shadcn base. 여기가 raw 값을 갖는 건 **정상**이다 —
 *      토큰을 실제 CSS 로 바꾸는 곳이 어딘가는 있어야 한다.
 */
const EXCLUDE = [
  "app/admin",
  "app/admin2",
  "app/dev/",
  "app/design-demo",
  "app/design-preview",
  "components/ui/",
]

/** 오탐 제거: React 에러 URL(`react.dev/errors/418`)이 hex 로 잡힌다 */
const NOISE = [/react\.dev\/errors\/\d+/g, /https?:\/\/\S+/g]

const RULES = {
  /** raw hex 색상 — 토큰(var(--…)) 대신 값이 직접 박힌 것 */
  rawHex: {
    label: "raw hex 색상",
    re: /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g,
    hint: "var(--wc-*) 토큰을 쓰세요. 새 색이 정말 필요하면 wc-tokens.css 에 토큰부터 추가.",
  },
  /** 임의 폰트 크기 — 정해진 스케일(12/13/14/16/20/26/31/42) 밖 */
  offScaleText: {
    label: "스케일 밖 폰트 크기",
    re: /\btext-\[(\d+(?:\.\d+)?)px\]/g,
    filter: (m) => !["12", "13", "14", "16", "20", "26", "31", "42"].includes(m[1]),
    hint: "타이포 스케일은 12/13/14/16/20/26/31/42 입니다 (docs/design-system/TYPOGRAPHY.md).",
  },
  /** 임의 spacing */
  arbitrarySpacing: {
    label: "임의 spacing",
    re: /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-\[[\d.]+(?:px|rem)\]/g,
    hint: "Tailwind 기본 스케일(p-2, gap-3 …)을 쓰세요.",
  },
  /** !important — 시스템을 우회하는 가장 흔한 수단 */
  important: {
    label: "!important",
    re: /!important/g,
    hint: "override 대신 토큰이나 variant 로 푸세요.",
  },
}

function sourceFiles() {
  const out = execSync('find app components -name "*.tsx"', { encoding: "utf8", maxBuffer: 1 << 26 })
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => !EXCLUDE.some((e) => f.includes(e)))
}

function scan() {
  const counts = {}
  const hits = {}
  for (const key of Object.keys(RULES)) {
    counts[key] = 0
    hits[key] = []
  }

  for (const file of sourceFiles()) {
    let text
    try {
      text = readFileSync(file, "utf8")
    } catch {
      continue
    }
    for (const n of NOISE) text = text.replace(n, "")
    const lines = text.split("\n")

    for (const [key, rule] of Object.entries(RULES)) {
      lines.forEach((line, i) => {
        for (const m of line.matchAll(rule.re)) {
          if (rule.filter && !rule.filter(m)) continue
          counts[key]++
          if (hits[key].length < 40) hits[key].push(`${file}:${i + 1}  ${m[0]}`)
        }
      })
    }
  }
  return { counts, hits }
}

const { counts, hits } = scan()
const report = process.argv.includes("--report")
const update = process.argv.includes("--update")

const budget = existsSync(BUDGET_FILE) ? JSON.parse(readFileSync(BUDGET_FILE, "utf8")) : null

if (!budget || update) {
  const next = { ...counts, _updatedAt: new Date().toISOString().slice(0, 10) }
  if (budget) {
    // ⚠️ 상한은 **내려가기만** 한다. 늘어난 값을 그대로 굳히면 래칫이 아니라 백기다.
    for (const k of Object.keys(counts)) {
      if (budget[k] != null && counts[k] > budget[k]) {
        console.error(
          `✗ ${RULES[k].label}: ${counts[k]} > 상한 ${budget[k]} — 늘어난 상태로는 --update 할 수 없습니다.`
        )
        process.exit(1)
      }
    }
  }
  writeFileSync(BUDGET_FILE, JSON.stringify(next, null, 2) + "\n")
  console.log(`상한을 기록했습니다 → ${BUDGET_FILE}`)
  for (const [k, v] of Object.entries(counts)) console.log(`  ${RULES[k].label}: ${v}`)
  process.exit(0)
}

let failed = false
console.log("디자인 시스템 가드 (유저 지면 TSX)\n")
for (const [k, rule] of Object.entries(RULES)) {
  const now = counts[k]
  const cap = budget[k] ?? now
  const ok = now <= cap
  if (!ok) failed = true
  const arrow = now < cap ? ` (▼ ${cap - now} 감소 — --update 로 상한을 잠그세요)` : ""
  console.log(`${ok ? "✓" : "✗"} ${rule.label.padEnd(18)} ${String(now).padStart(4)} / 상한 ${cap}${arrow}`)
  if (!ok) {
    console.log(`    → ${rule.hint}`)
    hits[k].slice(0, 10).forEach((h) => console.log(`      ${h}`))
  } else if (report) {
    hits[k].slice(0, 10).forEach((h) => console.log(`      ${h}`))
  }
}

if (failed) {
  console.log(
    "\n새로 추가된 값이 상한을 넘었습니다. docs/design-system/DESIGN_SYSTEM.md 를 확인하세요."
  )
  process.exit(1)
}
console.log("\n통과 — 디자인 시스템 예산 안입니다.")
