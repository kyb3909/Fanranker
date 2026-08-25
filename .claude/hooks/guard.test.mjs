/**
 * 차단 훅 시험 — `node .claude/hooks/guard.test.mjs`
 *
 * ⚠️ 이 시험을 셸 한 줄로 인라인 실행하면 **훅이 그 명령 자체를 차단한다**
 *    (시험 데이터에 파괴적 SQL 문자열이 들어 있으니까). 파일로 두는 이유다.
 *
 * 훅은 조용히 고장나기 쉽다 — 통과시키는 방향으로 망가지면 아무 증상이 없다.
 * 그래서 "막아야 할 것"과 "막으면 안 될 것"을 같이 세워 둔다.
 */
import { spawnSync } from "node:child_process"

const HOOK = ".claude/hooks/guard.mjs"

function ask(event) {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(event) })
  if (r.status === 2) return "차단"
  return String(r.stdout).includes('"ask"') ? "확인" : "통과"
}

const B = (command) => ({ tool_name: "Bash", tool_input: { command } })
const SQL = (query) => ({ tool_name: "mcp__supabase__execute_sql", tool_input: { query } })

const MGMT = "https://api.supabase.com/v1/projects/ekys/database/query"
const DROP = ["DROP", "TABLE posts"].join(" ") // 문자열을 쪼개 둔다 — 이 파일 자체가 걸리지 않게

const cases = [
  // git push — 어떻게 적든 걸려야 한다
  [B("git push"), "차단"],
  [B("git push origin main"), "차단"],
  [B("git push --force-with-lease"), "차단"],
  [B("git -C '/d/Projects/새 폴더/adding(test)/community' push"), "차단"],
  [B('git -C "D:/Projects/새 폴더/adding(test)/community" push origin main'), "차단"],
  [B("git -c user.name=x push"), "차단"],
  [B("git --git-dir=.git push"), "차단"],
  [B("cd foo && git push"), "차단"],
  [B("pnpm build && git push -u origin HEAD"), "차단"],
  [B("/usr/bin/git push"), "차단"],
  [B("'C:\\Program Files\\Git\\bin\\git.exe' push"), "차단"],

  // 헛짚으면 안 되는 것 — push 라는 낱말이 데이터로 들어간 경우
  [B('git commit -m "push the button"'), "통과"],
  [B("git commit -m 'chore: push 준비'"), "통과"],
  [B("git log --grep push"), "통과"],
  [B("git status"), "통과"],
  [B("git add . && git commit -m 'fix'"), "통과"],
  [B("pnpm push-notify"), "통과"],
  [B("gh pr create --title 'push'"), "통과"],
  [B("legit --help"), "통과"],

  // heredoc 본문은 데이터다 — 이 훅을 도입한 커밋 자체가 여기 걸렸다 (실측)
  [B("git commit -F- <<'MSG'\nchore: 훅 도입\n\ngit push 를 막는다.\nMSG"), "통과"],
  [B('git commit -F- <<MSG\n설명에 git push 가 나온다\nMSG'), "통과"],
  [B("cat <<'EOF' > note.txt\nrm -f .env.local 을 막는다\nEOF"), "통과"],
  // 그렇다고 heredoc 뒤에 붙인 진짜 명령까지 놓치면 안 된다
  [B("cat <<'EOF' > note.txt\n설명\nEOF\ngit push"), "차단"],

  // Management API 로 나가는 파괴적 SQL
  [B(`curl -X POST ${MGMT} -d '{"query":"${DROP}"}'`), "차단"],
  [B(`curl ${MGMT} -d 'select 1'`), "통과"],

  // .env 삭제
  [B("rm -f .env.local"), "차단"],
  [B("rm -rf node_modules"), "통과"],
  [B("rm scripts/_tmp.env.ts"), "통과"],

  // MCP SQL — 읽기는 통과, 쓰기는 확인
  [SQL("select * from posts limit 5"), "통과"],
  [SQL("SELECT count(*) FROM betman_games WHERE status = 'finished'"), "통과"],
  [SQL("with x as (select 1) select * from x"), "통과"],
  [SQL("delete from prediction_slips where id = '1'"), "확인"],
  [SQL(DROP), "확인"],
  [SQL("update posts set title = 'x' where id = 1"), "확인"],
  [SQL("truncate lfa_day_cache"), "확인"],
  [SQL("grant select on posts to anon"), "확인"],
]

let failed = 0
for (const [event, want] of cases) {
  const got = ask(event)
  const ok = got === want
  if (!ok) failed++
  const label = event.tool_input.command ?? event.tool_input.query
  console.log(`${ok ? "  " : "✗ "}${got.padEnd(3)}  ${label.slice(0, 66)}`)
}

console.log(failed ? `\n실패 ${failed}건 / ${cases.length}` : `\n전부 기대대로 (${cases.length}건)`)
process.exit(failed ? 1 : 0)
