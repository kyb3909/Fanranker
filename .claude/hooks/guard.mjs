#!/usr/bin/env node
/**
 * 실행 전 차단 훅 (PreToolUse) — 2026-08-26.
 *
 * ## 왜 권한 규칙이 아니라 훅인가
 * `permissions.deny` 의 Bash 규칙은 **명령 앞부분 일치**로 동작한다. 그래서
 * `git push` 를 막아도 `git -C '<경로>' push` 는 통과한다 — 실제로 정리 전 권한
 * 파일에 두 형태가 **둘 다 허용**으로 박혀 있었다. 훅은 명령 문자열 전체를 본다.
 *
 * 또 하나: 권한 규칙은 MCP 도구의 **인자를 못 본다**. `mcp__supabase__execute_sql`
 * 을 통째로 허용하거나 통째로 막는 것밖에 못 하는데, 읽기 조회는 상시 쓰고
 * 쓰기는 위험하다. 인자를 볼 수 있는 자리는 여기뿐이다.
 *
 * CLAUDE.md 에 "push 금지"라고 적는 것만으로는 강제되지 않는다. 여기가 강제하는 자리다.
 *
 * ⚠️ 정규식 한 방으로 잡으려다 실패했다 (실측): 따옴표 안의 공백 때문에
 *    `git -C '<공백 있는 경로>' push` 가 새고, 반대로 `git commit -m "push 버튼"` 은
 *    헛짚는다. 그래서 **따옴표 구간을 먼저 지우고 → 첫 하위명령을 찾는다**.
 */
let raw = ""
process.stdin.on("data", (c) => (raw += c))
process.stdin.on("end", () => {
  let ev = {}
  try {
    ev = JSON.parse(raw || "{}")
  } catch {
    process.exit(0) // 입력을 못 읽으면 통과 — 훅이 작업을 막는 쪽으로 고장나면 안 된다
  }

  /** 되돌릴 수 없는 것만 막는다 */
  const block = (why) => {
    process.stderr.write(why + "\n")
    process.exit(2)
  }

  /** 막지 않고 사람에게 묻는다 — 정당한 쓰임이 있는 동작에 차단은 과하다 */
  const confirm = (why) => {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: why,
        },
      })
    )
    process.exit(0)
  }

  // ── ① MCP 로 나가는 SQL ────────────────────────────────────────────────
  if (ev?.tool_name === "mcp__supabase__execute_sql") {
    const q = String(ev?.tool_input?.query ?? "")
    const hit =
      /\b(drop\s+(table|schema|database|view|function|policy|trigger|index)|truncate|alter\s+table\s+\S+\s+drop|delete\s+from|update\s+\S+\s+set|grant\s|revoke\s)/i.exec(
        q
      )
    if (hit) {
      confirm(
        `프로덕션 DB 에 쓰기/파괴 SQL 이다 (${hit[0].trim()}). 되돌릴 방법이 있는지 확인하고 승인할 것.\n` +
          `스키마 변경이라면 supabase/migrations/ 에 파일로 남기는 편이 맞다.`
      )
    }
    process.exit(0)
  }

  const cmd = String(ev?.tool_input?.command ?? "")
  if (!cmd) process.exit(0)

  // ── ② git push ────────────────────────────────────────────────────────
  /**
   * heredoc 본문도 데이터다 — 지우고 본다.
   * ⚠️ 실측: 이 훅을 도입한 커밋 자체가 막혔다. 커밋 메시지 본문에 "git push" 를
   *    설명으로 적었더니 명령으로 읽혔다. 데이터에 낱말이 들어갔다고 막으면 안 된다.
   */
  const noHeredoc = (() => {
    let s = cmd
    const open = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/g
    let m
    const cuts = []
    while ((m = open.exec(s))) {
      const close = new RegExp(`^\\s*${m[2]}\\s*$`, "m")
      const rest = s.slice(m.index)
      const c = close.exec(rest.slice(m[0].length))
      cuts.push([m.index, c ? m.index + m[0].length + c.index + c[0].length : s.length])
    }
    for (const [a, b] of cuts.reverse()) s = s.slice(0, a) + " " + s.slice(b)
    return s
  })()

  /**
   * 따옴표 안은 데이터지 명령이 아니다 — 지우고 본다.
   * ⚠️ 단, 실행파일 경로 자체가 따옴표에 싸이는 경우가 있다
   *    (`'C:\Program Files\Git\bin\git.exe' push` — 공백 있는 경로라 따옴표가 필수다).
   *    통째로 지우면 git 이 사라져 그냥 샌다. 실측으로 잡은 구멍이다.
   */
  const bare = noHeredoc.replace(/'([^']*)'|"([^"]*)"/g, (_m, a, b) =>
    /[/\\]git(\.exe)?$/i.test(a ?? b ?? "") ? " git " : " "
  )

  /** git 하위명령 — 이 중 **처음 나온 것**이 그 호출의 정체다 */
  const SUB = new Set(
    (
      "add am apply archive bisect blame branch cat-file check-attr check-ignore checkout cherry-pick clean clone " +
      "commit config describe diff fetch for-each-ref fsck gc grep init log ls-files ls-remote ls-tree merge mv " +
      "notes pull push rebase reflog remote reset restore rev-list rev-parse rm shortlog show sparse-checkout " +
      "stash status submodule switch symbolic-ref tag update-index worktree"
    ).split(" ")
  )

  for (const seg of bare.split(/[;&|\n]+/)) {
    const tok = seg.trim().split(/\s+/).filter(Boolean)
    const gi = tok.findIndex((t) => t === "git" || /[/\\]git(\.exe)?$/.test(t))
    if (gi < 0) continue
    if (tok.slice(gi + 1).find((t) => SUB.has(t)) === "push") {
      block(
        "차단: git push 는 이 저장소에서 금지다 (CLAUDE.md). 커밋까지만 하고 사용자가 직접 push 한다.\n" +
          "사용자가 이번에 명시적으로 push 를 지시했다면, 그 사실을 말하고 사용자에게 직접 실행을 요청할 것."
      )
    }
  }

  // ── ③ Management API 로 나가는 파괴적 SQL ──────────────────────────────
  const toMgmtApi = /api\.supabase\.com\/v1\/projects\/[^/\s"']+\/database\/query/.test(noHeredoc)
  const destructive =
    /\b(drop\s+(table|schema|database|function|policy)|truncate|delete\s+from|alter\s+table\s+\S+\s+drop)/i.test(noHeredoc)
  if (toMgmtApi && destructive) {
    block(
      "차단: 프로덕션 Supabase 에 파괴적 SQL 을 직접 쏘려 한다.\n" +
        "스키마 변경은 supabase/migrations/ 에 파일로 남기고 apply_migration 으로 적용할 것 — 되돌릴 기록이 남아야 한다."
    )
  }

  // ── ④ 환경파일 삭제 — 복구 경로가 없다 ────────────────────────────────
  if (/\brm\b[^;&|]*\s\.env(\.|\s|$)/.test(noHeredoc)) {
    block("차단: .env 계열 파일 삭제. 복구 경로가 없다 — 정말 필요하면 사용자가 직접 지운다.")
  }

  process.exit(0)
})
